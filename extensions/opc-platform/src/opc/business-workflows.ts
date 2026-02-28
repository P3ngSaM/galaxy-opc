/**
 * 星环OPC中心 — 业务闭环引擎
 *
 * 当 AI 调用 create_contract / add_transaction / add_employee 时，
 * 代码自动创建关联记录（联系人、项目、任务、里程碑、采购单、发票等），
 * 保证数据完整性，避免 AI 跳步骤或遗漏。
 *
 * 所有 workflow 方法在数据库事务中执行（BEGIN/COMMIT/ROLLBACK），
 * 任何一步失败则全部回滚，不会产生半成品数据。
 */

import type { OpcDatabase } from "../db/index.js";

/** 合法的合同方向值 */
export const VALID_DIRECTIONS = ["sales", "procurement", "outsourcing", "partnership"] as const;
export type ContractDirection = typeof VALID_DIRECTIONS[number];

/** 自动创建的记录摘要 */
export interface AutoCreated {
  module: string;    // "contact" | "project" | "task" | "milestone" | "procurement" | "hr" | "invoice"
  action: string;    // "created" | "updated"
  id: string;
  summary: string;   // 人类可读摘要
}

export class BusinessWorkflows {
  constructor(private db: OpcDatabase) {}

  /** 校验 direction 值是否合法 */
  static validateDirection(direction: string): direction is ContractDirection {
    return (VALID_DIRECTIONS as readonly string[]).includes(direction);
  }

  // ── 合同创建后（事务保护） ────────────────────────────────────
  afterContractCreated(contract: {
    id: string; company_id: string; title: string; counterparty: string;
    contract_type: string; direction: string; amount: number;
    start_date: string; end_date: string;
  }): AutoCreated[] {
    if (!BusinessWorkflows.validateDirection(contract.direction)) {
      throw new Error(`无效的合同方向「${contract.direction}」，合法值: ${VALID_DIRECTIONS.join(", ")}`);
    }

    return this.db.transaction(() => {
      return this._doAfterContractCreated(contract);
    });
  }

  // ── 交易创建后（事务保护） ────────────────────────────────────
  afterTransactionCreated(tx: {
    id: string; company_id: string; type: string; amount: number;
    counterparty: string; description: string;
  }): AutoCreated[] {
    return this.db.transaction(() => {
      return this._doAfterTransactionCreated(tx);
    });
  }

