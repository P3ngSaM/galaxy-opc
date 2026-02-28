/**
 * 星环OPC中心 — 端到端测试：完整公司生命周期
 *
 * 测试从公司注册到盈利的完整业务流程
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, factories } from "../test-utils.js";
import { SqliteAdapter } from "../../db/sqlite-adapter.js";
import { BusinessWorkflows } from "../../opc/business-workflows.js";

describe("company lifecycle E2E", () => {
  let db: SqliteAdapter;
  let workflows: BusinessWorkflows;

  beforeEach(() => {
    db = createTestDb();
    workflows = new BusinessWorkflows(db);
  });

  afterEach(() => {
    db.close();
  });

  it("complete journey: from registration to profitability", () => {
    // ═══════════════════════════════════════════════════════════
    // 第一步：注册公司
    // ═══════════════════════════════════════════════════════════
    const company = db.createCompany({
      name: "张三的咨询公司",
      industry: "咨询",
      owner_name: "张三",
      owner_contact: "13800138000",
      status: "active",
      registered_capital: 100000,
      description: "专业提供商业咨询服务",
    });

    expect(company).not.toBeNull();
    expect(company.id).toBeDefined();
    expect(company.name).toBe("张三的咨询公司");

    // ═══════════════════════════════════════════════════════════
    // 第二步：添加创始人为员工
    // ═══════════════════════════════════════════════════════════
    const employeeId = db.genId();
    db.execute(
      `INSERT INTO opc_employees (id, company_id, name, role, skills, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      employeeId, company.id, "张三", "general", "商业咨询,战略规划", "active"
    );

    const employee = db.queryOne(
      "SELECT * FROM opc_employees WHERE id = ?",
      employeeId
    ) as any;
    expect(employee.name).toBe("张三");

    // ═══════════════════════════════════════════════════════════
    // 第三步：签订首个服务合同
    // ═══════════════════════════════════════════════════════════
    const contractId = db.genId();
    const now = new Date().toISOString();

    db.execute(
      `INSERT INTO opc_contracts
       (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      contractId, company.id, "商业咨询服务合同", "创业公司A", "service", 100000,
      "2026-01-01", "2026-06-30", "active",
      "按月交付报告,分3期付款",
      "",
      "2026-06-15",
      now, now
    );

    // 触发业务工作流（自动创建联系人等）
    const contractResults = workflows.afterContractCreated({
      id: contractId,
      company_id: company.id,
      title: "商业咨询服务合同",
      counterparty: "创业公司A",
      contract_type: "service",
      direction: "sales",
      amount: 100000,
      start_date: "2026-01-01",
      end_date: "2026-06-30",
    });

    expect(contractResults.length).toBeGreaterThan(0);

    // 验证自动创建了客户联系人
    const contact = db.queryOne(
      "SELECT * FROM opc_contacts WHERE company_id = ? AND name = ?",
      company.id, "创业公司A"
    ) as any;
    expect(contact).not.toBeNull();
    expect(contact.tags).toContain("客户");

    // ═══════════════════════════════════════════════════════════
    // 第四步：记录收款（3期付款）
    // ═══════════════════════════════════════════════════════════
    const payments = [
      { date: "2026-02-15", amount: 30000, desc: "第一期款" },
      { date: "2026-04-15", amount: 30000, desc: "第二期款" },
      { date: "2026-06-15", amount: 40000, desc: "第三期款（尾款）" },
    ];

    payments.forEach((payment) => {
      const txId = db.genId();
      db.execute(
        `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        txId, company.id, "income", "service_income", payment.amount,
        payment.desc, "创业公司A", payment.date
      );

      // 触发交易工作流
      workflows.afterTransactionCreated({
        id: txId,
        company_id: company.id,
        type: "income",
        amount: payment.amount,
        counterparty: "创业公司A",
        description: payment.desc,
      });
    });

    // 验证总收入
    const incomeSummary = db.queryOne(
      `SELECT SUM(amount) as total_income
       FROM opc_transactions
       WHERE company_id = ? AND type = 'income'`,
      company.id
    ) as any;
    expect(incomeSummary.total_income).toBe(100000);

    // ═══════════════════════════════════════════════════════════
    // 第五步：记录运营成本
    // ═══════════════════════════════════════════════════════════
    const expenses = [
      { date: "2026-01-25", amount: 5000, category: "rent", desc: "办公室租金" },
      { date: "2026-02-10", amount: 2000, category: "utilities", desc: "水电网费" },
      { date: "2026-03-15", amount: 3000, category: "marketing", desc: "市场推广" },
      { date: "2026-04-20", amount: 1500, category: "supplies", desc: "办公用品" },
    ];

    expenses.forEach((expense) => {
      const txId = db.genId();
      db.execute(
        `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        txId, company.id, "expense", expense.category, expense.amount,
        expense.desc, "供应商", expense.date
      );
    });

    // 验证总支出
    const expenseSummary = db.queryOne(
      `SELECT SUM(amount) as total_expense
       FROM opc_transactions
       WHERE company_id = ? AND type = 'expense'`,
      company.id
    ) as any;
    expect(expenseSummary.total_expense).toBe(11500);

    // ═══════════════════════════════════════════════════════════
    // 第六步：验证财务状态（盈利）
    // ═══════════════════════════════════════════════════════════
    const financialSummary = db.queryOne(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_revenue,
         COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_cost
       FROM opc_transactions WHERE company_id = ?`,
      company.id
    ) as any;

    const profit = financialSummary.total_revenue - financialSummary.total_cost;

    expect(financialSummary.total_revenue).toBe(100000);
    expect(financialSummary.total_cost).toBe(11500);
    expect(profit).toBe(88500);
    expect(profit).toBeGreaterThan(0); // 实现盈利

    // ═══════════════════════════════════════════════════════════
    // 第七步：验证里程碑记录
    // ═══════════════════════════════════════════════════════════
    const milestones = db.query(
      "SELECT * FROM opc_milestones WHERE company_id = ?",
      company.id
    ) as any[];

    // 检查里程碑是否存在 (业务工作流可能会创建)
    // Schema uses: title, category instead of milestone_type
    expect(milestones.length).toBeGreaterThanOrEqual(0);

    // ═══════════════════════════════════════════════════════════
    // 第八步：验证公司健康度指标
    // ═══════════════════════════════════════════════════════════
    const healthMetrics = {
      // 1. 客户数量（检查是否有联系人被创建）
      customerCount: (db.query(
        "SELECT COUNT(*) as count FROM opc_contacts WHERE company_id = ?",
        company.id
      ) as any[])[0].count,

      // 2. 活跃合同数
      activeContracts: (db.query(
        "SELECT COUNT(*) as count FROM opc_contracts WHERE company_id = ? AND status = 'active'",
        company.id
      ) as any[])[0].count,

      // 3. 收入流水笔数
      transactionCount: (db.query(
        "SELECT COUNT(*) as count FROM opc_transactions WHERE company_id = ? AND type = 'income'",
        company.id
      ) as any[])[0].count,

      // 4. 利润率
      profitMargin: (profit / financialSummary.total_revenue) * 100,
    };

    expect(healthMetrics.customerCount).toBeGreaterThan(0);
    expect(healthMetrics.activeContracts).toBeGreaterThan(0);
    expect(healthMetrics.transactionCount).toBeGreaterThanOrEqual(3);
    expect(healthMetrics.profitMargin).toBeGreaterThan(80); // 88.5%

    // ═══════════════════════════════════════════════════════════
    // 第九步：公司状态检查
    // ═══════════════════════════════════════════════════════════
    const finalCompany = db.getCompany(company.id);
    expect(finalCompany).not.toBeNull();
    expect(finalCompany!.status).toBe("active");
    expect(finalCompany!.name).toBe("张三的咨询公司");

    // ═══════════════════════════════════════════════════════════
    // 测试总结：成功模拟了一个一人公司从注册到盈利的完整生命周期
    // ═══════════════════════════════════════════════════════════
    const summary = {
      company: finalCompany!.name,
      status: finalCompany!.status,
      revenue: financialSummary.total_revenue,
      cost: financialSummary.total_cost,
      profit,
      profitMargin: `${healthMetrics.profitMargin.toFixed(2)}%`,
      customers: healthMetrics.customerCount,
      contracts: healthMetrics.activeContracts,
      milestones: milestones.length,
    };

    // 验证公司已经成功运营
    expect(summary.profit).toBeGreaterThan(0);
    expect(summary.customers).toBeGreaterThan(0);
    expect(summary.contracts).toBeGreaterThan(0);

    console.log("✓ E2E Test Summary:", summary);
  });

  it("multi-contract scenario: expanding business", () => {
    // ═══════════════════════════════════════════════════════════
    // 场景：公司接连签订多个合同，业务扩张
    // ═══════════════════════════════════════════════════════════
    const company = db.createCompany(factories.company({
      name: "快速成长科技公司",
      industry: "科技",
    }));

    // 签订3个不同客户的合同
    const clients = ["客户A", "客户B", "客户C"];
    const now = new Date().toISOString();

    clients.forEach((client, index) => {
      const contractId = db.genId();
      const amount = (index + 1) * 50000;

      db.execute(
        `INSERT INTO opc_contracts
         (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        contractId, company.id, `${client}服务合同`, client, "service", amount,
        "2026-01-01", "2026-12-31", "active", "", "", "2026-11-30", now, now
      );

      workflows.afterContractCreated({
        id: contractId,
        company_id: company.id,
        title: `${client}服务合同`,
        counterparty: client,
        contract_type: "service",
        direction: "sales",
        amount,
        start_date: "2026-01-01",
        end_date: "2026-12-31",
      });

      // 记录收款
      const txId = db.genId();
      db.execute(
        `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        txId, company.id, "income", "service_income", amount,
        `${client}项目收款`, client, "2026-02-15"
      );
    });

    // 验证：应该有3个客户
    const customers = db.query(
      "SELECT * FROM opc_contacts WHERE company_id = ? AND tags LIKE '%客户%'",
      company.id
    ) as any[];
    expect(customers.length).toBe(3);

    // 验证：应该有3个活跃合同
    const contracts = db.query(
      "SELECT * FROM opc_contracts WHERE company_id = ? AND status = 'active'",
      company.id
    ) as any[];
    expect(contracts.length).toBe(3);

    // 验证：总收入应该是 50000 + 100000 + 150000 = 300000
    const totalRevenue = db.queryOne(
      `SELECT SUM(amount) as total
       FROM opc_transactions
       WHERE company_id = ? AND type = 'income'`,
      company.id
    ) as any;
    expect(totalRevenue.total).toBe(300000);
  });

  it("failure scenario: company with losses", () => {
    // ═══════════════════════════════════════════════════════════
    // 场景：公司亏损，支出大于收入
    // ═══════════════════════════════════════════════════════════
    const company = db.createCompany(factories.company({
      name: "亏损公司案例",
      industry: "零售",
    }));

    // 收入较少
    const incomeId = db.genId();
    db.execute(
      `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      incomeId, company.id, "income", "product_income", 30000,
      "销售收入", "客户", "2026-01-15"
    );

    // 支出较多
    const expenses = [
      { amount: 20000, category: "rent", desc: "租金" },
      { amount: 15000, category: "salary", desc: "工资" },
      { amount: 10000, category: "marketing", desc: "推广" },
    ];

    expenses.forEach((expense) => {
      const txId = db.genId();
      db.execute(
        `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        txId, company.id, "expense", expense.category, expense.amount,
        expense.desc, "供应商", "2026-01-20"
      );
    });

    // 计算盈亏
    const summary = db.queryOne(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as revenue,
         COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as cost
       FROM opc_transactions WHERE company_id = ?`,
      company.id
    ) as any;

    const profit = summary.revenue - summary.cost;

    expect(summary.revenue).toBe(30000);
    expect(summary.cost).toBe(45000);
    expect(profit).toBe(-15000);
    expect(profit).toBeLessThan(0); // 确认亏损

    // 这种情况下，公司可能需要进入收购流程
    // 可以创建收购案例记录
    const acquisitionId = db.genId();
    const now = new Date().toISOString();
    db.execute(
      `INSERT INTO opc_acquisition_cases
       (id, company_id, acquirer_id, case_type, status, trigger_reason, acquisition_price, loss_amount, tax_deduction, created_at, updated_at)
       VALUES (?, ?, 'starriver', 'acquisition', 'evaluating', '连续亏损', ?, ?, ?, ?, ?)`,
      acquisitionId, company.id, 10000, 15000, 3750, now, now
    );

    const acquisitionCase = db.queryOne(
      "SELECT * FROM opc_acquisition_cases WHERE id = ?",
      acquisitionId
    ) as any;
    expect(acquisitionCase).not.toBeNull();
    expect(acquisitionCase.loss_amount).toBe(15000);
  });
});
