/**
 * 星环OPC中心 — CompanyManager 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteAdapter } from "../db/sqlite-adapter.js";
import { CompanyManager } from "./company-manager.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("CompanyManager", () => {
  let db: SqliteAdapter;
  let manager: CompanyManager;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `opc-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new SqliteAdapter(dbPath);
    manager = new CompanyManager(db);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + "-wal"); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + "-shm"); } catch { /* ignore */ }
  });

  describe("registerCompany", () => {
    it("should create a company with pending status", () => {
      const company = manager.registerCompany({
        name: "测试科技",
        industry: "互联网",
        owner_name: "张三",
      });
      expect(company.id).toBeDefined();
      expect(company.name).toBe("测试科技");
      expect(company.industry).toBe("互联网");
      expect(company.owner_name).toBe("张三");
      expect(company.status).toBe("pending");
      expect(company.registered_capital).toBe(0);
    });

    it("should accept optional fields", () => {
      const company = manager.registerCompany({
        name: "优质公司",
        industry: "教育",
        owner_name: "李四",
        owner_contact: "13800138000",
        registered_capital: 500000,
        description: "在线教育平台",
      });
      expect(company.owner_contact).toBe("13800138000");
      expect(company.registered_capital).toBe(500000);
      expect(company.description).toBe("在线教育平台");
    });
  });

  describe("getCompany", () => {
    it("should return a company by id", () => {
      const created = manager.registerCompany({
        name: "查询测试",
        industry: "零售",
        owner_name: "王五",
      });
      const found = manager.getCompany(created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("查询测试");
    });

    it("should return null for non-existent id", () => {
      expect(manager.getCompany("non-existent")).toBeNull();
    });
  });

  describe("listCompanies", () => {
    it("should list all companies", () => {
      manager.registerCompany({ name: "A公司", industry: "IT", owner_name: "A" });
      manager.registerCompany({ name: "B公司", industry: "金融", owner_name: "B" });
      const list = manager.listCompanies();
      expect(list.length).toBe(2);
    });

    it("should filter by status", () => {
      const c = manager.registerCompany({ name: "C公司", industry: "IT", owner_name: "C" });
      manager.registerCompany({ name: "D公司", industry: "IT", owner_name: "D" });
      manager.activateCompany(c.id);
      expect(manager.listCompanies("active").length).toBe(1);
      expect(manager.listCompanies("pending").length).toBe(1);
    });
  });

  describe("activateCompany", () => {
    it("should transition pending → active", () => {
      const c = manager.registerCompany({ name: "激活测试", industry: "IT", owner_name: "X" });
      expect(c.status).toBe("pending");
      const activated = manager.activateCompany(c.id);
      expect(activated).not.toBeNull();
      expect(activated!.status).toBe("active");
    });

    it("should return null for non-existent company", () => {
      expect(manager.activateCompany("fake-id")).toBeNull();
    });
  });

  describe("transitionStatus — valid transitions", () => {
    it("pending → active", () => {
      const c = manager.registerCompany({ name: "T1", industry: "IT", owner_name: "X" });
      const result = manager.transitionStatus(c.id, "active");
      expect(result!.status).toBe("active");
    });

    it("pending → terminated", () => {
      const c = manager.registerCompany({ name: "T2", industry: "IT", owner_name: "X" });
      const result = manager.transitionStatus(c.id, "terminated");
      expect(result!.status).toBe("terminated");
    });

    it("active → suspended", () => {
      const c = manager.registerCompany({ name: "T3", industry: "IT", owner_name: "X" });
      manager.transitionStatus(c.id, "active");
      const result = manager.transitionStatus(c.id, "suspended");
      expect(result!.status).toBe("suspended");
    });

    it("active → acquired", () => {
      const c = manager.registerCompany({ name: "T4", industry: "IT", owner_name: "X" });
      manager.transitionStatus(c.id, "active");
      const result = manager.transitionStatus(c.id, "acquired");
      expect(result!.status).toBe("acquired");
    });

    it("active → packaged", () => {
      const c = manager.registerCompany({ name: "T5", industry: "IT", owner_name: "X" });
      manager.transitionStatus(c.id, "active");
      const result = manager.transitionStatus(c.id, "packaged");
      expect(result!.status).toBe("packaged");
    });

    it("active → terminated", () => {
      const c = manager.registerCompany({ name: "T6", industry: "IT", owner_name: "X" });
      manager.transitionStatus(c.id, "active");
      const result = manager.transitionStatus(c.id, "terminated");
      expect(result!.status).toBe("terminated");
    });

    it("suspended → active", () => {
      const c = manager.registerCompany({ name: "T7", industry: "IT", owner_name: "X" });
      manager.transitionStatus(c.id, "active");
      manager.transitionStatus(c.id, "suspended");
      const result = manager.transitionStatus(c.id, "active");
      expect(result!.status).toBe("active");
    });

    it("suspended → terminated", () => {
      const c = manager.registerCompany({ name: "T8", industry: "IT", owner_name: "X" });
      manager.transitionStatus(c.id, "active");
      manager.transitionStatus(c.id, "suspended");
      const result = manager.transitionStatus(c.id, "terminated");
      expect(result!.status).toBe("terminated");
    });

    it("acquired → terminated", () => {
      const c = manager.registerCompany({ name: "T9", industry: "IT", owner_name: "X" });
      manager.transitionStatus(c.id, "active");
      manager.transitionStatus(c.id, "acquired");
      const result = manager.transitionStatus(c.id, "terminated");
      expect(result!.status).toBe("terminated");
    });

    it("packaged → terminated", () => {
      const c = manager.registerCompany({ name: "T10", industry: "IT", owner_name: "X" });
      manager.transitionStatus(c.id, "active");
      manager.transitionStatus(c.id, "packaged");
      const result = manager.transitionStatus(c.id, "terminated");
      expect(result!.status).toBe("terminated");
    });
  });

  describe("transitionStatus — invalid transitions", () => {
    it("pending → suspended should throw", () => {
      const c = manager.registerCompany({ name: "E1", industry: "IT", owner_name: "X" });
      expect(() => manager.transitionStatus(c.id, "suspended")).toThrow();
    });

    it("pending → acquired should throw", () => {
      const c = manager.registerCompany({ name: "E2", industry: "IT", owner_name: "X" });
      expect(() => manager.transitionStatus(c.id, "acquired")).toThrow();
    });

    it("terminated → active should throw", () => {
      const c = manager.registerCompany({ name: "E3", industry: "IT", owner_name: "X" });
      manager.transitionStatus(c.id, "terminated");
      expect(() => manager.transitionStatus(c.id, "active")).toThrow(/不允许/);
    });

    it("acquired → active should throw", () => {
      const c = manager.registerCompany({ name: "E4", industry: "IT", owner_name: "X" });
      manager.transitionStatus(c.id, "active");
      manager.transitionStatus(c.id, "acquired");
      expect(() => manager.transitionStatus(c.id, "active")).toThrow();
    });
  });

  describe("updateCompany", () => {
    it("should update company fields", () => {
      const c = manager.registerCompany({ name: "更新测试", industry: "IT", owner_name: "X" });
      const updated = manager.updateCompany(c.id, { name: "新名称", industry: "金融" });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("新名称");
      expect(updated!.industry).toBe("金融");
    });

    it("should return null for non-existent company", () => {
      expect(manager.updateCompany("fake-id", { name: "test" })).toBeNull();
    });
  });

  describe("deleteCompany", () => {
    it("should delete an existing company", () => {
      const c = manager.registerCompany({ name: "删除测试", industry: "IT", owner_name: "X" });
      expect(manager.deleteCompany(c.id)).toBe(true);
      expect(manager.getCompany(c.id)).toBeNull();
    });

    it("should return false for non-existent company", () => {
      expect(manager.deleteCompany("fake-id")).toBe(false);
    });
  });
});
