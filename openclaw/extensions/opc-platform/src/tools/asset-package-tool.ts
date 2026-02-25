/**
 * 星环OPC中心 — opc_asset_package 资产包管理工具
 *
 * 资金闭环第二阶段：将收并购回来的公司整合打包，
 * 形成具有真实运营数据和科创属性的"资产包"，
 * 转让给城投公司，协助城投申请科创贷，并收取融资服务费。
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json } from "../utils/tool-helper.js";

const AssetPackageSchema = Type.Union([
  // ── 资产包管理 ──
  Type.Object({
    action: Type.Literal("create_asset_package"),
    name: Type.String({ description: "资产包名称，如「仁和区2026Q1科创资产包」" }),
    description: Type.Optional(Type.String({ description: "资产包描述，包含科创属性说明" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("add_company_to_package"),
    package_id: Type.String({ description: "资产包 ID" }),
    company_id: Type.String({ description: "要加入的公司 ID（应为已收并购状态）" }),
    acquisition_case_id: Type.Optional(Type.String({ description: "关联的收并购案例 ID" })),
    valuation: Type.Number({ description: "该公司在资产包中的估值（元）" }),
  }),
  Type.Object({
    action: Type.Literal("list_asset_packages"),
    status: Type.Optional(Type.String({ description: "按状态筛选: assembling/ready/transferred/closed" })),
  }),
  Type.Object({
    action: Type.Literal("get_package_detail"),
    package_id: Type.String({ description: "资产包 ID" }),
  }),
  Type.Object({
    action: Type.Literal("update_package"),
    package_id: Type.String({ description: "资产包 ID" }),
    status: Type.Optional(Type.String({ description: "新状态: assembling/ready/transferred/closed" })),
    sci_tech_certified: Type.Optional(Type.Number({ description: "科创认定企业数量" })),
    assembled_date: Type.Optional(Type.String({ description: "打包完成日期 (YYYY-MM-DD)" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  // ── 城投转让 ──
  Type.Object({
    action: Type.Literal("create_ct_transfer"),
    package_id: Type.String({ description: "资产包 ID" }),
    ct_company: Type.String({ description: "城投公司名称，如「仁和工发集团」" }),
    transfer_price: Type.Number({ description: "资产包转让价格（元）" }),
    sci_loan_target: Type.Optional(Type.Number({ description: "城投目标科创贷金额（元）" })),
    transfer_date: Type.Optional(Type.String({ description: "转让日期 (YYYY-MM-DD)" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("update_ct_transfer"),
    transfer_id: Type.String({ description: "城投转让记录 ID" }),
    status: Type.Optional(Type.String({ description: "新状态: negotiating/signed/completed/cancelled" })),
    sci_loan_actual: Type.Optional(Type.Number({ description: "城投实际获得科创贷金额（元）" })),
    loan_date: Type.Optional(Type.String({ description: "放款日期 (YYYY-MM-DD)" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("list_ct_transfers"),
    status: Type.Optional(Type.String({ description: "按状态筛选" })),
  }),
  // ── 融资服务费 ──
  Type.Object({
    action: Type.Literal("record_financing_fee"),
    transfer_id: Type.String({ description: "城投转让记录 ID" }),
    base_amount: Type.Number({ description: "计费基数（通常为科创贷实际金额，元）" }),
    fee_rate: Type.Number({ description: "服务费率（%），通常 1%-3%" }),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("update_financing_fee"),
    fee_id: Type.String({ description: "融资服务费记录 ID" }),
    status: Type.Optional(Type.String({ description: "新状态: pending/invoiced/paid" })),
    invoiced: Type.Optional(Type.Number({ description: "是否已开票: 1=是, 0=否" })),
    paid_date: Type.Optional(Type.String({ description: "收款日期 (YYYY-MM-DD)" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  // ── 汇总报表 ──
  Type.Object({
    action: Type.Literal("closure_summary"),
    description: Type.Optional(Type.String({ description: "资金闭环整体汇总：资产包数、城投转让总额、科创贷总额、融资服务费总收入" })),
  }),
]);

type AssetPackageParams = Static<typeof AssetPackageSchema>;

export function registerAssetPackageTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerTool(
    {
      name: "opc_asset_package",
      label: "OPC 资产包与城投转让",
      description:
        "资产包管理与城投转让工具（资金闭环核心）。操作: " +
        "create_asset_package(创建资产包), add_company_to_package(将已收并购公司加入资产包), " +
        "list_asset_packages(资产包列表), get_package_detail(资产包详情+成员公司), update_package(更新状态/科创认定数), " +
        "create_ct_transfer(发起城投转让), update_ct_transfer(更新转让状态/科创贷金额), list_ct_transfers(转让记录列表), " +
        "record_financing_fee(记录融资服务费), update_financing_fee(更新收款状态), " +
        "closure_summary(资金闭环汇总报表)",
      parameters: AssetPackageSchema,
      async execute(_toolCallId, params) {
        const p = params as AssetPackageParams;
        try {
          switch (p.action) {
            case "create_asset_package": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_asset_packages
                   (id, name, description, status, total_valuation, company_count, sci_tech_certified, notes, created_at, updated_at)
                 VALUES (?, ?, ?, 'assembling', 0, 0, 0, ?, ?, ?)`,
                id, p.name, p.description ?? "", p.notes ?? "", now, now,
              );
              return json({ ok: true, package: db.queryOne("SELECT * FROM opc_asset_packages WHERE id = ?", id) });
            }

            case "add_company_to_package": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_asset_package_items (id, package_id, company_id, acquisition_case_id, valuation, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                id, p.package_id, p.company_id, p.acquisition_case_id ?? "", p.valuation, now,
              );
              // 更新资产包汇总
              db.execute(
                `UPDATE opc_asset_packages
                 SET company_count = (SELECT COUNT(*) FROM opc_asset_package_items WHERE package_id = ?),
                     total_valuation = (SELECT COALESCE(SUM(valuation),0) FROM opc_asset_package_items WHERE package_id = ?),
                     updated_at = ?
                 WHERE id = ?`,
                p.package_id, p.package_id, now, p.package_id,
              );
              const pkg = db.queryOne("SELECT * FROM opc_asset_packages WHERE id = ?", p.package_id);
              return json({ ok: true, item_id: id, package: pkg });
            }

            case "list_asset_packages": {
              let sql = "SELECT * FROM opc_asset_packages WHERE 1=1";
              const vals: unknown[] = [];
              if (p.status) { sql += " AND status = ?"; vals.push(p.status); }
              sql += " ORDER BY created_at DESC";
              return json(db.query(sql, ...vals));
            }

            case "get_package_detail": {
              const pkg = db.queryOne("SELECT * FROM opc_asset_packages WHERE id = ?", p.package_id);
              if (!pkg) return json({ error: "资产包不存在" });
              const items = db.query(
                `SELECT i.*, c.name as company_name, c.industry, c.status as company_status
                 FROM opc_asset_package_items i
                 LEFT JOIN opc_companies c ON i.company_id = c.id
                 WHERE i.package_id = ?
                 ORDER BY i.created_at`,
                p.package_id,
              );
              const transfers = db.query(
                "SELECT * FROM opc_ct_transfers WHERE package_id = ? ORDER BY created_at DESC",
                p.package_id,
              );
              return json({ package: pkg, companies: items, transfers });
            }

            case "update_package": {
              const sets: string[] = ["updated_at = ?"];
              const vals: unknown[] = [new Date().toISOString()];
              if (p.status !== undefined) { sets.push("status = ?"); vals.push(p.status); }
              if (p.sci_tech_certified !== undefined) { sets.push("sci_tech_certified = ?"); vals.push(p.sci_tech_certified); }
              if (p.assembled_date !== undefined) { sets.push("assembled_date = ?"); vals.push(p.assembled_date); }
              if (p.notes !== undefined) { sets.push("notes = ?"); vals.push(p.notes); }
              vals.push(p.package_id);
              db.execute(`UPDATE opc_asset_packages SET ${sets.join(", ")} WHERE id = ?`, ...vals);
              return json(db.queryOne("SELECT * FROM opc_asset_packages WHERE id = ?", p.package_id));
            }

            case "create_ct_transfer": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_ct_transfers
                   (id, package_id, ct_company, transfer_price, status, sci_loan_target, sci_loan_actual, transfer_date, notes, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'negotiating', ?, 0, ?, ?, ?, ?)`,
                id, p.package_id, p.ct_company, p.transfer_price,
                p.sci_loan_target ?? 0, p.transfer_date ?? "", p.notes ?? "", now, now,
              );
              // 更新资产包状态
              db.execute("UPDATE opc_asset_packages SET status = 'transferred', updated_at = ? WHERE id = ?", now, p.package_id);
              return json({ ok: true, transfer: db.queryOne("SELECT * FROM opc_ct_transfers WHERE id = ?", id) });
            }

            case "update_ct_transfer": {
              const sets: string[] = ["updated_at = ?"];
              const vals: unknown[] = [new Date().toISOString()];
              if (p.status !== undefined) { sets.push("status = ?"); vals.push(p.status); }
              if (p.sci_loan_actual !== undefined) { sets.push("sci_loan_actual = ?"); vals.push(p.sci_loan_actual); }
              if (p.loan_date !== undefined) { sets.push("loan_date = ?"); vals.push(p.loan_date); }
              if (p.notes !== undefined) { sets.push("notes = ?"); vals.push(p.notes); }
              vals.push(p.transfer_id);
              db.execute(`UPDATE opc_ct_transfers SET ${sets.join(", ")} WHERE id = ?`, ...vals);
              return json(db.queryOne("SELECT * FROM opc_ct_transfers WHERE id = ?", p.transfer_id));
            }

            case "list_ct_transfers": {
              let sql = `SELECT t.*, p.name as package_name, p.company_count
                         FROM opc_ct_transfers t
                         LEFT JOIN opc_asset_packages p ON t.package_id = p.id
                         WHERE 1=1`;
              const vals: unknown[] = [];
              if (p.status) { sql += " AND t.status = ?"; vals.push(p.status); }
              sql += " ORDER BY t.created_at DESC";
              return json(db.query(sql, ...vals));
            }

            case "record_financing_fee": {
              const id = db.genId();
              const now = new Date().toISOString();
              const feeAmount = p.base_amount * (p.fee_rate / 100);
              db.execute(
                `INSERT INTO opc_financing_fees
                   (id, transfer_id, fee_rate, fee_amount, base_amount, status, invoiced, notes, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
                id, p.transfer_id, p.fee_rate, feeAmount, p.base_amount, p.notes ?? "", now, now,
              );
              return json({
                ok: true,
                fee: db.queryOne("SELECT * FROM opc_financing_fees WHERE id = ?", id),
                calculation: `${p.base_amount.toLocaleString()} 元 × ${p.fee_rate}% = ${feeAmount.toLocaleString()} 元`,
              });
            }

            case "update_financing_fee": {
              const sets: string[] = ["updated_at = ?"];
              const vals: unknown[] = [new Date().toISOString()];
              if (p.status !== undefined) { sets.push("status = ?"); vals.push(p.status); }
              if (p.invoiced !== undefined) { sets.push("invoiced = ?"); vals.push(p.invoiced); }
              if (p.paid_date !== undefined) { sets.push("paid_date = ?"); vals.push(p.paid_date); }
              if (p.notes !== undefined) { sets.push("notes = ?"); vals.push(p.notes); }
              vals.push(p.fee_id);
              db.execute(`UPDATE opc_financing_fees SET ${sets.join(", ")} WHERE id = ?`, ...vals);
              return json(db.queryOne("SELECT * FROM opc_financing_fees WHERE id = ?", p.fee_id));
            }

            case "closure_summary": {
              const packages = db.queryOne(
                `SELECT COUNT(*) as total, COUNT(CASE WHEN status='transferred' THEN 1 END) as transferred,
                        COALESCE(SUM(total_valuation),0) as total_valuation,
                        COALESCE(SUM(company_count),0) as total_companies,
                        COALESCE(SUM(sci_tech_certified),0) as sci_tech_certified
                 FROM opc_asset_packages`,
              );
              const transfers = db.queryOne(
                `SELECT COUNT(*) as total,
                        COALESCE(SUM(transfer_price),0) as total_transfer_price,
                        COALESCE(SUM(sci_loan_target),0) as total_loan_target,
                        COALESCE(SUM(sci_loan_actual),0) as total_loan_actual
                 FROM opc_ct_transfers`,
              );
              const fees = db.queryOne(
                `SELECT COUNT(*) as total,
                        COALESCE(SUM(fee_amount),0) as total_fee,
                        COALESCE(SUM(CASE WHEN status='paid' THEN fee_amount ELSE 0 END),0) as collected_fee
                 FROM opc_financing_fees`,
              );
              return json({ asset_packages: packages, ct_transfers: transfers, financing_fees: fees });
            }

            default:
              return json({ error: `未知操作: ${(p as { action: string }).action}` });
          }
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    { name: "opc_asset_package" },
  );

  api.logger.info("opc: 已注册 opc_asset_package 工具");
}