  // ── 员工添加后（事务保护） ────────────────────────────────────
  afterEmployeeAdded(emp: {
    id: string; company_id: string; employee_name: string; position: string;
    contract_type: string; salary: number;
  }): AutoCreated[] {
    return this.db.transaction(() => {
      return this._doAfterEmployeeAdded(emp);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 内部实现（在事务内执行）
  // ══════════════════════════════════════════════════════════════

  private _doAfterContractCreated(contract: {
    id: string; company_id: string; title: string; counterparty: string;
    contract_type: string; direction: ContractDirection; amount: number;
    start_date: string; end_date: string;
  }): AutoCreated[] {
    const results: AutoCreated[] = [];
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // 1. 联系人：精确匹配 name，不存在则创建，已存在则更新
    const tagMap: Record<ContractDirection, string[]> = {
      sales: ["客户"], procurement: ["供应商"],
      outsourcing: ["外包方"], partnership: ["合作伙伴"],
    };
    const tags = JSON.stringify(tagMap[contract.direction]);
    const existing = this.db.queryOne(
      "SELECT id FROM opc_contacts WHERE company_id = ? AND name = ?",
      contract.company_id, contract.counterparty,
    ) as { id: string } | null;

    if (existing) {
      this.db.execute(
        "UPDATE opc_contacts SET last_contact_date = ?, notes = notes || ?, updated_at = ? WHERE id = ?",
        today, `\n关联合同：${contract.title}，金额${contract.amount}元`, now, existing.id,
      );
      results.push({ module: "contact", action: "updated", id: existing.id,
        summary: `已更新联系人「${contract.counterparty}」的最近联系日期` });
    } else {
      const contactId = this.db.genId();
      this.db.execute(
        `INSERT INTO opc_contacts (id, company_id, name, company_name, tags, notes, last_contact_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        contactId, contract.company_id, contract.counterparty, contract.counterparty,
        tags, `通过合同「${contract.title}」建立关系，金额${contract.amount}元`,
        today, now, now,
      );
      results.push({ module: "contact", action: "created", id: contactId,
        summary: `已添加${tagMap[contract.direction][0]}「${contract.counterparty}」` });
    }

    // 2. 按方向分流
    if (contract.direction === "sales") {
      // 销售/服务合同 -> 建交付项目 + 任务
      const projectId = this.db.genId();
      const projName = `【交付】${contract.counterparty}-${contract.title.replace(/合同$/, "")}`;
      this.db.execute(
        `INSERT INTO opc_projects (id, company_id, name, description, status, start_date, end_date, budget, spent, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'planning', ?, ?, ?, 0, ?, ?)`,
        projectId, contract.company_id, projName,
        `关联合同ID：${contract.id}，合同金额：${contract.amount}元`,
        contract.start_date || today, contract.end_date || "", contract.amount, now, now,
      );
      results.push({ module: "project", action: "created", id: projectId, summary: `已创建交付项目「${projName}」` });

      const tasks = this._createDeliveryTasks(projectId, contract.company_id, contract.start_date || today, contract.end_date);
      for (const t of tasks) {
        results.push({ module: "task", action: "created", id: t.id, summary: `任务：${t.title}` });
      }

    } else if (contract.direction === "procurement") {
      const orderId = this.db.genId();
      this.db.execute(
        `INSERT INTO opc_procurement_orders (id, service_id, company_id, title, amount, status, order_date, notes, created_at)
         VALUES (?, '', ?, ?, ?, 'pending', ?, ?, ?)`,
        orderId, contract.company_id, `采购：${contract.title}`, contract.amount,
        today, `关联合同ID：${contract.id}`, now,
      );
      results.push({ module: "procurement", action: "created", id: orderId,
        summary: `已创建采购单，金额${contract.amount}元` });

    } else if (contract.direction === "outsourcing") {
      const hrId = this.db.genId();
      this.db.execute(
        `INSERT INTO opc_hr_records (id, company_id, employee_name, position, salary, social_insurance, housing_fund, start_date, contract_type, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, '外包', ?, 0, 0, ?, 'contractor', 'active', ?, ?, ?)`,
        hrId, contract.company_id, contract.counterparty, contract.amount,
        contract.start_date || today, `关联合同：${contract.title}`, now, now,
      );
      results.push({ module: "hr", action: "created", id: hrId,
        summary: `已添加外包人员「${contract.counterparty}」` });
    }
    // partnership: 只建联系人 + 里程碑

    // 3. 里程碑
    const msId = this.db.genId();
    const dirLabel: Record<ContractDirection, string> = {
      sales: "签约客户", procurement: "签订采购", outsourcing: "签约外包", partnership: "达成合作",
    };
    const msTitle = `${dirLabel[contract.direction]}${contract.counterparty}，${contract.amount}元${contract.title}`;
    this.db.execute(
      `INSERT INTO opc_milestones (id, company_id, title, category, target_date, status, description, created_at)
       VALUES (?, ?, ?, 'business', ?, 'completed', ?, ?)`,
      msId, contract.company_id, msTitle, today,
      `合同类型：${contract.contract_type}，方向：${contract.direction}，金额：${contract.amount}元`, now,
    );
    results.push({ module: "milestone", action: "created", id: msId, summary: `时间线：${msTitle}` });

    return results;
  }

  private _doAfterTransactionCreated(tx: {
    id: string; company_id: string; type: string; amount: number;
    counterparty: string; description: string;
  }): AutoCreated[] {
    const results: AutoCreated[] = [];
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // 支出交易且有交易对手 → 自动创建/更新供应商联系人
    if (tx.type === "expense" && tx.counterparty) {
      const existing = this.db.queryOne(
        "SELECT id FROM opc_contacts WHERE company_id = ? AND name = ?",
        tx.company_id, tx.counterparty,
      ) as { id: string } | null;

      if (existing) {
        this.db.execute(
          "UPDATE opc_contacts SET last_contact_date = ?, notes = notes || ?, updated_at = ? WHERE id = ?",
          today, `\n支出：${tx.description}，${tx.amount}元`, now, existing.id,
        );
        results.push({ module: "contact", action: "updated", id: existing.id,
          summary: `已更新供应商「${tx.counterparty}」最近联系日期` });
      } else {
        const contactId = this.db.genId();
        this.db.execute(
          `INSERT INTO opc_contacts (id, company_id, name, company_name, tags, notes, last_contact_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          contactId, tx.company_id, tx.counterparty, tx.counterparty,
          JSON.stringify(["供应商"]),
          `通过支出交易建立关系：${tx.description}，${tx.amount}元`,
          today, now, now,
        );
        results.push({ module: "contact", action: "created", id: contactId,
          summary: `已添加供应商「${tx.counterparty}」` });
      }
    }

    // 收入交易且有交易对手 → 自动创建/更新客户联系人
    if (tx.type === "income" && tx.counterparty) {
      const existing = this.db.queryOne(
        "SELECT id FROM opc_contacts WHERE company_id = ? AND name = ?",
        tx.company_id, tx.counterparty,
      ) as { id: string } | null;

      if (existing) {
        this.db.execute(
          "UPDATE opc_contacts SET last_contact_date = ?, notes = notes || ?, updated_at = ? WHERE id = ?",
          today, `\n收入：${tx.description}，${tx.amount}元`, now, existing.id,
        );
        results.push({ module: "contact", action: "updated", id: existing.id,
          summary: `已更新客户「${tx.counterparty}」最近联系日期` });
      } else {
        const contactId = this.db.genId();
        this.db.execute(
          `INSERT INTO opc_contacts (id, company_id, name, company_name, tags, notes, last_contact_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          contactId, tx.company_id, tx.counterparty, tx.counterparty,
          JSON.stringify(["客户"]),
          `通过收入交易建立关系：${tx.description}，${tx.amount}元`,
          today, now, now,
        );
        results.push({ module: "contact", action: "created", id: contactId,
          summary: `已添加客户「${tx.counterparty}」` });
      }
    }

    // 收入 -> 自动创建销项发票（含税拆分正确）
    if (tx.type === "income" && tx.amount > 0) {
      const invoiceId = this.db.genId();
      const taxRate = 0.06;
      const totalAmount = tx.amount;  // 到账金额 = 含税金额
      const pretaxAmount = Math.round(totalAmount / (1 + taxRate) * 100) / 100;
      const taxAmount = Math.round((totalAmount - pretaxAmount) * 100) / 100;
      this.db.execute(
        `INSERT INTO opc_invoices (id, company_id, type, counterparty, amount, tax_rate, tax_amount, total_amount, status, issue_date, notes, created_at)
         VALUES (?, ?, 'sales', ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
        invoiceId, tx.company_id, tx.counterparty || "", pretaxAmount, taxRate, taxAmount, totalAmount,
        today, `关联交易：${tx.description}`, now,
      );
      results.push({ module: "invoice", action: "created", id: invoiceId,
        summary: `已创建销项发票：含税${totalAmount}元，税额${taxAmount}元` });
    }

    // 大额交易 -> 里程碑
    if (tx.amount >= 5000) {
      const msId = this.db.genId();
      const label = tx.type === "income" ? "收到" : "支出";
      const msTitle = `${label}${tx.counterparty ? tx.counterparty + "款项" : ""}${tx.amount}元`;
      this.db.execute(
        `INSERT INTO opc_milestones (id, company_id, title, category, target_date, status, description, created_at)
         VALUES (?, ?, ?, 'finance', ?, 'completed', ?, ?)`,
        msId, tx.company_id, msTitle, today, tx.description || "", now,
      );
      results.push({ module: "milestone", action: "created", id: msId, summary: `时间线：${msTitle}` });
    }

    return results;
  }

  private _doAfterEmployeeAdded(emp: {
    id: string; company_id: string; employee_name: string; position: string;
    contract_type: string; salary: number;
  }): AutoCreated[] {
    const results: AutoCreated[] = [];
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const typeLabel = emp.contract_type === "contractor" ? "外包" :
                      emp.contract_type === "part_time" ? "兼职" :
                      emp.contract_type === "intern" ? "实习" : "全职";
    const msId = this.db.genId();
    const msTitle = `团队+1：${emp.employee_name}加入，担任${emp.position}（${typeLabel}）`;
    this.db.execute(
      `INSERT INTO opc_milestones (id, company_id, title, category, target_date, status, description, created_at)
       VALUES (?, ?, ?, 'team', ?, 'completed', ?, ?)`,
      msId, emp.company_id, msTitle, today,
      `月薪${emp.salary}元，用工类型：${emp.contract_type}`, now,
    );
    results.push({ module: "milestone", action: "created", id: msId, summary: `时间线：${msTitle}` });
    return results;
  }

  // ── 内部：创建标准交付任务 ──────────────────────────────────
  private _createDeliveryTasks(projectId: string, companyId: string, startDate: string, endDate: string) {
    const now = new Date().toISOString();
    const tasks = [
      { title: "需求确认与方案设计", priority: "high", dueOffset: 14, dueOffsetFromEnd: null as number | null },
      { title: "核心交付/开发", priority: "high", dueOffset: null as number | null, dueOffsetFromEnd: null as number | null },
      { title: "验收与交付", priority: "high", dueOffset: null as number | null, dueOffsetFromEnd: 14 },
      { title: "尾款收取与项目结项", priority: "medium", dueOffset: null as number | null, dueOffsetFromEnd: 0 },
    ];
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : null;
    const result: { id: string; title: string }[] = [];
    for (const t of tasks) {
      const id = this.db.genId();
      let dueDate = "";
      if (t.dueOffset != null) {
        const d = new Date(start); d.setDate(d.getDate() + t.dueOffset);
        dueDate = d.toISOString().slice(0, 10);
      } else if (t.dueOffsetFromEnd != null && end) {
        const d = new Date(end); d.setDate(d.getDate() - t.dueOffsetFromEnd);
        dueDate = d.toISOString().slice(0, 10);
      }
      this.db.execute(
        `INSERT INTO opc_tasks (id, project_id, company_id, title, description, assignee, priority, status, due_date, hours_estimated, hours_actual, created_at, updated_at)
         VALUES (?, ?, ?, ?, '', '', ?, 'todo', ?, 0, 0, ?, ?)`,
        id, projectId, companyId, t.title, t.priority, dueDate, now, now,
      );
      result.push({ id, title: t.title });
    }
    return result;
  }
}
