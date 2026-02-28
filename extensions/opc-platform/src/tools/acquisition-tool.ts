/**
 * 星环OPC中心 — opc_acquisition 收并购管理工具
 *
 * 资金闭环核心模块：当一人公司经营不善时，星河数科依据参股协议
 * 发起收并购，亏损可抵扣应纳税所得额，并为后续资产包打包做准备。
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { CompanyManager } from "../opc/company-manager.js";
import { json, toolError } from "../utils/tool-helper.js";

const AcquisitionSchema = Type.Union([
  Type.Object({
    action: Type.Literal("create_acquisition"),
    company_id: Type.String({ description: "被收购公司 ID" }),
    trigger_reason: Type.String({ description: "发起收购原因，如：连续亏损、市场萎缩、创始人退出等" }),
    acquisition_price: Type.Number({ description: "收购价格（元），通常低于注册资本" }),
    loss_amount: Type.Optional(Type.Number({ description: "公司累计亏损金额（元），用于税务抵扣计算" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("list_acquisitions"),
    status: Type.Optional(Type.String({ description: "按状态筛选: evaluating/in_progress/completed/cancelled" })),
    company_id: Type.Optional(Type.String({ description: "按公司筛选" })),
  }),
  Type.Object({
    action: Type.Literal("update_acquisition"),
    case_id: Type.String({ description: "收并购案例 ID" }),
    status: Type.Optional(Type.String({ description: "新状态: evaluating/in_progress/completed/cancelled" })),
    acquisition_price: Type.Optional(Type.Number({ description: "最终收购价格（元）" })),
    loss_amount: Type.Optional(Type.Number({ description: "确认亏损金额（元）" })),
    tax_deduction: Type.Optional(Type.Number({ description: "可抵扣税额（元），通常 = 亏损 × 企业所得税率25%" })),
    closed_date: Type.Optional(Type.String({ description: "完成日期 (YYYY-MM-DD)" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("acquisition_summary"),
    description: Type.Optional(Type.String({ description: "汇总平台所有收并购数据，含税务优化总额" })),
  }),
]);

type AcquisitionParams = Static<typeof AcquisitionSchema>;

export function registerAcquisitionTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  const manager = new CompanyManager(db);

  api.registerTool(
    {
      name: "opc_acquisition",
      label: "OPC 收并购管理",
      description:
        "收并购管理工具（资金闭环核心）。操作: " +
        "create_acquisition(发起收购，记录亏损公司收购案例), " +
        "list_acquisitions(收并购列表，可按状态/公司筛选), " +
        "update_acquisition(更新案例状态/价格/税务抵扣), " +
        "acquisition_summary(平台收并购汇总：总收购数、累计亏损、税务优化总额)",
      parameters: AcquisitionSchema,
      async execute(_toolCallId, params) {
        const p = params as AcquisitionParams;
        try {
          switch (p.action) {
            case "create_acquisition": {
              const id = db.genId();
              const now = new Date().toISOString();
              const lossAmount = p.loss_amount ?? 0;
              // 粗算税务抵扣：亏损 × 25% 企业所得税率
              const taxDeduction = lossAmount * 0.25;

              db.execute(
                `INSERT INTO opc_acquisition_cases
                   (id, company_id, acquirer_id, case_type, status, trigger_reason,
                    acquisition_price, loss_amount, tax_deduction, initiated_date, notes, created_at, updated_at)
                 VALUES (?, ?, 'starriver', 'acquisition', 'evaluating', ?, ?, ?, ?, date('now'), ?, ?, ?)`,
                id, p.company_id, p.trigger_reason,
                p.acquisition_price, lossAmount, taxDeduction,
                p.notes ?? "", now, now,
              );

              // 通过状态机将公司标记为 acquired
              const transitioned = manager.transitionStatus(p.company_id, "acquired");
              if (!transitioned) {
                return toolError(`公司 ${p.company_id} 不存在或当前状态不允许收购`, "INVALID_STATUS");
              }

              const row = db.queryOne(
                `SELECT a.*, c.name as company_name FROM opc_acquisition_cases a
                 LEFT JOIN opc_companies c ON a.company_id = c.id
                 WHERE a.id = ?`,
                id,
              );
              return json({ ok: true, case: row, note: `税务优化估算：亏损 ${lossAmount.toLocaleString()} 元 × 25% = 可抵扣 ${taxDeduction.toLocaleString()} 元` });
            }

            case "list_acquisitions": {
              let sql = `SELECT a.*, c.name as company_name, c.industry
                         FROM opc_acquisition_cases a
                         LEFT JOIN opc_companies c ON a.company_id = c.id
                         WHERE 1=1`;
              const vals: unknown[] = [];
              if (p.status) { sql += " AND a.status = ?"; vals.push(p.status); }
              if (p.company_id) { sql += " AND a.company_id = ?"; vals.push(p.company_id); }
              sql += " ORDER BY a.created_at DESC";
              return json(db.query(sql, ...vals));
            }

            case "update_acquisition": {
              const sets: string[] = ["updated_at = ?"];
              const vals: unknown[] = [new Date().toISOString()];
              if (p.status !== undefined) { sets.push("status = ?"); vals.push(p.status); }
              if (p.acquisition_price !== undefined) { sets.push("acquisition_price = ?"); vals.push(p.acquisition_price); }
              if (p.loss_amount !== undefined) { sets.push("loss_amount = ?"); vals.push(p.loss_amount); }
              if (p.tax_deduction !== undefined) { sets.push("tax_deduction = ?"); vals.push(p.tax_deduction); }
              if (p.closed_date !== undefined) { sets.push("closed_date = ?"); vals.push(p.closed_date); }
              if (p.notes !== undefined) { sets.push("notes = ?"); vals.push(p.notes); }
              vals.push(p.case_id);
              db.execute(`UPDATE opc_acquisition_cases SET ${sets.join(", ")} WHERE id = ?`, ...vals);
              return json(db.queryOne(
                `SELECT a.*, c.name as company_name FROM opc_acquisition_cases a
                 LEFT JOIN opc_companies c ON a.company_id = c.id WHERE a.id = ?`,
                p.case_id,
              ));
            }

            case "acquisition_summary": {
              const summary = db.queryOne(
                `SELECT
                   COUNT(*) as total_cases,
                   COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                   COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
                   COUNT(CASE WHEN status = 'evaluating' THEN 1 END) as evaluating,
                   COALESCE(SUM(acquisition_price), 0) as total_acquisition_cost,
                   COALESCE(SUM(loss_amount), 0) as total_loss_amount,
                   COALESCE(SUM(tax_deduction), 0) as total_tax_deduction
                 FROM opc_acquisition_cases`,
              );
              return json(summary);
            }

            default:
              return toolError(`未知操作: ${(p as { action: string }).action}`, "UNKNOWN_ACTION");
          }
        } catch (err) {
          return toolError(err instanceof Error ? err.message : String(err), "DB_ERROR");
        }
      },
    },
    { name: "opc_acquisition" },
  );

  api.logger.info("opc: 已注册 opc_acquisition 工具");
}
