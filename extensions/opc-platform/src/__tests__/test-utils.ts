/**
 * 星环OPC中心 — 测试工具库
 *
 * 提供测试数据库工厂、测试数据工厂和 Mock 工具
 */

import { SqliteAdapter } from "../db/sqlite-adapter.js";
import type { OpcDatabase } from "../db/index.js";
import type {
  OpcCompany,
  OpcCompanyStatus,
  OpcTransaction,
  OpcEmployee,
  OpcContact,
  OpcContract,
  OpcInvoice,
  OpcProject,
} from "../opc/types.js";

// ── 测试数据库工厂 ──────────────────────────────────────────

/**
 * 创建内存数据库用于测试
 * 每次调用都会创建独立的数据库实例，确保测试隔离
 */
export function createTestDb(): SqliteAdapter {
  const adapter = new SqliteAdapter(":memory:");
  return adapter;
}

// ── 测试数据工厂 ──────────────────────────────────────────

let testIdCounter = 0;

/**
 * 生成唯一测试 ID
 */
function generateTestId(prefix: string): string {
  testIdCounter++;
  return `test-${prefix}-${Date.now()}-${testIdCounter}`;
}

/**
 * 测试数据工厂
 */
export const factories = {
  /**
   * 创建测试公司数据
   */
  company: (overrides: Partial<OpcCompany> = {}): Omit<OpcCompany, "id" | "created_at" | "updated_at"> => ({
    name: "测试公司",
    industry: "科技",
    owner_name: "张三",
    owner_contact: "13800138000",
    status: "active" as OpcCompanyStatus,
    registered_capital: 100000,
    description: "这是一个测试公司",
    ...overrides,
  }),

  /**
   * 创建测试交易数据
   */
  transaction: (
    companyId: string,
    overrides: Partial<OpcTransaction> = {}
  ): Omit<OpcTransaction, "id" | "created_at"> => ({
    company_id: companyId,
    type: "income",
    category: "service_income",
    amount: 10000,
    description: "测试交易",
    counterparty: "客户A",
    transaction_date: "2026-01-15",
    ...overrides,
  }),

  /**
   * 创建测试员工数据
   */
  employee: (
    companyId: string,
    overrides: Partial<OpcEmployee> = {}
  ): Omit<OpcEmployee, "id" | "created_at"> => ({
    company_id: companyId,
    name: "李四",
    role: "finance",
    skills: "财务管理",
    status: "active",
    ...overrides,
  }),

  /**
   * 创建测试联系人数据
   */
  contact: (
    companyId: string,
    overrides: Partial<OpcContact> = {}
  ): Omit<OpcContact, "id" | "created_at" | "updated_at"> => ({
    company_id: companyId,
    name: "王五",
    phone: "13900139000",
    email: "wangwu@example.com",
    company_name: "客户公司",
    tags: "VIP,长期合作",
    notes: "重要客户",
    last_contact_date: "2026-01-15",
    ...overrides,
  }),

  /**
   * 创建测试合同数据
   */
  contract: (
    companyId: string,
    overrides: Partial<OpcContract> = {}
  ): Omit<OpcContract, "id" | "created_at" | "updated_at"> => ({
    company_id: companyId,
    title: "测试服务合同",
    counterparty: "客户A",
    contract_type: "service",
    amount: 100000,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    status: "active",
    key_terms: "按月付款,质保一年",
    risk_notes: "",
    reminder_date: "2026-11-30",
    ...overrides,
  }),

  /**
   * 创建测试发票数据
   */
  invoice: (
    companyId: string,
    overrides: Partial<OpcInvoice> = {}
  ): Omit<OpcInvoice, "id" | "created_at"> => {
    const amount = overrides.amount ?? 10000;
    const taxRate = overrides.tax_rate ?? 0.13;
    const taxAmount = Math.round(amount * taxRate * 100) / 100;
    const totalAmount = amount + taxAmount;

    return {
      company_id: companyId,
      invoice_number: `INV-${generateTestId("invoice")}`,
      type: "sales",
      counterparty: "客户A",
      amount,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      status: "issued",
      issue_date: "2026-01-15",
      notes: "",
      ...overrides,
    };
  },

  /**
   * 创建测试项目数据
   * 注意: schema中的项目表字段是 spent 而非 actual_cost
   */
  project: (
    companyId: string,
    overrides: any = {}
  ): any => ({
    company_id: companyId,
    name: "测试项目",
    description: "这是一个测试项目",
    status: "planning",
    start_date: "2026-01-01",
    end_date: "2026-03-31",
    budget: 50000,
    spent: 0,
    ...overrides,
  }),
};

// ── Mock 工具 ──────────────────────────────────────────

/**
 * 创建 Mock OpenClawPluginApi
 */
export function createMockApi() {
  return {
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    config: {},
    registerTool: vi.fn(),
    registerHttpRoute: vi.fn(),
    registerCommand: vi.fn(),
  };
}

/**
 * 创建 Mock 数据库
 */
export function createMockDb(): Partial<OpcDatabase> {
  return {
    query: vi.fn(),
    queryOne: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn((fn) => fn()),
    genId: vi.fn(() => generateTestId("mock")),
  };
}

// ── 测试辅助函数 ──────────────────────────────────────────

/**
 * 插入测试公司并返回 ID
 */
export function insertTestCompany(
  db: SqliteAdapter,
  overrides: Partial<OpcCompany> = {}
): string {
  const companyData = factories.company(overrides);
  const company = db.createCompany(companyData);
  return company.id;
}

/**
 * 插入测试交易并返回 ID
 */
export function insertTestTransaction(
  db: SqliteAdapter,
  companyId: string,
  overrides: Partial<OpcTransaction> = {}
): string {
  const txData = factories.transaction(companyId, overrides);
  const id = db.genId();
  db.execute(
    `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    id,
    txData.company_id,
    txData.type,
    txData.category,
    txData.amount,
    txData.description,
    txData.counterparty,
    txData.transaction_date
  );
  return id;
}

/**
 * 插入测试员工并返回 ID
 */
export function insertTestEmployee(
  db: SqliteAdapter,
  companyId: string,
  overrides: Partial<OpcEmployee> = {}
): string {
  const empData = factories.employee(companyId, overrides);
  const id = db.genId();
  db.execute(
    `INSERT INTO opc_employees (id, company_id, name, role, skills, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    id,
    empData.company_id,
    empData.name,
    empData.role,
    empData.skills,
    empData.status
  );
  return id;
}

/**
 * 等待异步操作（测试用）
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 验证日期格式 YYYY-MM-DD
 */
export function isValidDateFormat(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;

  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * 获取当前日期字符串 YYYY-MM-DD
 */
export function getCurrentDate(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

/**
 * 获取指定天数后的日期字符串
 */
export function getFutureDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split("T")[0];
}

/**
 * 清理测试数据（删除所有公司及关联数据）
 */
export function cleanupTestData(db: SqliteAdapter): void {
  // 外键级联会自动删除关联数据
  db.execute("DELETE FROM opc_companies");
}
