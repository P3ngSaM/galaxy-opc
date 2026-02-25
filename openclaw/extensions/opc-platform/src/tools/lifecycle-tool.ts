/**
 * 星环OPC中心 — opc_lifecycle 公司生命周期工具
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json } from "../utils/tool-helper.js";

const LifecycleSchema = Type.Union([
  Type.Object({
    action: Type.Literal("add_milestone"),
    company_id: Type.String({ description: "公司 ID" }),
    title: Type.String({ description: "里程碑标题" }),
    category: Type.Optional(Type.String({ description: "类别: business/product/finance/legal/team/other" })),
    target_date: Type.Optional(Type.String({ description: "目标日期 (YYYY-MM-DD)" })),
    description: Type.Optional(Type.String({ description: "描述" })),
  }),
  Type.Object({
    action: Type.Literal("list_milestones"),
    company_id: Type.String({ description: "公司 ID" }),
    status: Type.Optional(Type.String({ description: "按状态筛选: pending/in_progress/completed/cancelled" })),
    category: Type.Optional(Type.String({ description: "按类别筛选" })),
  }),
  Type.Object({
    action: Type.Literal("create_event"),
    company_id: Type.String({ description: "公司 ID" }),
    title: Type.String({ description: "事件标题" }),
    event_type: Type.Optional(Type.String({ description: "事件类型: registration/funding/product_launch/partnership/pivot/expansion/other" })),
    event_date: Type.Optional(Type.String({ description: "事件日期 (YYYY-MM-DD)" })),
    impact: Type.Optional(Type.String({ description: "影响说明" })),
    description: Type.Optional(Type.String({ description: "详细描述" })),
  }),
  Type.Object({
    action: Type.Literal("list_events"),
    company_id: Type.String({ description: "公司 ID" }),
    event_type: Type.Optional(Type.String({ description: "按事件类型筛选" })),
  }),
  Type.Object({
    action: Type.Literal("timeline"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("update_milestone"),
    milestone_id: Type.String({ description: "里程碑 ID" }),
    status: Type.Optional(Type.String({ description: "新状态: pending/in_progress/completed/cancelled" })),
    completed_date: Type.Optional(Type.String({ description: "实际完成日期 (YYYY-MM-DD)" })),
    description: Type.Optional(Type.String({ description: "更新描述" })),
  }),
  Type.Object({
    action: Type.Literal("generate_report"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("delete_milestone"),
    milestone_id: Type.String({ description: "里程碑 ID" }),
  }),
  Type.Object({
    action: Type.Literal("delete_event"),
    event_id: Type.String({ description: "事件 ID" }),
  }),
]);

type LifecycleParams = Static<typeof LifecycleSchema>;

export function registerLifecycleTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerTool(
    {
      name: "opc_lifecycle",
      label: "OPC 公司生命周期",
      description:
        "公司生命周期管理工具。操作: add_milestone(添加里程碑), update_milestone(更新里程碑状态/完成), list_milestones(里程碑列表), " +
        "create_event(记录公司事件), list_events(事件列表), " +
        "timeline(统一时间线), generate_report(公司综合报告), delete_milestone(删除里程碑), delete_event(删除事件)",
      parameters: LifecycleSchema,
      async execute(_toolCallId, params) {
        const p = params as LifecycleParams;
        try {
          switch (p.action) {
            case "add_milestone": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_milestones (id, company_id, title, category, target_date, completed_date, status, description, created_at)
                 VALUES (?, ?, ?, ?, ?, '', 'pending', ?, ?)`,
                id, p.company_id, p.title,
                p.category ?? "business", p.target_date ?? "", p.description ?? "", now,
              );
              return json(db.queryOne("SELECT * FROM opc_milestones WHERE id = ?", id));
            }

            case "list_milestones": {
              let sql = "SELECT * FROM opc_milestones WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.status) { sql += " AND status = ?"; params2.push(p.status); }
              if (p.category) { sql += " AND category = ?"; params2.push(p.category); }
              sql += " ORDER BY target_date ASC";
              return json(db.query(sql, ...params2));
            }

            case "create_event": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_lifecycle_events (id, company_id, event_type, title, event_date, impact, description, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                id, p.company_id, p.event_type ?? "other", p.title,
                p.event_date ?? now.slice(0, 10), p.impact ?? "", p.description ?? "", now,
              );
              return json(db.queryOne("SELECT * FROM opc_lifecycle_events WHERE id = ?", id));
            }

            case "list_events": {
              let sql = "SELECT * FROM opc_lifecycle_events WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.event_type) { sql += " AND event_type = ?"; params2.push(p.event_type); }
              sql += " ORDER BY event_date DESC";
              return json(db.query(sql, ...params2));
            }

            case "timeline": {
              const milestones = db.query(
                `SELECT 'milestone' as item_type, title, category as sub_type,
                        COALESCE(NULLIF(completed_date, ''), target_date) as date, status, description
                 FROM opc_milestones WHERE company_id = ?`,
                p.company_id,
              );
              const events = db.query(
                `SELECT 'event' as item_type, title, event_type as sub_type,
                        event_date as date, 'recorded' as status, description
                 FROM opc_lifecycle_events WHERE company_id = ?`,
                p.company_id,
              );
              const combined = [...(milestones as Record<string, unknown>[]), ...(events as Record<string, unknown>[])];
              combined.sort((a, b) => {
                const da = (a.date as string) || "9999";
                const db2 = (b.date as string) || "9999";
                return da.localeCompare(db2);
              });
              return json({ timeline: combined, total: combined.length });
            }

            case "update_milestone": {
              const sets: string[] = [];
              const vals: unknown[] = [];
              if (p.status !== undefined) { sets.push("status = ?"); vals.push(p.status); }
              if (p.completed_date !== undefined) { sets.push("completed_date = ?"); vals.push(p.completed_date); }
              if (p.description !== undefined) { sets.push("description = ?"); vals.push(p.description); }
              // 标记 completed 时自动填充今日日期
              if (p.status === "completed" && p.completed_date === undefined) {
                sets.push("completed_date = ?");
                vals.push(new Date().toISOString().slice(0, 10));
              }
              if (sets.length === 0) return json({ error: "未提供任何更新字段" });
              vals.push(p.milestone_id);
              db.execute(`UPDATE opc_milestones SET ${sets.join(", ")} WHERE id = ?`, ...vals);
              return json(db.queryOne("SELECT * FROM opc_milestones WHERE id = ?", p.milestone_id));
            }

            case "generate_report": {
              const company = db.queryOne("SELECT * FROM opc_companies WHERE id = ?", p.company_id);
              if (!company) return json({ error: "公司不存在" });

              const employees = db.query(
                "SELECT COUNT(*) as count FROM opc_hr_records WHERE company_id = ? AND status = 'active'", p.company_id,
              ) as { count: number }[];

              const finance = db.queryOne(
                `SELECT
                   COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) as total_income,
                   COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as total_expense,
                   COUNT(*) as tx_count
                 FROM opc_transactions WHERE company_id = ?`,
                p.company_id,
              );

              const contacts = db.queryOne(
                "SELECT COUNT(*) as count FROM opc_contacts WHERE company_id = ?", p.company_id,
              );

              const contracts = db.queryOne(
                `SELECT COUNT(*) as total,
                        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active
                 FROM opc_contracts WHERE company_id = ?`,
                p.company_id,
              );

              const projects = db.queryOne(
                `SELECT COUNT(*) as total,
                        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active
                 FROM opc_projects WHERE company_id = ?`,
                p.company_id,
              );

              const milestones = db.queryOne(
                `SELECT COUNT(*) as total,
                        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
                 FROM opc_milestones WHERE company_id = ?`,
                p.company_id,
              );

              const rounds = db.queryOne(
                `SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as total_raised
                 FROM opc_investment_rounds WHERE company_id = ? AND status = 'closed'`,
                p.company_id,
              );

              const alerts = db.queryOne(
                `SELECT COUNT(*) as active_alerts
                 FROM opc_alerts WHERE company_id = ? AND status = 'active'`,
                p.company_id,
              );

              return json({
                company,
                summary: {
                  employees: employees[0]?.count ?? 0,
                  finance,
                  contacts,
                  contracts,
                  projects,
                  milestones,
                  investment_rounds: rounds,
                  active_alerts: alerts,
                },
              });
            }

            case "delete_milestone": {
              db.execute("DELETE FROM opc_milestones WHERE id = ?", p.milestone_id);
              return json({ ok: true });
            }

            case "delete_event": {
              db.execute("DELETE FROM opc_lifecycle_events WHERE id = ?", p.event_id);
              return json({ ok: true });
            }

            default:
              return json({ error: `未知操作: ${(p as { action: string }).action}` });
          }
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    { name: "opc_lifecycle" },
  );

  api.logger.info("opc: 已注册 opc_lifecycle 工具");
}
