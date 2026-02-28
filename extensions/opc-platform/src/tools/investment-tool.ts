/**
 * 星环OPC中心 — opc_investment 投融资管理工具
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json, toolError } from "../utils/tool-helper.js";

const InvestmentSchema = Type.Union([
  Type.Object({
    action: Type.Literal("create_round"),
    company_id: Type.String({ description: "公司 ID" }),
    round_name: Type.String({ description: "轮次名称: seed/angel/pre-A/A/B/C/D/IPO 等" }),
    amount: Type.Number({ description: "融资金额（元）" }),
    valuation_pre: Type.Optional(Type.Number({ description: "投前估值（元）" })),
    valuation_post: Type.Optional(Type.Number({ description: "投后估值（元）" })),
    lead_investor: Type.Optional(Type.String({ description: "领投方" })),
    close_date: Type.Optional(Type.String({ description: "关闭日期 (YYYY-MM-DD)" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("list_rounds"),
    company_id: Type.String({ description: "公司 ID" }),
    status: Type.Optional(Type.String({ description: "按状态筛选: planning/fundraising/closed/cancelled" })),
  }),
  Type.Object({
    action: Type.Literal("add_investor"),
    company_id: Type.String({ description: "公司 ID" }),
    round_id: Type.String({ description: "轮次 ID" }),
    name: Type.String({ description: "投资人名称" }),
    type: Type.Optional(Type.String({ description: "投资人类型: individual/institutional/angel/vc/strategic" })),
    amount: Type.Number({ description: "投资金额（元）" }),
    equity_percent: Type.Optional(Type.Number({ description: "持股比例（%）" })),
    contact: Type.Optional(Type.String({ description: "联系方式" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("list_investors"),
    company_id: Type.String({ description: "公司 ID" }),
    round_id: Type.Optional(Type.String({ description: "按轮次筛选" })),
  }),
  Type.Object({
    action: Type.Literal("cap_table"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("update_round"),
    round_id: Type.String({ description: "轮次 ID" }),
    status: Type.Optional(Type.String({ description: "新状态: planning/fundraising/closed/cancelled" })),
    amount: Type.Optional(Type.Number({ description: "实际融资金额（元）" })),
    valuation_post: Type.Optional(Type.Number({ description: "投后估值（元）" })),
    lead_investor: Type.Optional(Type.String({ description: "领投方" })),
    close_date: Type.Optional(Type.String({ description: "关闭日期 (YYYY-MM-DD)" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("valuation_history"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("delete_round"),
    round_id: Type.String({ description: "融资轮次 ID" }),
  }),
  Type.Object({
    action: Type.Literal("delete_investor"),
    investor_id: Type.String({ description: "投资人 ID" }),
  }),
]);

type InvestmentParams = Static<typeof InvestmentSchema>;

export function registerInvestmentTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerTool(
    {
      name: "opc_investment",
      label: "OPC 投融资管理",
      description:
        "投融资管理工具。操作: create_round(创建融资轮次), update_round(更新轮次状态/关闭融资), list_rounds(轮次列表), " +
        "add_investor(添加投资人), list_investors(投资人列表), " +
        "cap_table(股权结构表), valuation_history(估值变化历史), delete_round(删除融资轮次及投资人), delete_investor(删除投资人)",
      parameters: InvestmentSchema,
      async execute(_toolCallId, params) {
        const p = params as InvestmentParams;
        try {
          switch (p.action) {
            case "create_round": {
              const id = db.genId();
              const now = new Date().toISOString();
              const valuationPost = p.valuation_post ?? (p.valuation_pre ? p.valuation_pre + p.amount : 0);
              db.execute(
                `INSERT INTO opc_investment_rounds (id, company_id, round_name, amount, valuation_pre, valuation_post, status, lead_investor, close_date, notes, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'planning', ?, ?, ?, ?)`,
                id, p.company_id, p.round_name, p.amount,
                p.valuation_pre ?? 0, valuationPost,
                p.lead_investor ?? "", p.close_date ?? "", p.notes ?? "", now,
              );
              return json(db.queryOne("SELECT * FROM opc_investment_rounds WHERE id = ?", id));
            }

            case "list_rounds": {
              let sql = "SELECT * FROM opc_investment_rounds WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.status) { sql += " AND status = ?"; params2.push(p.status); }
              sql += " ORDER BY created_at DESC";
              return json(db.query(sql, ...params2));
            }

            case "add_investor": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_investors (id, round_id, company_id, name, type, amount, equity_percent, contact, notes, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                id, p.round_id, p.company_id, p.name,
                p.type ?? "individual", p.amount,
                p.equity_percent ?? 0, p.contact ?? "", p.notes ?? "", now,
              );
              return json(db.queryOne("SELECT * FROM opc_investors WHERE id = ?", id));
            }

            case "list_investors": {
              let sql = "SELECT * FROM opc_investors WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.round_id) { sql += " AND round_id = ?"; params2.push(p.round_id); }
              sql += " ORDER BY created_at DESC";
              return json(db.query(sql, ...params2));
            }

            case "cap_table": {
              const investors = db.query(
                `SELECT i.name, i.type, i.amount, i.equity_percent, r.round_name
                 FROM opc_investors i
                 JOIN opc_investment_rounds r ON i.round_id = r.id
                 WHERE i.company_id = ?
                 ORDER BY r.created_at, i.created_at`,
                p.company_id,
              ) as { name: string; type: string; amount: number; equity_percent: number; round_name: string }[];

              const totalEquity = investors.reduce((sum, inv) => sum + inv.equity_percent, 0);
              const totalInvested = investors.reduce((sum, inv) => sum + inv.amount, 0);

              return json({
                investors,
                total_invested: totalInvested,
                total_investor_equity: totalEquity,
                founder_equity: Math.max(0, 100 - totalEquity),
                investor_count: investors.length,
              });
            }

            case "update_round": {
              const sets: string[] = [];
              const vals: unknown[] = [];
              if (p.status !== undefined) { sets.push("status = ?"); vals.push(p.status); }
              if (p.amount !== undefined) { sets.push("amount = ?"); vals.push(p.amount); }
              if (p.valuation_post !== undefined) { sets.push("valuation_post = ?"); vals.push(p.valuation_post); }
              if (p.lead_investor !== undefined) { sets.push("lead_investor = ?"); vals.push(p.lead_investor); }
              if (p.close_date !== undefined) { sets.push("close_date = ?"); vals.push(p.close_date); }
              if (p.notes !== undefined) { sets.push("notes = ?"); vals.push(p.notes); }
              if (sets.length === 0) return toolError("未提供任何更新字段", "VALIDATION_ERROR");
              vals.push(p.round_id);
              db.execute(`UPDATE opc_investment_rounds SET ${sets.join(", ")} WHERE id = ?`, ...vals);
              return json(db.queryOne("SELECT * FROM opc_investment_rounds WHERE id = ?", p.round_id));
            }

            case "valuation_history": {
              const rounds = db.query(
                `SELECT round_name, amount, valuation_pre, valuation_post, status, close_date, created_at
                 FROM opc_investment_rounds
                 WHERE company_id = ?
                 ORDER BY created_at ASC`,
                p.company_id,
              );
              return json({ history: rounds });
            }

            case "delete_round": {
              db.execute("DELETE FROM opc_investors WHERE round_id = ?", p.round_id);
              db.execute("DELETE FROM opc_investment_rounds WHERE id = ?", p.round_id);
              return json({ ok: true });
            }

            case "delete_investor": {
              db.execute("DELETE FROM opc_investors WHERE id = ?", p.investor_id);
              return json({ ok: true });
            }

            default:
              return toolError(`未知操作: ${(p as { action: string }).action}`, "UNKNOWN_ACTION");
          }
        } catch (err) {
          return toolError(err instanceof Error ? err.message : String(err), "DB_ERROR");
        }
      },
    },
    { name: "opc_investment" },
  );

  api.logger.info("opc: 已注册 opc_investment 工具");
}
