/**
 * 星环OPC中心 — project-tool 集成测试
 * 基于实际 schema: budget, spent (而非 actual_cost, progress, priority)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, insertTestCompany, factories } from "../__tests__/test-utils.js";
import { SqliteAdapter } from "../db/sqlite-adapter.js";

describe("project-tool database integration", () => {
  let db: SqliteAdapter;
  let companyId: string;

  beforeEach(() => {
    db = createTestDb();
    companyId = insertTestCompany(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("create_project", () => {
    it("should create a project successfully", () => {
      const id = db.genId();
      const now = new Date().toISOString();

      db.execute(
        `INSERT INTO opc_projects
         (id, company_id, name, description, status, start_date, end_date, budget, spent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, companyId, "网站开发项目", "开发企业官网", "planning",
        "2026-01-01", "2026-03-31", 100000, 0, now, now
      );

      const project = db.queryOne("SELECT * FROM opc_projects WHERE id = ?", id) as any;
      expect(project).not.toBeNull();
      expect(project.name).toBe("网站开发项目");
      expect(project.budget).toBe(100000);
      expect(project.status).toBe("planning");
    });

    it("should create project with minimal fields", () => {
      const id = db.genId();
      const now = new Date().toISOString();

      db.execute(
        `INSERT INTO opc_projects
         (id, company_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        id, companyId, "简单项目", now, now
      );

      const project = db.queryOne("SELECT * FROM opc_projects WHERE id = ?", id) as any;
      expect(project.name).toBe("简单项目");
      expect(project.status).toBe("planning"); // default
    });
  });

  describe("list_projects", () => {
    it("should list all projects for a company", () => {
      const now = new Date().toISOString();
      for (let i = 0; i < 3; i++) {
        const id = db.genId();
        db.execute(
          `INSERT INTO opc_projects
           (id, company_id, name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          id, companyId, `项目${i + 1}`, now, now
        );
      }

      const projects = db.query("SELECT * FROM opc_projects WHERE company_id = ?", companyId) as any[];
      expect(projects.length).toBe(3);
    });

    it("should filter projects by status", () => {
      const now = new Date().toISOString();
      const statuses = ["planning", "in_progress", "completed"];

      statuses.forEach((status) => {
        const id = db.genId();
        db.execute(
          `INSERT INTO opc_projects
           (id, company_id, name, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          id, companyId, `项目_${status}`, status, now, now
        );
      });

      const inProgressProjects = db.query(
        "SELECT * FROM opc_projects WHERE company_id = ? AND status = ?",
        companyId, "in_progress"
      ) as any[];
      expect(inProgressProjects.length).toBe(1);
    });
  });

  describe("update_project", () => {
    it("should update project spent amount", () => {
      const id = db.genId();
      const now = new Date().toISOString();

      db.execute(
        `INSERT INTO opc_projects
         (id, company_id, name, budget, spent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id, companyId, "项目A", 100000, 0, now, now
      );

      db.execute(
        "UPDATE opc_projects SET spent = ?, updated_at = ? WHERE id = ?",
        50000, now, id
      );

      const updated = db.queryOne("SELECT * FROM opc_projects WHERE id = ?", id) as any;
      expect(updated.spent).toBe(50000);
    });

    it("should update project status to completed", () => {
      const id = db.genId();
      const now = new Date().toISOString();

      db.execute(
        `INSERT INTO opc_projects
         (id, company_id, name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        id, companyId, "项目B", "in_progress", now, now
      );

      db.execute(
        "UPDATE opc_projects SET status = ?, updated_at = ? WHERE id = ?",
        "completed", now, id
      );

      const updated = db.queryOne("SELECT * FROM opc_projects WHERE id = ?", id) as any;
      expect(updated.status).toBe("completed");
    });
  });

  describe("project budget tracking", () => {
    it("should detect budget overrun", () => {
      const id = db.genId();
      const now = new Date().toISOString();

      db.execute(
        `INSERT INTO opc_projects
         (id, company_id, name, budget, spent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id, companyId, "超支项目", 100000, 120000, now, now
      );

      const overBudgetProjects = db.query(
        "SELECT * FROM opc_projects WHERE company_id = ? AND spent > budget",
        companyId
      ) as any[];
      expect(overBudgetProjects.length).toBe(1);
    });

    it("should calculate total project costs", () => {
      const now = new Date().toISOString();
      const projects = [
        { budget: 100000, spent: 80000 },
        { budget: 50000, spent: 45000 },
        { budget: 200000, spent: 180000 },
      ];

      projects.forEach((project, index) => {
        const id = db.genId();
        db.execute(
          `INSERT INTO opc_projects
           (id, company_id, name, budget, spent, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          id, companyId, `项目${index}`, project.budget, project.spent, now, now
        );
      });

      const summary = db.queryOne(
        `SELECT
           COUNT(*) as total_projects,
           SUM(budget) as total_budget,
           SUM(spent) as total_spent
         FROM opc_projects WHERE company_id = ?`,
        companyId
      ) as any;

      expect(summary.total_projects).toBe(3);
      expect(summary.total_budget).toBe(350000);
      expect(summary.total_spent).toBe(305000);
    });
  });

  describe("project timeline", () => {
    it("should detect overdue projects", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      const endDate = pastDate.toISOString().split("T")[0];

      const id = db.genId();
      const now = new Date().toISOString();

      db.execute(
        `INSERT INTO opc_projects
         (id, company_id, name, end_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id, companyId, "逾期项目", endDate, "in_progress", now, now
      );

      const overdueProjects = db.query(
        `SELECT * FROM opc_projects
         WHERE company_id = ? AND status != 'completed'
         AND end_date != '' AND end_date < date('now')`,
        companyId
      ) as any[];
      expect(overdueProjects.length).toBe(1);
    });
  });
});
