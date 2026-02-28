/**
 * 星环OPC中心 — SQLite 数据库适配器
 */

import Database from "better-sqlite3";
import type {
  OpcCompany,
  OpcCompanyStatus,
  OpcContact,
  OpcEmployee,
  OpcTransaction,
} from "../opc/types.js";
import type { OpcDatabase } from "./index.js";
import { runMigrations } from "./migrations.js";
import { OPC_INDEXES, OPC_TABLES } from "./schema.js";

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class SqliteAdapter implements OpcDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initialize();
  }

  private initialize(): void {
    for (const sql of Object.values(OPC_TABLES)) {
      this.db.exec(sql);
    }
    for (const idx of OPC_INDEXES) {
      this.db.exec(idx);
    }
    runMigrations(this.db);
  }

  /** 通用查询方法，供 Phase 2 工具使用 */
  query(sql: string, ...params: unknown[]): unknown[] {
    return this.db.prepare(sql).all(...params);
  }

  /** 通用单行查询 */
  queryOne(sql: string, ...params: unknown[]): unknown | null {
    return this.db.prepare(sql).get(...params) ?? null;
  }

  /** 通用执行 */
  execute(sql: string, ...params: unknown[]): { changes: number } {
    const result = this.db.prepare(sql).run(...params);
    return { changes: result.changes };
  }

  /** 生成 ID（公开版本供工具使用） */
  genId(): string {
    return generateId();
  }

  /** 在事务中执行回调，失败自动回滚 */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }

  // ── Companies ──────────────────────────────────────────────

  createCompany(data: Omit<OpcCompany, "id" | "created_at" | "updated_at">): OpcCompany {
    const id = generateId();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO opc_companies (id, name, industry, owner_name, owner_contact, status, registered_capital, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.name,
        data.industry,
        data.owner_name,
        data.owner_contact,
        data.status,
        data.registered_capital,
        data.description,
        now,
        now,
      );
    return this.getCompany(id)!;
  }

  getCompany(id: string): OpcCompany | null {
    return (this.db.prepare("SELECT * FROM opc_companies WHERE id = ?").get(id) as OpcCompany) ?? null;
  }

  listCompanies(status?: OpcCompanyStatus): OpcCompany[] {
    if (status) {
      return this.db
        .prepare("SELECT * FROM opc_companies WHERE status = ? ORDER BY created_at DESC")
        .all(status) as OpcCompany[];
    }
    return this.db
      .prepare("SELECT * FROM opc_companies ORDER BY created_at DESC")
      .all() as OpcCompany[];
  }

  updateCompany(id: string, data: Partial<OpcCompany>): OpcCompany | null {
    const existing = this.getCompany(id);
    if (!existing) return null;

    const ALLOWED = new Set(["name", "industry", "owner_name", "owner_contact",
      "status", "registered_capital", "description"]);

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(data)) {
      if (!ALLOWED.has(key)) continue;
      fields.push(`${key} = ?`);
      values.push(val);
    }
    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE opc_companies SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.getCompany(id);
  }

  deleteCompany(id: string): boolean {
    const result = this.db.prepare("DELETE FROM opc_companies WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // ── Employees ──────────────────────────────────────────────

  createEmployee(data: Omit<OpcEmployee, "id" | "created_at">): OpcEmployee {
    const id = generateId();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO opc_employees (id, company_id, name, role, skills, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, data.company_id, data.name, data.role, data.skills, data.status, now);
    return this.getEmployee(id)!;
  }

  getEmployee(id: string): OpcEmployee | null {
    return (this.db.prepare("SELECT * FROM opc_employees WHERE id = ?").get(id) as OpcEmployee) ?? null;
  }

  listEmployees(companyId: string): OpcEmployee[] {
    return this.db
      .prepare("SELECT * FROM opc_employees WHERE company_id = ? ORDER BY created_at DESC")
      .all(companyId) as OpcEmployee[];
  }

  // ── Transactions ───────────────────────────────────────────

  createTransaction(data: Omit<OpcTransaction, "id" | "created_at">): OpcTransaction {
    const id = generateId();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.company_id,
        data.type,
        data.category,
        data.amount,
        data.description,
        data.counterparty,
        data.transaction_date,
        now,
      );
    return this.getTransaction(id)!;
  }

  getTransaction(id: string): OpcTransaction | null {
    return (
      (this.db.prepare("SELECT * FROM opc_transactions WHERE id = ?").get(id) as OpcTransaction) ?? null
    );
  }

  listTransactions(
    companyId: string,
    opts?: { type?: string; startDate?: string; endDate?: string; limit?: number },
  ): OpcTransaction[] {
    let sql = "SELECT * FROM opc_transactions WHERE company_id = ?";
    const params: unknown[] = [companyId];

    if (opts?.type) {
      sql += " AND type = ?";
      params.push(opts.type);
    }
    if (opts?.startDate) {
      sql += " AND transaction_date >= ?";
      params.push(opts.startDate);
    }
    if (opts?.endDate) {
      sql += " AND transaction_date <= ?";
      params.push(opts.endDate);
    }
    sql += " ORDER BY transaction_date DESC";
    if (opts?.limit) {
      sql += " LIMIT ?";
      params.push(opts.limit);
    }

    return this.db.prepare(sql).all(...params) as OpcTransaction[];
  }

  getFinanceSummary(
    companyId: string,
    startDate?: string,
    endDate?: string,
  ): { total_income: number; total_expense: number; net: number; count: number } {
    let sql = `
      SELECT
        COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as total_expense,
        COUNT(*) as count
      FROM opc_transactions
      WHERE company_id = ?
    `;
    const params: unknown[] = [companyId];

    if (startDate) {
      sql += " AND transaction_date >= ?";
      params.push(startDate);
    }
    if (endDate) {
      sql += " AND transaction_date <= ?";
      params.push(endDate);
    }

    const row = this.db.prepare(sql).get(...params) as {
      total_income: number;
      total_expense: number;
      count: number;
    };
    return {
      total_income: row.total_income,
      total_expense: row.total_expense,
      net: row.total_income - row.total_expense,
      count: row.count,
    };
  }

  // ── Contacts ───────────────────────────────────────────────

  createContact(data: Omit<OpcContact, "id" | "created_at" | "updated_at">): OpcContact {
    const id = generateId();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO opc_contacts (id, company_id, name, phone, email, company_name, tags, notes, last_contact_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.company_id,
        data.name,
        data.phone,
        data.email,
        data.company_name,
        data.tags,
        data.notes,
        data.last_contact_date,
        now,
        now,
      );
    return this.getContact(id)!;
  }

  getContact(id: string): OpcContact | null {
    return (this.db.prepare("SELECT * FROM opc_contacts WHERE id = ?").get(id) as OpcContact) ?? null;
  }

  listContacts(companyId: string, tag?: string): OpcContact[] {
    if (tag) {
      return this.db
        .prepare(
          "SELECT * FROM opc_contacts WHERE company_id = ? AND tags LIKE ? ORDER BY updated_at DESC",
        )
        .all(companyId, `%${tag}%`) as OpcContact[];
    }
    return this.db
      .prepare("SELECT * FROM opc_contacts WHERE company_id = ? ORDER BY updated_at DESC")
      .all(companyId) as OpcContact[];
  }

  updateContact(id: string, data: Partial<OpcContact>): OpcContact | null {
    const existing = this.getContact(id);
    if (!existing) return null;

    const ALLOWED = new Set(["name", "phone", "email", "company_name",
      "tags", "notes", "last_contact_date"]);

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(data)) {
      if (!ALLOWED.has(key)) continue;
      fields.push(`${key} = ?`);
      values.push(val);
    }
    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE opc_contacts SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.getContact(id);
  }

  deleteContact(id: string): boolean {
    const result = this.db.prepare("DELETE FROM opc_contacts WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // ── Dashboard ──────────────────────────────────────────────

  getDashboardStats(): {
    total_companies: number;
    active_companies: number;
    total_transactions: number;
    total_contacts: number;
    total_revenue: number;
    total_expense: number;
  } {
    const companies = this.db
      .prepare(
        `SELECT
          COUNT(*) as total,
          COALESCE(SUM(CASE WHEN status='active' THEN 1 ELSE 0 END), 0) as active
        FROM opc_companies`,
      )
      .get() as { total: number; active: number };

    const transactions = this.db
      .prepare(
        `SELECT
          COUNT(*) as total,
          COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) as revenue,
          COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as expense
        FROM opc_transactions`,
      )
      .get() as { total: number; revenue: number; expense: number };

    const contacts = this.db
      .prepare("SELECT COUNT(*) as total FROM opc_contacts")
      .get() as { total: number };

    return {
      total_companies: companies.total,
      active_companies: companies.active,
      total_transactions: transactions.total,
      total_contacts: contacts.total,
      total_revenue: transactions.revenue,
      total_expense: transactions.expense,
    };
  }
}
