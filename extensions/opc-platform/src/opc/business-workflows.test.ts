/**
 * 星环OPC中心 — BusinessWorkflows 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteAdapter } from "../db/sqlite-adapter.js";
import { BusinessWorkflows, VALID_DIRECTIONS } from "./business-workflows.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("BusinessWorkflows", () => {
  let db: SqliteAdapter;
  let dbPath: string;
  let workflows: BusinessWorkflows;
  let companyId: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `opc-wf-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new SqliteAdapter(dbPath);
    workflows = new BusinessWorkflows(db);

    // 创建一个测试公司
    const company = db.createCompany({
      name: "测试科技公司",
      industry: "科技",
      owner_name: "张三",
      owner_contact: "13800138000",
      status: "active",
      registered_capital: 100000,
      description: "测试用公司",
    });
    companyId = company.id;
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + "-wal"); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + "-shm"); } catch { /* ignore */ }
  });

  // ══════════════════════════════════════════════════════════════
  // direction 校验
  // ══════════════════════════════════════════════════════════════

  describe("validateDirection", () => {
    it("should accept valid direction values", () => {
      for (const dir of VALID_DIRECTIONS) {
        expect(BusinessWorkflows.validateDirection(dir)).toBe(true);
      }
    });

    it("should reject invalid direction values", () => {
      expect(BusinessWorkflows.validateDirection("foo")).toBe(false);
      expect(BusinessWorkflows.validateDirection("")).toBe(false);
      expect(BusinessWorkflows.validateDirection("SALES")).toBe(false);
    });
  });

  describe("afterContractCreated — direction validation", () => {
    it("should throw on invalid direction", () => {
      expect(() => {
        workflows.afterContractCreated({
          id: "c1", company_id: companyId, title: "测试合同",
          counterparty: "客户A", contract_type: "服务合同",
          direction: "invalid", amount: 10000,
          start_date: "2025-01-01", end_date: "2025-06-30",
        });
      }).toThrow("无效的合同方向");
    });

    it("should not create any records when direction is invalid (rollback)", () => {
      try {
        workflows.afterContractCreated({
          id: "c1", company_id: companyId, title: "测试合同",
          counterparty: "客户A", contract_type: "服务合同",
          direction: "invalid", amount: 10000,
          start_date: "2025-01-01", end_date: "2025-06-30",
        });
      } catch { /* expected */ }

      // 验证没有残留数据
      const contacts = db.query("SELECT * FROM opc_contacts WHERE company_id = ?", companyId);
      const milestones = db.query("SELECT * FROM opc_milestones WHERE company_id = ?", companyId);
      expect(contacts).toHaveLength(0);
      expect(milestones).toHaveLength(0);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 销售合同闭环
  // ══════════════════════════════════════════════════════════════

  describe("afterContractCreated — sales", () => {
    it("should create contact + project + 4 tasks + milestone", () => {
      const results = workflows.afterContractCreated({
        id: "contract-1", company_id: companyId, title: "AI咨询服务合同",
        counterparty: "阿里巴巴", contract_type: "服务合同",
        direction: "sales", amount: 80000,
        start_date: "2025-03-01", end_date: "2025-05-31",
      });

      // 验证返回结果
      const modules = results.map(r => r.module);
      expect(modules).toContain("contact");
      expect(modules).toContain("project");
      expect(modules).toContain("milestone");
      expect(results.filter(r => r.module === "task")).toHaveLength(4);

      // 验证联系人已创建
      const contacts = db.query("SELECT * FROM opc_contacts WHERE company_id = ?", companyId) as { name: string; tags: string }[];
      expect(contacts).toHaveLength(1);
      expect(contacts[0].name).toBe("阿里巴巴");
      expect(contacts[0].tags).toContain("客户");

      // 验证项目已创建
      const projects = db.query("SELECT * FROM opc_projects WHERE company_id = ?", companyId) as { name: string; budget: number }[];
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toContain("【交付】");
      expect(projects[0].name).toContain("阿里巴巴");
      expect(projects[0].budget).toBe(80000);

      // 验证任务已创建
      const tasks = db.query("SELECT * FROM opc_tasks WHERE company_id = ?", companyId) as { title: string }[];
      expect(tasks).toHaveLength(4);
      const taskTitles = tasks.map(t => t.title);
      expect(taskTitles).toContain("需求确认与方案设计");
      expect(taskTitles).toContain("核心交付/开发");
      expect(taskTitles).toContain("验收与交付");
      expect(taskTitles).toContain("尾款收取与项目结项");

      // 验证里程碑
      const milestones = db.query("SELECT * FROM opc_milestones WHERE company_id = ?", companyId) as { title: string; category: string }[];
      expect(milestones).toHaveLength(1);
      expect(milestones[0].title).toContain("签约客户");
      expect(milestones[0].title).toContain("阿里巴巴");
      expect(milestones[0].category).toBe("business");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 采购合同闭环
  // ══════════════════════════════════════════════════════════════

  describe("afterContractCreated — procurement", () => {
    it("should create contact(供应商) + procurement order + milestone", () => {
      const results = workflows.afterContractCreated({
        id: "contract-2", company_id: companyId, title: "Adobe全家桶采购",
        counterparty: "Adobe", contract_type: "采购合同",
        direction: "procurement", amount: 5000,
        start_date: "2025-01-01", end_date: "2025-12-31",
      });

      const modules = results.map(r => r.module);
      expect(modules).toContain("contact");
      expect(modules).toContain("procurement");
      expect(modules).toContain("milestone");
      expect(modules).not.toContain("project"); // 采购不建项目

      // 验证联系人标签是供应商
      const contacts = db.query("SELECT * FROM opc_contacts WHERE company_id = ?", companyId) as { tags: string }[];
      expect(contacts[0].tags).toContain("供应商");

      // 验证采购单
      const orders = db.query("SELECT * FROM opc_procurement_orders WHERE company_id = ?", companyId) as { amount: number; title: string }[];
      expect(orders).toHaveLength(1);
      expect(orders[0].amount).toBe(5000);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 外包合同闭环
  // ══════════════════════════════════════════════════════════════

  describe("afterContractCreated — outsourcing", () => {
    it("should create contact(外包方) + HR record + milestone", () => {
      const results = workflows.afterContractCreated({
        id: "contract-3", company_id: companyId, title: "前端开发外包",
        counterparty: "小李", contract_type: "劳务合同",
        direction: "outsourcing", amount: 30000,
        start_date: "2025-02-01", end_date: "2025-04-30",
      });

      const modules = results.map(r => r.module);
      expect(modules).toContain("contact");
      expect(modules).toContain("hr");
      expect(modules).toContain("milestone");
      expect(modules).not.toContain("project");

      // 验证HR记录
      const hrs = db.query("SELECT * FROM opc_hr_records WHERE company_id = ?", companyId) as { employee_name: string; contract_type: string }[];
      expect(hrs).toHaveLength(1);
      expect(hrs[0].employee_name).toBe("小李");
      expect(hrs[0].contract_type).toBe("contractor");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 合作协议闭环
  // ══════════════════════════════════════════════════════════════

  describe("afterContractCreated — partnership", () => {
    it("should create contact(合作伙伴) + milestone only", () => {
      const results = workflows.afterContractCreated({
        id: "contract-4", company_id: companyId, title: "战略合作协议",
        counterparty: "腾讯", contract_type: "合作协议",
        direction: "partnership", amount: 0,
        start_date: "2025-01-01", end_date: "2025-12-31",
      });

      const modules = results.map(r => r.module);
      expect(modules).toContain("contact");
      expect(modules).toContain("milestone");
      expect(modules).not.toContain("project");
      expect(modules).not.toContain("procurement");
      expect(modules).not.toContain("hr");
      expect(results).toHaveLength(2); // contact + milestone

      const contacts = db.query("SELECT * FROM opc_contacts WHERE company_id = ?", companyId) as { tags: string }[];
      expect(contacts[0].tags).toContain("合作伙伴");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 联系人查重
  // ══════════════════════════════════════════════════════════════

  describe("contact dedup", () => {
    it("should update existing contact instead of creating duplicate", () => {
      // 第一次创建
      workflows.afterContractCreated({
        id: "c1", company_id: companyId, title: "合同A",
        counterparty: "阿里巴巴", contract_type: "服务合同",
        direction: "sales", amount: 50000,
        start_date: "2025-01-01", end_date: "2025-06-30",
      });

      // 第二次同一 counterparty
      const results2 = workflows.afterContractCreated({
        id: "c2", company_id: companyId, title: "合同B",
        counterparty: "阿里巴巴", contract_type: "服务合同",
        direction: "sales", amount: 30000,
        start_date: "2025-07-01", end_date: "2025-12-31",
      });

      // 应该是 updated 而不是 created
      const contactResult = results2.find(r => r.module === "contact");
      expect(contactResult?.action).toBe("updated");

      // 数据库中只有 1 个联系人
      const contacts = db.query("SELECT * FROM opc_contacts WHERE company_id = ?", companyId);
      expect(contacts).toHaveLength(1);
    });

    it("should not match contacts from different companies", () => {
      // 创建第二个公司
      const company2 = db.createCompany({
        name: "另一家公司", industry: "金融",
        owner_name: "李四", owner_contact: "",
        status: "active", registered_capital: 0, description: "",
      });

      // 公司1的合同
      workflows.afterContractCreated({
        id: "c1", company_id: companyId, title: "合同A",
        counterparty: "阿里巴巴", contract_type: "服务合同",
        direction: "sales", amount: 50000,
        start_date: "2025-01-01", end_date: "2025-06-30",
      });

      // 公司2的合同 — 同名 counterparty 不应冲突
      const results2 = workflows.afterContractCreated({
        id: "c2", company_id: company2.id, title: "合同B",
        counterparty: "阿里巴巴", contract_type: "服务合同",
        direction: "sales", amount: 30000,
        start_date: "2025-01-01", end_date: "2025-06-30",
      });

      const contactResult = results2.find(r => r.module === "contact");
      expect(contactResult?.action).toBe("created"); // 不同公司，应创建新的

      const all = db.query("SELECT * FROM opc_contacts") as { company_id: string }[];
      expect(all).toHaveLength(2);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 事务回滚
  // ══════════════════════════════════════════════════════════════

  describe("transaction rollback", () => {
    it("should rollback all changes if any step fails", () => {
      // 先正常创建一个项目让 project name 可能冲突
      // 这里我们通过传入无效的 company_id（外键约束）触发失败
      // 注意: 需要一个会在 workflow 中间步骤失败的场景
      // 使用 sales 方向 + 不存在的 company_id → 联系人插入失败（FK约束）

      const beforeContacts = db.query("SELECT COUNT(*) as cnt FROM opc_contacts") as { cnt: number }[];
      const beforeMilestones = db.query("SELECT COUNT(*) as cnt FROM opc_milestones") as { cnt: number }[];

      try {
        workflows.afterContractCreated({
          id: "c-fail", company_id: "nonexistent-company-id", title: "会失败的合同",
          counterparty: "测试", contract_type: "服务合同",
          direction: "sales", amount: 10000,
          start_date: "2025-01-01", end_date: "2025-06-30",
        });
      } catch { /* expected to throw due to FK constraint */ }

      // 验证没有任何残留数据
      const afterContacts = db.query("SELECT COUNT(*) as cnt FROM opc_contacts") as { cnt: number }[];
      const afterMilestones = db.query("SELECT COUNT(*) as cnt FROM opc_milestones") as { cnt: number }[];

      expect(afterContacts[0].cnt).toBe(beforeContacts[0].cnt);
      expect(afterMilestones[0].cnt).toBe(beforeMilestones[0].cnt);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 交易 workflow
  // ══════════════════════════════════════════════════════════════

  describe("afterTransactionCreated", () => {
    it("should create invoice for income transactions", () => {
      const results = workflows.afterTransactionCreated({
        id: "tx1", company_id: companyId, type: "income",
        amount: 30000, counterparty: "阿里巴巴",
        description: "首期款项",
      });

      const invoiceResult = results.find(r => r.module === "invoice");
      expect(invoiceResult).toBeDefined();
      expect(invoiceResult?.action).toBe("created");

      // 验证发票数据
      const invoices = db.query("SELECT * FROM opc_invoices WHERE company_id = ?", companyId) as {
        amount: number; tax_amount: number; total_amount: number; tax_rate: number;
      }[];
      expect(invoices).toHaveLength(1);
      expect(invoices[0].total_amount).toBe(30000); // 含税金额 = 到账金额
      expect(invoices[0].tax_rate).toBe(0.06);
      // 不含税 = 30000 / 1.06 ≈ 28301.89
      expect(invoices[0].amount).toBeCloseTo(28301.89, 1);
      // 税额 = 30000 - 28301.89 ≈ 1698.11
      expect(invoices[0].tax_amount).toBeCloseTo(1698.11, 1);
    });

    it("should create milestone for large transactions (>= 5000)", () => {
      const results = workflows.afterTransactionCreated({
        id: "tx2", company_id: companyId, type: "income",
        amount: 10000, counterparty: "客户B",
        description: "服务费",
      });

      const msResult = results.find(r => r.module === "milestone");
      expect(msResult).toBeDefined();
      expect(msResult?.summary).toContain("收到");
      expect(msResult?.summary).toContain("10000");
    });

    it("should NOT create milestone for small transactions (< 5000)", () => {
      const results = workflows.afterTransactionCreated({
        id: "tx3", company_id: companyId, type: "income",
        amount: 3000, counterparty: "客户C",
        description: "小额收入",
      });

      const msResult = results.find(r => r.module === "milestone");
      expect(msResult).toBeUndefined();
    });

    it("should NOT create invoice for expense transactions", () => {
      const results = workflows.afterTransactionCreated({
        id: "tx4", company_id: companyId, type: "expense",
        amount: 10000, counterparty: "供应商A",
        description: "采购支出",
      });

      const invoiceResult = results.find(r => r.module === "invoice");
      expect(invoiceResult).toBeUndefined();

      // 但 >= 5000 仍建里程碑
      const msResult = results.find(r => r.module === "milestone");
      expect(msResult).toBeDefined();
      expect(msResult?.summary).toContain("支出");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 员工 workflow
  // ══════════════════════════════════════════════════════════════

  describe("afterEmployeeAdded", () => {
    it("should create milestone for new employee", () => {
      const results = workflows.afterEmployeeAdded({
        id: "emp1", company_id: companyId, employee_name: "小王",
        position: "前端工程师", contract_type: "full_time", salary: 15000,
      });

      expect(results).toHaveLength(1);
      expect(results[0].module).toBe("milestone");
      expect(results[0].summary).toContain("小王");
      expect(results[0].summary).toContain("前端工程师");
      expect(results[0].summary).toContain("全职");

      const milestones = db.query("SELECT * FROM opc_milestones WHERE company_id = ?", companyId) as { category: string }[];
      expect(milestones).toHaveLength(1);
      expect(milestones[0].category).toBe("team");
    });

    it("should label contractor correctly", () => {
      const results = workflows.afterEmployeeAdded({
        id: "emp2", company_id: companyId, employee_name: "小李",
        position: "设计师", contract_type: "contractor", salary: 8000,
      });

      expect(results[0].summary).toContain("外包");
    });

    it("should label intern correctly", () => {
      const results = workflows.afterEmployeeAdded({
        id: "emp3", company_id: companyId, employee_name: "小张",
        position: "实习生", contract_type: "intern", salary: 3000,
      });

      expect(results[0].summary).toContain("实习");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 交易 → 联系人自动创建
  // ══════════════════════════════════════════════════════════════

  describe("afterTransactionCreated — contact auto-creation", () => {
    it("should create vendor contact for expense with counterparty", () => {
      const results = workflows.afterTransactionCreated({
        id: "tx-exp1", company_id: companyId, type: "expense",
        amount: 5000, counterparty: "Adobe",
        description: "Adobe全家桶",
      });

      const contactResult = results.find(r => r.module === "contact");
      expect(contactResult).toBeDefined();
      expect(contactResult?.action).toBe("created");
      expect(contactResult?.summary).toContain("供应商");
      expect(contactResult?.summary).toContain("Adobe");

      // 验证数据库
      const contacts = db.query("SELECT * FROM opc_contacts WHERE company_id = ?", companyId) as { name: string; tags: string; notes: string }[];
      expect(contacts).toHaveLength(1);
      expect(contacts[0].name).toBe("Adobe");
      expect(contacts[0].tags).toContain("供应商");
      expect(contacts[0].notes).toContain("Adobe全家桶");
    });

    it("should NOT create contact for expense without counterparty", () => {
      const results = workflows.afterTransactionCreated({
        id: "tx-exp2", company_id: companyId, type: "expense",
        amount: 200, counterparty: "",
        description: "打车费",
      });

      const contactResult = results.find(r => r.module === "contact");
      expect(contactResult).toBeUndefined();

      const contacts = db.query("SELECT * FROM opc_contacts WHERE company_id = ?", companyId);
      expect(contacts).toHaveLength(0);
    });

    it("should create client contact for income with counterparty", () => {
      const results = workflows.afterTransactionCreated({
        id: "tx-inc1", company_id: companyId, type: "income",
        amount: 30000, counterparty: "阿里巴巴",
        description: "首期款项",
      });

      const contactResult = results.find(r => r.module === "contact");
      expect(contactResult).toBeDefined();
      expect(contactResult?.action).toBe("created");
      expect(contactResult?.summary).toContain("客户");
      expect(contactResult?.summary).toContain("阿里巴巴");

      const contacts = db.query("SELECT * FROM opc_contacts WHERE company_id = ?", companyId) as { name: string; tags: string }[];
      expect(contacts).toHaveLength(1);
      expect(contacts[0].tags).toContain("客户");
    });

    it("should update existing contact on duplicate counterparty", () => {
      // 第一次交易 — 创建联系人
      workflows.afterTransactionCreated({
        id: "tx-dup1", company_id: companyId, type: "expense",
        amount: 5000, counterparty: "Adobe",
        description: "第一次采购",
      });

      // 第二次交易 — 应该更新而非创建
      const results2 = workflows.afterTransactionCreated({
        id: "tx-dup2", company_id: companyId, type: "expense",
        amount: 3000, counterparty: "Adobe",
        description: "续费",
      });

      const contactResult = results2.find(r => r.module === "contact");
      expect(contactResult?.action).toBe("updated");

      // 数据库中仍只有 1 个联系人
      const contacts = db.query("SELECT * FROM opc_contacts WHERE company_id = ?", companyId) as { notes: string }[];
      expect(contacts).toHaveLength(1);
      expect(contacts[0].notes).toContain("续费");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // UNIQUE 约束测试
  // ══════════════════════════════════════════════════════════════

  describe("contacts UNIQUE constraint", () => {
    it("should prevent direct duplicate INSERT on same company + name", () => {
      db.execute(
        `INSERT INTO opc_contacts (id, company_id, name, company_name, tags, notes, last_contact_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, '[]', '', '2025-01-01', datetime('now'), datetime('now'))`,
        "ct-1", companyId, "重复测试", "重复测试",
      );

      expect(() => {
        db.execute(
          `INSERT INTO opc_contacts (id, company_id, name, company_name, tags, notes, last_contact_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, '[]', '', '2025-01-01', datetime('now'), datetime('now'))`,
          "ct-2", companyId, "重复测试", "重复测试",
        );
      }).toThrow(); // UNIQUE constraint violation
    });
  });
});
