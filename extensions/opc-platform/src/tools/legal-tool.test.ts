/**
 * 星环OPC中心 — legal-tool 集成测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, insertTestCompany, factories } from "../__tests__/test-utils.js";
import { SqliteAdapter } from "../db/sqlite-adapter.js";

describe("legal-tool database integration", () => {
  let db: SqliteAdapter;
  let companyId: string;

  beforeEach(() => {
    db = createTestDb();
    companyId = insertTestCompany(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("create_contract", () => {
    it("should create a contract successfully", () => {
      const contractData = factories.contract(companyId, {
        title: "技术服务合同",
        counterparty: "客户A",
        contract_type: "service",
        amount: 100000,
      });

      const id = db.genId();
      const now = new Date().toISOString();

      db.execute(
        `INSERT INTO opc_contracts
         (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, contractData.company_id, contractData.title, contractData.counterparty,
        contractData.contract_type, contractData.amount, contractData.start_date,
        contractData.end_date, contractData.status, contractData.key_terms,
        contractData.risk_notes, contractData.reminder_date, now, now
      );

      const contract = db.queryOne("SELECT * FROM opc_contracts WHERE id = ?", id) as any;
      expect(contract).not.toBeNull();
      expect(contract.title).toBe("技术服务合同");
      expect(contract.amount).toBe(100000);
      expect(contract.status).toBe("active");
    });

    it("should handle contract without amount", () => {
      const contractData = factories.contract(companyId, {
        title: "保密协议",
        contract_type: "NDA",
        amount: 0,
      });

      const id = db.genId();
      const now = new Date().toISOString();

      db.execute(
        `INSERT INTO opc_contracts
         (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, contractData.company_id, contractData.title, contractData.counterparty,
        contractData.contract_type, contractData.amount, contractData.start_date,
        contractData.end_date, contractData.status, contractData.key_terms,
        contractData.risk_notes, contractData.reminder_date, now, now
      );

      const contract = db.queryOne("SELECT * FROM opc_contracts WHERE id = ?", id) as any;
      expect(contract.amount).toBe(0);
      expect(contract.contract_type).toBe("NDA");
    });

    it("should create multiple contracts for same company", () => {
      const contract1 = factories.contract(companyId, { title: "合同1" });
      const contract2 = factories.contract(companyId, { title: "合同2" });
      const now = new Date().toISOString();

      [contract1, contract2].forEach((c) => {
        const id = db.genId();
        db.execute(
          `INSERT INTO opc_contracts
           (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, c.company_id, c.title, c.counterparty, c.contract_type, c.amount,
          c.start_date, c.end_date, c.status, c.key_terms, c.risk_notes, c.reminder_date, now, now
        );
      });

      const contracts = db.query("SELECT * FROM opc_contracts WHERE company_id = ?", companyId) as any[];
      expect(contracts.length).toBe(2);
    });
  });

  describe("list_contracts", () => {
    it("should list all contracts for a company", () => {
      // Create 3 contracts
      for (let i = 0; i < 3; i++) {
        const contract = factories.contract(companyId, { title: `合同${i + 1}` });
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_contracts
           (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, contract.company_id, contract.title, contract.counterparty,
          contract.contract_type, contract.amount, contract.start_date,
          contract.end_date, contract.status, contract.key_terms,
          contract.risk_notes, contract.reminder_date, now, now
        );
      }

      const contracts = db.query("SELECT * FROM opc_contracts WHERE company_id = ?", companyId) as any[];
      expect(contracts.length).toBe(3);
    });

    it("should filter contracts by status", () => {
      const activeContract = factories.contract(companyId, { status: "active" });
      const expiredContract = factories.contract(companyId, { status: "expired" });
      const now = new Date().toISOString();

      [activeContract, expiredContract].forEach((c) => {
        const id = db.genId();
        db.execute(
          `INSERT INTO opc_contracts
           (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, c.company_id, c.title, c.counterparty, c.contract_type, c.amount,
          c.start_date, c.end_date, c.status, c.key_terms, c.risk_notes, c.reminder_date, now, now
        );
      });

      const activeContracts = db.query(
        "SELECT * FROM opc_contracts WHERE company_id = ? AND status = ?",
        companyId, "active"
      ) as any[];
      expect(activeContracts.length).toBe(1);
      expect(activeContracts[0].status).toBe("active");
    });
  });

  describe("update_contract", () => {
    it("should update contract status", () => {
      const contract = factories.contract(companyId);
      const id = db.genId();
      const now = new Date().toISOString();

      db.execute(
        `INSERT INTO opc_contracts
         (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, contract.company_id, contract.title, contract.counterparty,
        contract.contract_type, contract.amount, contract.start_date,
        contract.end_date, contract.status, contract.key_terms,
        contract.risk_notes, contract.reminder_date, now, now
      );

      db.execute(
        "UPDATE opc_contracts SET status = ?, updated_at = ? WHERE id = ?",
        "terminated", now, id
      );

      const updated = db.queryOne("SELECT * FROM opc_contracts WHERE id = ?", id) as any;
      expect(updated.status).toBe("terminated");
    });

    it("should update risk notes", () => {
      const contract = factories.contract(companyId);
      const id = db.genId();
      const now = new Date().toISOString();

      db.execute(
        `INSERT INTO opc_contracts
         (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, contract.company_id, contract.title, contract.counterparty,
        contract.contract_type, contract.amount, contract.start_date,
        contract.end_date, contract.status, contract.key_terms,
        contract.risk_notes, contract.reminder_date, now, now
      );

      const newRiskNotes = "需注意付款条款";
      db.execute(
        "UPDATE opc_contracts SET risk_notes = ?, updated_at = ? WHERE id = ?",
        newRiskNotes, now, id
      );

      const updated = db.queryOne("SELECT * FROM opc_contracts WHERE id = ?", id) as any;
      expect(updated.risk_notes).toBe(newRiskNotes);
    });
  });

  describe("delete_contract", () => {
    it("should delete a contract", () => {
      const contract = factories.contract(companyId);
      const id = db.genId();
      const now = new Date().toISOString();

      db.execute(
        `INSERT INTO opc_contracts
         (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, contract.company_id, contract.title, contract.counterparty,
        contract.contract_type, contract.amount, contract.start_date,
        contract.end_date, contract.status, contract.key_terms,
        contract.risk_notes, contract.reminder_date, now, now
      );

      db.execute("DELETE FROM opc_contracts WHERE id = ?", id);

      const deleted = db.queryOne("SELECT * FROM opc_contracts WHERE id = ?", id);
      expect(deleted).toBeNull();
    });
  });

  describe("contract expiration detection", () => {
    it("should detect expiring contracts", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const reminderDate = futureDate.toISOString().split("T")[0];

      const contract = factories.contract(companyId, {
        reminder_date: reminderDate,
        status: "active",
      });
      const id = db.genId();
      const now = new Date().toISOString();

      db.execute(
        `INSERT INTO opc_contracts
         (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, contract.company_id, contract.title, contract.counterparty,
        contract.contract_type, contract.amount, contract.start_date,
        contract.end_date, contract.status, contract.key_terms,
        contract.risk_notes, contract.reminder_date, now, now
      );

      const expiringSoon = db.query(
        `SELECT * FROM opc_contracts
         WHERE company_id = ? AND status = 'active'
         AND reminder_date <= date('now', '+30 days')`,
        companyId
      ) as any[];

      expect(expiringSoon.length).toBe(1);
    });
  });
});
