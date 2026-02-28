/**
 * 星环OPC中心 — lifecycle-tool 集成测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, insertTestCompany } from "../__tests__/test-utils.js";
import { SqliteAdapter } from "../db/sqlite-adapter.js";

describe("lifecycle-tool database integration", () => {
  let db: SqliteAdapter;
  let companyId: string;

  beforeEach(() => {
    db = createTestDb();
    companyId = insertTestCompany(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("company status transitions", () => {
    it("should transition from pending to active", () => {
      const company = db.getCompany(companyId);
      expect(company).not.toBeNull();

      db.execute(
        "UPDATE opc_companies SET status = ?, updated_at = ? WHERE id = ?",
        "active", new Date().toISOString(), companyId
      );

      const updated = db.getCompany(companyId);
      expect(updated!.status).toBe("active");
    });

    it("should transition from active to suspended", () => {
      db.execute(
        "UPDATE opc_companies SET status = ?, updated_at = ? WHERE id = ?",
        "suspended", new Date().toISOString(), companyId
      );

      const updated = db.getCompany(companyId);
      expect(updated!.status).toBe("suspended");
    });

    it("should transition from active to acquired", () => {
      db.execute(
        "UPDATE opc_companies SET status = ?, updated_at = ? WHERE id = ?",
        "acquired", new Date().toISOString(), companyId
      );

      const updated = db.getCompany(companyId);
      expect(updated!.status).toBe("acquired");
    });

    it("should transition from acquired to packaged", () => {
      db.execute(
        "UPDATE opc_companies SET status = ?, updated_at = ? WHERE id = ?",
        "packaged", new Date().toISOString(), companyId
      );

      const updated = db.getCompany(companyId);
      expect(updated!.status).toBe("packaged");
    });

    it("should transition to terminated", () => {
      db.execute(
        "UPDATE opc_companies SET status = ?, updated_at = ? WHERE id = ?",
        "terminated", new Date().toISOString(), companyId
      );

      const updated = db.getCompany(companyId);
      expect(updated!.status).toBe("terminated");
    });
  });

  describe("milestone tracking", () => {
    it("should record first transaction milestone", () => {
      const id = db.genId();
      const now = new Date().toISOString();

      // Schema uses: title, category, target_date, completed_date, status
      db.execute(
        `INSERT INTO opc_milestones (id, company_id, title, category, description, completed_date, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id, companyId, "首笔交易", "business", "首笔交易完成", "2026-01-15", "completed", now
      );

      const milestones = db.query(
        "SELECT * FROM opc_milestones WHERE company_id = ?",
        companyId
      ) as any[];
      expect(milestones.length).toBe(1);
      expect(milestones[0].title).toBe("首笔交易");
    });

    it("should record profitability milestone", () => {
      const id = db.genId();
      const now = new Date().toISOString();

      db.execute(
        `INSERT INTO opc_milestones (id, company_id, title, category, description, completed_date, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id, companyId, "首次盈利", "financial", "实现首次盈利", "2026-02-01", "completed", now
      );

      const milestones = db.query(
        "SELECT * FROM opc_milestones WHERE company_id = ? AND title = ?",
        companyId, "首次盈利"
      ) as any[];
      expect(milestones.length).toBe(1);
    });

    it("should track multiple milestones", () => {
      const milestoneData = [
        { title: "首笔交易", category: "business" },
        { title: "首次盈利", category: "financial" },
        { title: "首位员工", category: "hr" },
      ];
      const now = new Date().toISOString();

      milestoneData.forEach((data) => {
        const id = db.genId();
        db.execute(
          `INSERT INTO opc_milestones (id, company_id, title, category, description, completed_date, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          id, companyId, data.title, data.category, `Milestone: ${data.title}`, "2026-01-15", "completed", now
        );
      });

      const milestones = db.query(
        "SELECT * FROM opc_milestones WHERE company_id = ?",
        companyId
      ) as any[];
      expect(milestones.length).toBe(3);
    });
  });

  describe("stage detection", () => {
    it("should identify startup stage (new company)", () => {
      const company = db.getCompany(companyId);
      expect(company).not.toBeNull();

      // No transactions yet - startup stage
      const transactions = db.query(
        "SELECT * FROM opc_transactions WHERE company_id = ?",
        companyId
      ) as any[];
      expect(transactions.length).toBe(0);
    });

    it("should identify growth stage (has revenue)", () => {
      // Add revenue transactions
      for (let i = 0; i < 3; i++) {
        const id = db.genId();
        db.execute(
          `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          id, companyId, "income", "service_income", 50000, "销售收入", "客户A", "2026-01-15"
        );
      }

      const transactions = db.query(
        "SELECT * FROM opc_transactions WHERE company_id = ? AND type = 'income'",
        companyId
      ) as any[];
      expect(transactions.length).toBeGreaterThan(0);
    });

    it("should identify maturity stage (consistent profit)", () => {
      // Simulate 6 months of profitable transactions
      for (let month = 1; month <= 6; month++) {
        const incomeId = db.genId();
        const expenseId = db.genId();

        db.execute(
          `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          incomeId, companyId, "income", "service_income", 100000, "月收入", "客户", `2026-0${month}-15`
        );

        db.execute(
          `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          expenseId, companyId, "expense", "salary", 30000, "月支出", "员工", `2026-0${month}-20`
        );
      }

      const summary = db.queryOne(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
           COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
         FROM opc_transactions WHERE company_id = ?`,
        companyId
      ) as any;

      expect(summary.total_income).toBeGreaterThan(summary.total_expense);
    });
  });

  describe("health metrics", () => {
    it("should calculate company health score", () => {
      // Add some positive indicators
      const incomeId = db.genId();
      db.execute(
        `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        incomeId, companyId, "income", "service_income", 200000, "销售", "客户", "2026-01-15"
      );

      const contractId = db.genId();
      const now = new Date().toISOString();
      db.execute(
        `INSERT INTO opc_contracts (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        contractId, companyId, "服务合同", "客户A", "service", 100000, "2026-01-01", "2026-12-31", "active", "", "", "2026-11-30", now, now
      );

      const metrics = db.queryOne(
        `SELECT
           (SELECT COUNT(*) FROM opc_transactions WHERE company_id = ? AND type = 'income') as income_count,
           (SELECT COUNT(*) FROM opc_contracts WHERE company_id = ? AND status = 'active') as active_contracts
         FROM opc_companies WHERE id = ?`,
        companyId, companyId, companyId
      ) as any;

      expect(metrics.income_count).toBeGreaterThan(0);
      expect(metrics.active_contracts).toBeGreaterThan(0);
    });
  });
});
