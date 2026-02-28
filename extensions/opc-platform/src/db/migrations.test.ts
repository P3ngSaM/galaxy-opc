/**
 * 星环OPC中心 — 数据库迁移和完整性测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../__tests__/test-utils.js";
import { SqliteAdapter } from "./sqlite-adapter.js";

describe("database migrations", () => {
  let db: SqliteAdapter;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("table creation", () => {
    it("should create all required tables", () => {
      const tables = db.query(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ) as any[];

      const tableNames = tables.map((t) => t.name);

      // Core tables
      expect(tableNames).toContain("opc_companies");
      expect(tableNames).toContain("opc_employees");
      expect(tableNames).toContain("opc_transactions");
      expect(tableNames).toContain("opc_contacts");

      // Phase 2 tables
      expect(tableNames).toContain("opc_contracts");
      expect(tableNames).toContain("opc_invoices");
      expect(tableNames).toContain("opc_projects");
      expect(tableNames).toContain("opc_milestones");

      // Extended tables
      expect(tableNames).toContain("opc_tax_filings");
      expect(tableNames).toContain("opc_media_content");
      expect(tableNames).toContain("opc_acquisition_cases");
      expect(tableNames).toContain("opc_asset_packages");
    });

    it("should have at least 25 tables", () => {
      const tables = db.query(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"
      ) as any[];
      expect(tables[0].count).toBeGreaterThanOrEqual(25);
    });
  });

  describe("table schema validation", () => {
    it("should have correct opc_companies schema", () => {
      const schema = db.query(
        "PRAGMA table_info(opc_companies)"
      ) as any[];

      const columns = schema.map((c) => c.name);
      expect(columns).toContain("id");
      expect(columns).toContain("name");
      expect(columns).toContain("industry");
      expect(columns).toContain("owner_name");
      expect(columns).toContain("owner_contact");
      expect(columns).toContain("status");
      expect(columns).toContain("registered_capital");
      expect(columns).toContain("description");
      expect(columns).toContain("created_at");
      expect(columns).toContain("updated_at");
    });

    it("should have correct opc_transactions schema", () => {
      const schema = db.query(
        "PRAGMA table_info(opc_transactions)"
      ) as any[];

      const columns = schema.map((c) => c.name);
      expect(columns).toContain("id");
      expect(columns).toContain("company_id");
      expect(columns).toContain("type");
      expect(columns).toContain("category");
      expect(columns).toContain("amount");
      expect(columns).toContain("description");
      expect(columns).toContain("counterparty");
      expect(columns).toContain("transaction_date");
      expect(columns).toContain("created_at");
    });

    it("should have correct opc_contracts schema", () => {
      const schema = db.query(
        "PRAGMA table_info(opc_contracts)"
      ) as any[];

      const columns = schema.map((c) => c.name);
      expect(columns).toContain("id");
      expect(columns).toContain("company_id");
      expect(columns).toContain("title");
      expect(columns).toContain("counterparty");
      expect(columns).toContain("contract_type");
      expect(columns).toContain("amount");
      expect(columns).toContain("status");
    });

    it("should have correct opc_projects schema", () => {
      const schema = db.query(
        "PRAGMA table_info(opc_projects)"
      ) as any[];

      const columns = schema.map((c) => c.name);
      expect(columns).toContain("id");
      expect(columns).toContain("company_id");
      expect(columns).toContain("name");
      expect(columns).toContain("status");
      expect(columns).toContain("budget");
      expect(columns).toContain("spent"); // Schema uses 'spent' not 'actual_cost'
      // No 'progress' or 'priority' fields in current schema
    });
  });

  describe("foreign key constraints", () => {
    it("should have foreign keys enabled", () => {
      const result = db.queryOne("PRAGMA foreign_keys") as any;
      expect(result.foreign_keys).toBe(1);
    });

    it("should enforce foreign key on transactions", () => {
      const id = db.genId();

      // Try to insert transaction with non-existent company_id
      expect(() => {
        db.execute(
          `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          id, "non-existent-company-id", "income", "service_income", 10000, "test", "client", "2026-01-15"
        );
      }).toThrow();
    });

    it("should prevent deletion of company with related transactions", () => {
      // Create company
      const company = db.createCompany({
        name: "测试公司",
        industry: "IT",
        owner_name: "张三",
        owner_contact: "13800138000",
        status: "active",
        registered_capital: 100000,
        description: "",
      });

      // Add transaction
      const txId = db.genId();
      db.execute(
        `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        txId, company.id, "income", "service_income", 10000, "test", "client", "2026-01-15"
      );

      // Verify transaction exists
      let transactions = db.query(
        "SELECT * FROM opc_transactions WHERE company_id = ?",
        company.id
      ) as any[];
      expect(transactions.length).toBe(1);

      // Try to delete company - should fail due to foreign key constraint
      expect(() => {
        db.execute("DELETE FROM opc_companies WHERE id = ?", company.id);
      }).toThrow();

      // Proper cleanup: delete related data first
      db.execute("DELETE FROM opc_transactions WHERE company_id = ?", company.id);
      db.execute("DELETE FROM opc_companies WHERE id = ?", company.id);

      const deleted = db.getCompany(company.id);
      expect(deleted).toBeNull();
    });
  });

  describe("indexes", () => {
    it("should have indexes on foreign keys", () => {
      const indexes = db.query(
        "SELECT name FROM sqlite_master WHERE type='index'"
      ) as any[];

      const indexNames = indexes.map((i) => i.name);

      // Check for common foreign key indexes
      expect(indexNames.some((name) => name.includes("company"))).toBe(true);
    });
  });

  describe("data integrity", () => {
    it("should enforce NOT NULL constraints", () => {
      // Try to create company without required fields
      expect(() => {
        db.execute(
          "INSERT INTO opc_companies (id) VALUES (?)",
          db.genId()
        );
      }).toThrow();
    });

    it("should enforce unique constraints on id", () => {
      const company = db.createCompany({
        name: "公司1",
        industry: "IT",
        owner_name: "张三",
        owner_contact: "13800138000",
        status: "active",
        registered_capital: 100000,
        description: "",
      });

      // Try to insert another company with same id
      const now = new Date().toISOString();
      expect(() => {
        db.execute(
          `INSERT INTO opc_companies (id, name, industry, owner_name, owner_contact, status, registered_capital, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          company.id, "公司2", "IT", "李四", "13900139000", "active", 100000, "", now, now
        );
      }).toThrow();
    });
  });

  describe("default values", () => {
    it("should set default timestamps", () => {
      const company = db.createCompany({
        name: "测试公司",
        industry: "IT",
        owner_name: "张三",
        owner_contact: "13800138000",
        status: "active",
        registered_capital: 100000,
        description: "",
      });

      expect(company.created_at).toBeDefined();
      expect(company.updated_at).toBeDefined();
      expect(company.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("transaction support", () => {
    it("should support database transactions", () => {
      const result = db.transaction(() => {
        const company = db.createCompany({
          name: "事务测试",
          industry: "IT",
          owner_name: "张三",
          owner_contact: "13800138000",
          status: "active",
          registered_capital: 100000,
          description: "",
        });
        return company.id;
      });

      expect(result).toBeDefined();
      const company = db.getCompany(result);
      expect(company).not.toBeNull();
    });

    it("should rollback on transaction error", () => {
      const companiesBeforeCount = (db.query("SELECT COUNT(*) as count FROM opc_companies") as any[])[0].count;

      expect(() => {
        db.transaction(() => {
          db.createCompany({
            name: "将被回滚",
            industry: "IT",
            owner_name: "张三",
            owner_contact: "13800138000",
            status: "active",
            registered_capital: 100000,
            description: "",
          });
          throw new Error("Rollback test");
        });
      }).toThrow("Rollback test");

      const companiesAfterCount = (db.query("SELECT COUNT(*) as count FROM opc_companies") as any[])[0].count;
      expect(companiesAfterCount).toBe(companiesBeforeCount);
    });
  });

  describe("migration idempotency", () => {
    it("should handle multiple database instances", () => {
      // Creating multiple instances should not cause errors
      const db1 = createTestDb();
      const db2 = createTestDb();

      const company1 = db1.createCompany({
        name: "DB1公司",
        industry: "IT",
        owner_name: "张三",
        owner_contact: "13800138000",
        status: "active",
        registered_capital: 100000,
        description: "",
      });

      const company2 = db2.createCompany({
        name: "DB2公司",
        industry: "IT",
        owner_name: "李四",
        owner_contact: "13900139000",
        status: "active",
        registered_capital: 100000,
        description: "",
      });

      expect(company1.id).toBeDefined();
      expect(company2.id).toBeDefined();
      expect(company1.id).not.toBe(company2.id);

      db1.close();
      db2.close();
    });
  });
});
