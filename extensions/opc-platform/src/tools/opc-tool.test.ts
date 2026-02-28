/**
 * 星环OPC中心 — opc-tool (核心管理工具) 集成测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, factories } from "../__tests__/test-utils.js";
import { SqliteAdapter } from "../db/sqlite-adapter.js";

describe("opc-tool database integration", () => {
  let db: SqliteAdapter;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("create_company", () => {
    it("should create a company successfully", () => {
      const companyData = factories.company({
        name: "创业公司A",
        industry: "互联网",
        owner_name: "张三",
      });

      const company = db.createCompany(companyData);

      expect(company).not.toBeNull();
      expect(company.id).toBeDefined();
      expect(company.name).toBe("创业公司A");
      expect(company.industry).toBe("互联网");
      expect(company.owner_name).toBe("张三");
      expect(company.status).toBe("active");
    });

    it("should set default values", () => {
      const companyData = factories.company({
        name: "最小配置公司",
        industry: "咨询",
        owner_name: "李四",
      });

      const company = db.createCompany(companyData);

      expect(company.registered_capital).toBeDefined();
      expect(company.created_at).toBeDefined();
      expect(company.updated_at).toBeDefined();
    });

    it("should create multiple companies", () => {
      const company1 = db.createCompany(factories.company({ name: "公司1" }));
      const company2 = db.createCompany(factories.company({ name: "公司2" }));

      expect(company1.id).not.toBe(company2.id);
      expect(company1.name).toBe("公司1");
      expect(company2.name).toBe("公司2");
    });

    it("should handle Chinese characters in company name", () => {
      const company = db.createCompany(factories.company({
        name: "星河科技有限公司",
        description: "专注于AI技术研发",
      }));

      expect(company.name).toBe("星河科技有限公司");
      expect(company.description).toBe("专注于AI技术研发");
    });
  });

  describe("get_company", () => {
    it("should retrieve a company by id", () => {
      const created = db.createCompany(factories.company({ name: "测试公司" }));
      const retrieved = db.getCompany(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.name).toBe("测试公司");
    });

    it("should return null for non-existent company", () => {
      const result = db.getCompany("non-existent-id");
      expect(result).toBeNull();
    });
  });

  describe("list_companies", () => {
    it("should list all companies", () => {
      db.createCompany(factories.company({ name: "公司1" }));
      db.createCompany(factories.company({ name: "公司2" }));
      db.createCompany(factories.company({ name: "公司3" }));

      const companies = db.listCompanies();
      expect(companies.length).toBe(3);
    });

    it("should filter companies by status", () => {
      db.createCompany(factories.company({ name: "活跃公司", status: "active" }));
      db.createCompany(factories.company({ name: "暂停公司", status: "suspended" }));
      db.createCompany(factories.company({ name: "已收购公司", status: "acquired" }));

      const activeCompanies = db.listCompanies("active");
      expect(activeCompanies.length).toBe(1);
      expect(activeCompanies[0].name).toBe("活跃公司");

      const suspendedCompanies = db.listCompanies("suspended");
      expect(suspendedCompanies.length).toBe(1);
      expect(suspendedCompanies[0].name).toBe("暂停公司");
    });

    it("should return empty array when no companies exist", () => {
      const companies = db.listCompanies();
      expect(companies).toEqual([]);
    });
  });

  describe("update_company", () => {
    it("should update company status", () => {
      const company = db.createCompany(factories.company({ status: "active" }));

      db.execute(
        "UPDATE opc_companies SET status = ?, updated_at = ? WHERE id = ?",
        "suspended", new Date().toISOString(), company.id
      );

      const updated = db.getCompany(company.id);
      expect(updated!.status).toBe("suspended");
    });

    it("should update company description", () => {
      const company = db.createCompany(factories.company({ description: "原描述" }));

      const newDescription = "更新后的描述";
      db.execute(
        "UPDATE opc_companies SET description = ?, updated_at = ? WHERE id = ?",
        newDescription, new Date().toISOString(), company.id
      );

      const updated = db.getCompany(company.id);
      expect(updated!.description).toBe(newDescription);
    });

    it("should update registered capital", () => {
      const company = db.createCompany(factories.company({ registered_capital: 100000 }));

      db.execute(
        "UPDATE opc_companies SET registered_capital = ?, updated_at = ? WHERE id = ?",
        500000, new Date().toISOString(), company.id
      );

      const updated = db.getCompany(company.id);
      expect(updated!.registered_capital).toBe(500000);
    });
  });

  describe("delete_company", () => {
    it("should delete a company", () => {
      const company = db.createCompany(factories.company({ name: "待删除公司" }));

      db.execute("DELETE FROM opc_companies WHERE id = ?", company.id);

      const deleted = db.getCompany(company.id);
      expect(deleted).toBeNull();
    });

    it("should prevent deleting company with related data (foreign key constraint)", () => {
      const company = db.createCompany(factories.company());

      // Add related transaction
      const txId = db.genId();
      db.execute(
        `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        txId, company.id, "income", "service_income", 10000, "测试", "客户", "2026-01-15"
      );

      // Try to delete company - should fail due to foreign key constraint
      expect(() => {
        db.execute("DELETE FROM opc_companies WHERE id = ?", company.id);
      }).toThrow();

      // Proper way: delete related data first, then delete company
      db.execute("DELETE FROM opc_transactions WHERE company_id = ?", company.id);
      db.execute("DELETE FROM opc_companies WHERE id = ?", company.id);

      const deleted = db.getCompany(company.id);
      expect(deleted).toBeNull();
    });
  });

  describe("company search and filtering", () => {
    beforeEach(() => {
      db.createCompany(factories.company({ name: "科技公司A", industry: "科技" }));
      db.createCompany(factories.company({ name: "咨询公司B", industry: "咨询" }));
      db.createCompany(factories.company({ name: "科技公司C", industry: "科技" }));
    });

    it("should filter by industry", () => {
      const techCompanies = db.query(
        "SELECT * FROM opc_companies WHERE industry = ?",
        "科技"
      ) as any[];
      expect(techCompanies.length).toBe(2);
    });

    it("should search by name pattern", () => {
      const companies = db.query(
        "SELECT * FROM opc_companies WHERE name LIKE ?",
        "%科技%"
      ) as any[];
      expect(companies.length).toBe(2);
    });
  });

  describe("company statistics", () => {
    it("should count companies by status", () => {
      db.createCompany(factories.company({ status: "active" }));
      db.createCompany(factories.company({ status: "active" }));
      db.createCompany(factories.company({ status: "suspended" }));
      db.createCompany(factories.company({ status: "acquired" }));

      const stats = db.queryOne(
        `SELECT
           COUNT(*) as total,
           COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
           COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended,
           COUNT(CASE WHEN status = 'acquired' THEN 1 END) as acquired
         FROM opc_companies`
      ) as any;

      expect(stats.total).toBe(4);
      expect(stats.active).toBe(2);
      expect(stats.suspended).toBe(1);
      expect(stats.acquired).toBe(1);
    });

    it("should calculate total registered capital", () => {
      db.createCompany(factories.company({ registered_capital: 100000 }));
      db.createCompany(factories.company({ registered_capital: 200000 }));
      db.createCompany(factories.company({ registered_capital: 300000 }));

      const result = db.queryOne(
        "SELECT SUM(registered_capital) as total_capital FROM opc_companies"
      ) as any;

      expect(result.total_capital).toBe(600000);
    });
  });
});
