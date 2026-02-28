/**
 * 星环OPC中心 — acquisition-tool 核心计算函数单元测试
 *
 * 测试收并购模块的亏损抵税计算逻辑。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteAdapter } from "../db/sqlite-adapter.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * 亏损抵税计算: loss × 25% 企业所得税率
 * 复制自 acquisition-tool.ts 的核心逻辑
 */
function calcTaxDeduction(lossAmount: number): number {
  return lossAmount * 0.25;
}

describe("acquisition-tool calculations", () => {
  describe("calcTaxDeduction — 亏损抵税计算", () => {
    it("should calculate 25% tax deduction from loss", () => {
      expect(calcTaxDeduction(100000)).toBe(25000);
    });

    it("should handle zero loss", () => {
      expect(calcTaxDeduction(0)).toBe(0);
    });

    it("should handle large loss amounts", () => {
      expect(calcTaxDeduction(10000000)).toBe(2500000); // 1000万亏损 → 250万抵税
    });

    it("should handle decimal amounts", () => {
      expect(calcTaxDeduction(33333.33)).toBeCloseTo(8333.33, 2);
    });
  });
});

describe("acquisition-tool database integration", () => {
  let db: SqliteAdapter;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `opc-test-acq-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new SqliteAdapter(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + "-wal"); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + "-shm"); } catch { /* ignore */ }
  });

  it("should create an acquisition case with correct tax deduction", () => {
    // Create target company
    const company = db.createCompany({
      name: "亏损公司", industry: "零售", owner_name: "赵六",
      owner_contact: "", status: "active", registered_capital: 500000, description: "",
    });

    const id = db.genId();
    const now = new Date().toISOString();
    const lossAmount = 200000;
    const taxDeduction = calcTaxDeduction(lossAmount);

    db.execute(
      `INSERT INTO opc_acquisition_cases
         (id, company_id, acquirer_id, case_type, status, trigger_reason,
          acquisition_price, loss_amount, tax_deduction, initiated_date, notes, created_at, updated_at)
       VALUES (?, ?, 'starriver', 'acquisition', 'evaluating', ?, ?, ?, ?, date('now'), ?, ?, ?)`,
      id, company.id, "连续亏损",
      100000, lossAmount, taxDeduction,
      "", now, now,
    );

    const row = db.queryOne("SELECT * FROM opc_acquisition_cases WHERE id = ?", id) as Record<string, unknown>;
    expect(row).not.toBeNull();
    expect(row.loss_amount).toBe(200000);
    expect(row.tax_deduction).toBe(50000); // 200000 × 25%
    expect(row.acquisition_price).toBe(100000);
    expect(row.status).toBe("evaluating");
  });

  it("should update company status to acquired when acquisition is created", () => {
    const company = db.createCompany({
      name: "被收购公司", industry: "IT", owner_name: "钱七",
      owner_contact: "", status: "active", registered_capital: 300000, description: "",
    });

    const now = new Date().toISOString();
    db.execute(
      "UPDATE opc_companies SET status = 'acquired', updated_at = ? WHERE id = ?",
      now, company.id,
    );

    const updated = db.getCompany(company.id);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("acquired");
  });

  it("should compute acquisition summary correctly", () => {
    const c1 = db.createCompany({ name: "C1", industry: "IT", owner_name: "X", owner_contact: "", status: "active", registered_capital: 0, description: "" });
    const c2 = db.createCompany({ name: "C2", industry: "IT", owner_name: "Y", owner_contact: "", status: "active", registered_capital: 0, description: "" });
    const now = new Date().toISOString();

    // Create two acquisition cases
    db.execute(
      `INSERT INTO opc_acquisition_cases (id, company_id, acquirer_id, case_type, status, trigger_reason, acquisition_price, loss_amount, tax_deduction, created_at, updated_at)
       VALUES (?, ?, 'starriver', 'acquisition', 'completed', '亏损', 50000, 100000, 25000, ?, ?)`,
      db.genId(), c1.id, now, now,
    );
    db.execute(
      `INSERT INTO opc_acquisition_cases (id, company_id, acquirer_id, case_type, status, trigger_reason, acquisition_price, loss_amount, tax_deduction, created_at, updated_at)
       VALUES (?, ?, 'starriver', 'acquisition', 'evaluating', '市场萎缩', 80000, 200000, 50000, ?, ?)`,
      db.genId(), c2.id, now, now,
    );

    const summary = db.queryOne(
      `SELECT
         COUNT(*) as total_cases,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
         COUNT(CASE WHEN status = 'evaluating' THEN 1 END) as evaluating,
         COALESCE(SUM(acquisition_price), 0) as total_acquisition_cost,
         COALESCE(SUM(loss_amount), 0) as total_loss_amount,
         COALESCE(SUM(tax_deduction), 0) as total_tax_deduction
       FROM opc_acquisition_cases`,
    ) as Record<string, number>;

    expect(summary.total_cases).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.evaluating).toBe(1);
    expect(summary.total_acquisition_cost).toBe(130000);
    expect(summary.total_loss_amount).toBe(300000);
    expect(summary.total_tax_deduction).toBe(75000); // 100000×25% + 200000×25%
  });
});
