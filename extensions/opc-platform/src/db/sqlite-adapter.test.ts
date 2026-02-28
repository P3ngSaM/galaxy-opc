/**
 * 星环OPC中心 — SqliteAdapter 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteAdapter } from "./sqlite-adapter.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("SqliteAdapter", () => {
  let db: SqliteAdapter;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `opc-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new SqliteAdapter(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + "-wal"); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + "-shm"); } catch { /* ignore */ }
  });

  // ── Companies ──────────────────────────────────────────────
  describe("Companies CRUD", () => {
    it("should create and retrieve a company", () => {
      const company = db.createCompany({
        name: "测试公司",
        industry: "科技",
        owner_name: "张三",
        owner_contact: "13800138000",
        status: "pending",
        registered_capital: 100000,
        description: "测试描述",
      });
      expect(company.id).toBeTruthy();
      expect(company.name).toBe("测试公司");

      const fetched = db.getCompany(company.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe("测试公司");
    });

    it("should list companies and filter by status", () => {
      db.createCompany({ name: "A", industry: "IT", owner_name: "X", owner_contact: "", status: "pending", registered_capital: 0, description: "" });
      db.createCompany({ name: "B", industry: "IT", owner_name: "Y", owner_contact: "", status: "active", registered_capital: 0, description: "" });

      expect(db.listCompanies().length).toBe(2);
      expect(db.listCompanies("pending").length).toBe(1);
      expect(db.listCompanies("active").length).toBe(1);
      expect(db.listCompanies("terminated").length).toBe(0);
    });

    it("should update a company", () => {
      const c = db.createCompany({ name: "Old", industry: "IT", owner_name: "X", owner_contact: "", status: "pending", registered_capital: 0, description: "" });
      const updated = db.updateCompany(c.id, { name: "New", industry: "金融" });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("New");
      expect(updated!.industry).toBe("金融");
    });

    it("should return null when updating non-existent company", () => {
      expect(db.updateCompany("fake-id", { name: "X" })).toBeNull();
    });

    it("should delete a company", () => {
      const c = db.createCompany({ name: "Del", industry: "IT", owner_name: "X", owner_contact: "", status: "pending", registered_capital: 0, description: "" });
      expect(db.deleteCompany(c.id)).toBe(true);
      expect(db.getCompany(c.id)).toBeNull();
    });

    it("should return false when deleting non-existent company", () => {
      expect(db.deleteCompany("fake-id")).toBe(false);
    });
  });

  // ── Employees ──────────────────────────────────────────────
  describe("Employees CRUD", () => {
    it("should create and list employees", () => {
      const c = db.createCompany({ name: "Emp Co", industry: "IT", owner_name: "X", owner_contact: "", status: "active", registered_capital: 0, description: "" });
      const emp = db.createEmployee({ company_id: c.id, name: "小明", role: "finance", skills: "会计", status: "active" });
      expect(emp.id).toBeTruthy();
      expect(emp.name).toBe("小明");

      const list = db.listEmployees(c.id);
      expect(list.length).toBe(1);
      expect(list[0].role).toBe("finance");
    });

    it("should get employee by id", () => {
      const c = db.createCompany({ name: "Emp2", industry: "IT", owner_name: "X", owner_contact: "", status: "active", registered_capital: 0, description: "" });
      const emp = db.createEmployee({ company_id: c.id, name: "小红", role: "hr", skills: "招聘", status: "active" });
      const found = db.getEmployee(emp.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("小红");
    });

    it("should return null for non-existent employee", () => {
      expect(db.getEmployee("fake")).toBeNull();
    });
  });

  // ── Transactions ───────────────────────────────────────────
  describe("Transactions CRUD", () => {
    let companyId: string;

    beforeEach(() => {
      const c = db.createCompany({ name: "Tx Co", industry: "IT", owner_name: "X", owner_contact: "", status: "active", registered_capital: 0, description: "" });
      companyId = c.id;
    });

    it("should create and retrieve a transaction", () => {
      const tx = db.createTransaction({
        company_id: companyId,
        type: "income",
        category: "service_income",
        amount: 5000,
        description: "咨询服务",
        counterparty: "客户A",
        transaction_date: "2025-01-15",
      });
      expect(tx.id).toBeTruthy();
      expect(tx.amount).toBe(5000);
      expect(tx.type).toBe("income");

      const fetched = db.getTransaction(tx.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.counterparty).toBe("客户A");
    });

    it("should list transactions with filters", () => {
      db.createTransaction({ company_id: companyId, type: "income", category: "other", amount: 1000, description: "", counterparty: "", transaction_date: "2025-01-01" });
      db.createTransaction({ company_id: companyId, type: "expense", category: "rent", amount: 2000, description: "", counterparty: "", transaction_date: "2025-02-01" });
      db.createTransaction({ company_id: companyId, type: "income", category: "other", amount: 3000, description: "", counterparty: "", transaction_date: "2025-03-01" });

      expect(db.listTransactions(companyId).length).toBe(3);
      expect(db.listTransactions(companyId, { type: "income" }).length).toBe(2);
      expect(db.listTransactions(companyId, { type: "expense" }).length).toBe(1);
      expect(db.listTransactions(companyId, { startDate: "2025-02-01" }).length).toBe(2);
      expect(db.listTransactions(companyId, { endDate: "2025-01-31" }).length).toBe(1);
      expect(db.listTransactions(companyId, { limit: 1 }).length).toBe(1);
    });

    it("should return null for non-existent transaction", () => {
      expect(db.getTransaction("fake")).toBeNull();
    });
  });

  // ── Finance Summary ────────────────────────────────────────
  describe("getFinanceSummary", () => {
    it("should compute correct financial totals", () => {
      const c = db.createCompany({ name: "Fin Co", industry: "IT", owner_name: "X", owner_contact: "", status: "active", registered_capital: 0, description: "" });
      db.createTransaction({ company_id: c.id, type: "income", category: "other", amount: 10000, description: "", counterparty: "", transaction_date: "2025-01-15" });
      db.createTransaction({ company_id: c.id, type: "income", category: "other", amount: 5000, description: "", counterparty: "", transaction_date: "2025-01-20" });
      db.createTransaction({ company_id: c.id, type: "expense", category: "rent", amount: 3000, description: "", counterparty: "", transaction_date: "2025-01-25" });

      const summary = db.getFinanceSummary(c.id);
      expect(summary.total_income).toBe(15000);
      expect(summary.total_expense).toBe(3000);
      expect(summary.net).toBe(12000);
      expect(summary.count).toBe(3);
    });

    it("should filter by date range", () => {
      const c = db.createCompany({ name: "Fin2", industry: "IT", owner_name: "X", owner_contact: "", status: "active", registered_capital: 0, description: "" });
      db.createTransaction({ company_id: c.id, type: "income", category: "other", amount: 1000, description: "", counterparty: "", transaction_date: "2025-01-15" });
      db.createTransaction({ company_id: c.id, type: "income", category: "other", amount: 2000, description: "", counterparty: "", transaction_date: "2025-03-15" });

      const jan = db.getFinanceSummary(c.id, "2025-01-01", "2025-01-31");
      expect(jan.total_income).toBe(1000);

      const all = db.getFinanceSummary(c.id);
      expect(all.total_income).toBe(3000);
    });

    it("should return zeros for company with no transactions", () => {
      const c = db.createCompany({ name: "Empty", industry: "IT", owner_name: "X", owner_contact: "", status: "active", registered_capital: 0, description: "" });
      const summary = db.getFinanceSummary(c.id);
      expect(summary.total_income).toBe(0);
      expect(summary.total_expense).toBe(0);
      expect(summary.net).toBe(0);
      expect(summary.count).toBe(0);
    });
  });

  // ── Contacts ───────────────────────────────────────────────
  describe("Contacts CRUD", () => {
    let companyId: string;

    beforeEach(() => {
      const c = db.createCompany({ name: "Ct Co", industry: "IT", owner_name: "X", owner_contact: "", status: "active", registered_capital: 0, description: "" });
      companyId = c.id;
    });

    it("should create and retrieve a contact", () => {
      const contact = db.createContact({
        company_id: companyId,
        name: "王经理",
        phone: "13900139000",
        email: "wang@example.com",
        company_name: "客户公司",
        tags: '["VIP"]',
        notes: "重要客户",
        last_contact_date: "2025-01-01",
      });
      expect(contact.id).toBeTruthy();
      expect(contact.name).toBe("王经理");

      const fetched = db.getContact(contact.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.email).toBe("wang@example.com");
    });

    it("should list contacts and filter by tag", () => {
      db.createContact({ company_id: companyId, name: "A", phone: "", email: "", company_name: "", tags: '["VIP"]', notes: "", last_contact_date: "" });
      db.createContact({ company_id: companyId, name: "B", phone: "", email: "", company_name: "", tags: '["供应商"]', notes: "", last_contact_date: "" });

      expect(db.listContacts(companyId).length).toBe(2);
      expect(db.listContacts(companyId, "VIP").length).toBe(1);
      expect(db.listContacts(companyId, "供应商").length).toBe(1);
    });

    it("should update a contact", () => {
      const ct = db.createContact({ company_id: companyId, name: "Old", phone: "", email: "", company_name: "", tags: "[]", notes: "", last_contact_date: "" });
      const updated = db.updateContact(ct.id, { name: "New", phone: "12345" });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("New");
      expect(updated!.phone).toBe("12345");
    });

    it("should return null when updating non-existent contact", () => {
      expect(db.updateContact("fake", { name: "X" })).toBeNull();
    });

    it("should delete a contact", () => {
      const ct = db.createContact({ company_id: companyId, name: "Del", phone: "", email: "", company_name: "", tags: "[]", notes: "", last_contact_date: "" });
      expect(db.deleteContact(ct.id)).toBe(true);
      expect(db.getContact(ct.id)).toBeNull();
    });

    it("should return false when deleting non-existent contact", () => {
      expect(db.deleteContact("fake")).toBe(false);
    });
  });

  // ── Dashboard Stats ────────────────────────────────────────
  describe("getDashboardStats", () => {
    it("should return correct aggregate stats", () => {
      const c1 = db.createCompany({ name: "S1", industry: "IT", owner_name: "X", owner_contact: "", status: "active", registered_capital: 0, description: "" });
      db.createCompany({ name: "S2", industry: "IT", owner_name: "Y", owner_contact: "", status: "pending", registered_capital: 0, description: "" });
      db.createTransaction({ company_id: c1.id, type: "income", category: "other", amount: 10000, description: "", counterparty: "", transaction_date: "2025-01-01" });
      db.createTransaction({ company_id: c1.id, type: "expense", category: "rent", amount: 3000, description: "", counterparty: "", transaction_date: "2025-01-01" });
      db.createContact({ company_id: c1.id, name: "Contact1", phone: "", email: "", company_name: "", tags: "[]", notes: "", last_contact_date: "" });

      const stats = db.getDashboardStats();
      expect(stats.total_companies).toBe(2);
      expect(stats.active_companies).toBe(1);
      expect(stats.total_transactions).toBe(2);
      expect(stats.total_contacts).toBe(1);
      expect(stats.total_revenue).toBe(10000);
      expect(stats.total_expense).toBe(3000);
    });

    it("should return zeros for empty database", () => {
      const stats = db.getDashboardStats();
      expect(stats.total_companies).toBe(0);
      expect(stats.active_companies).toBe(0);
      expect(stats.total_transactions).toBe(0);
      expect(stats.total_contacts).toBe(0);
    });
  });

  // ── Generic query methods ──────────────────────────────────
  describe("Generic query methods", () => {
    it("genId should generate unique ids", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(db.genId());
      }
      expect(ids.size).toBe(100);
    });

    it("query should return rows", () => {
      db.createCompany({ name: "Q1", industry: "IT", owner_name: "X", owner_contact: "", status: "active", registered_capital: 0, description: "" });
      const rows = db.query("SELECT * FROM opc_companies WHERE status = ?", "active");
      expect(rows.length).toBe(1);
    });

    it("queryOne should return single row", () => {
      db.createCompany({ name: "Q2", industry: "IT", owner_name: "X", owner_contact: "", status: "active", registered_capital: 0, description: "" });
      const row = db.queryOne("SELECT COUNT(*) as cnt FROM opc_companies") as { cnt: number };
      expect(row.cnt).toBe(1);
    });

    it("execute should return changes count", () => {
      db.createCompany({ name: "E1", industry: "IT", owner_name: "X", owner_contact: "", status: "pending", registered_capital: 0, description: "" });
      const result = db.execute("UPDATE opc_companies SET industry = ? WHERE status = ?", "金融", "pending");
      expect(result.changes).toBe(1);
    });
  });
});
