/**
 * 星环OPC中心 — opc_procurement 服务采购工具
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json, toolError } from "../utils/tool-helper.js";

const ProcurementSchema = Type.Union([
  Type.Object({
    action: Type.Literal("create_service"),
    company_id: Type.String({ description: "公司 ID" }),
    name: Type.String({ description: "服务名称" }),
    category: Type.Optional(Type.String({ description: "服务类别: saas/outsource/subscription/consulting/other" })),
    provider: Type.Optional(Type.String({ description: "服务商名称" })),
    unit_price: Type.Number({ description: "单价（元）" }),
    billing_cycle: Type.Optional(Type.String({ description: "计费周期: monthly/quarterly/yearly/one_time" })),
    description: Type.Optional(Type.String({ description: "描述" })),
  }),
  Type.Object({
    action: Type.Literal("list_services"),
    company_id: Type.String({ description: "公司 ID" }),
    category: Type.Optional(Type.String({ description: "按类别筛选" })),
    status: Type.Optional(Type.String({ description: "按状态筛选: active/suspended/terminated" })),
  }),
  Type.Object({
    action: Type.Literal("create_order"),
    company_id: Type.String({ description: "公司 ID" }),
    service_id: Type.Optional(Type.String({ description: "关联服务 ID" })),
    title: Type.String({ description: "订单标题" }),
    amount: Type.Number({ description: "订单金额（元）" }),
    order_date: Type.Optional(Type.String({ description: "订单日期 (YYYY-MM-DD)" })),
    delivery_date: Type.Optional(Type.String({ description: "交付日期 (YYYY-MM-DD)" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("list_orders"),
    company_id: Type.String({ description: "公司 ID" }),
    status: Type.Optional(Type.String({ description: "按状态筛选: pending/approved/paid/cancelled" })),
  }),
  Type.Object({
    action: Type.Literal("update_order"),
    order_id: Type.String({ description: "订单 ID" }),
    status: Type.Optional(Type.String({ description: "新状态: pending/approved/paid/cancelled" })),
    delivery_date: Type.Optional(Type.String({ description: "交付日期 (YYYY-MM-DD)" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("order_summary"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("delete_service"),
    service_id: Type.String({ description: "服务项目 ID" }),
  }),
  Type.Object({
    action: Type.Literal("delete_order"),
    order_id: Type.String({ description: "采购订单 ID" }),
  }),
]);

type ProcurementParams = Static<typeof ProcurementSchema>;

export function registerProcurementTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerTool(
    {
      name: "opc_procurement",
      label: "OPC 服务采购",
      description:
        "服务采购管理工具。操作: create_service(添加服务项目), list_services(服务列表), " +
        "create_order(创建采购订单), update_order(更新订单状态/审批/付款), list_orders(订单列表), order_summary(采购汇总), delete_service(删除服务项目), delete_order(删除采购订单)",
      parameters: ProcurementSchema,
      async execute(_toolCallId, params) {
        const p = params as ProcurementParams;
        try {
          switch (p.action) {
            case "create_service": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_services (id, company_id, name, category, provider, unit_price, billing_cycle, status, description, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
                id, p.company_id, p.name,
                p.category ?? "", p.provider ?? "", p.unit_price,
                p.billing_cycle ?? "monthly", p.description ?? "", now, now,
              );
              return json(db.queryOne("SELECT * FROM opc_services WHERE id = ?", id));
            }

            case "list_services": {
              let sql = "SELECT * FROM opc_services WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.category) { sql += " AND category = ?"; params2.push(p.category); }
              if (p.status) { sql += " AND status = ?"; params2.push(p.status); }
              sql += " ORDER BY created_at DESC";
              return json(db.query(sql, ...params2));
            }

            case "create_order": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_procurement_orders (id, service_id, company_id, title, amount, status, order_date, delivery_date, notes, created_at)
                 VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
                id, p.service_id ?? "", p.company_id, p.title, p.amount,
                p.order_date ?? now.slice(0, 10), p.delivery_date ?? "", p.notes ?? "", now,
              );
              return json(db.queryOne("SELECT * FROM opc_procurement_orders WHERE id = ?", id));
            }

            case "list_orders": {
              let sql = "SELECT * FROM opc_procurement_orders WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.status) { sql += " AND status = ?"; params2.push(p.status); }
              sql += " ORDER BY order_date DESC";
              return json(db.query(sql, ...params2));
            }

            case "update_order": {
              const sets: string[] = [];
              const vals: unknown[] = [];
              if (p.status !== undefined) { sets.push("status = ?"); vals.push(p.status); }
              if (p.delivery_date !== undefined) { sets.push("delivery_date = ?"); vals.push(p.delivery_date); }
              if (p.notes !== undefined) { sets.push("notes = ?"); vals.push(p.notes); }
              if (sets.length === 0) return toolError("未提供任何更新字段", "VALIDATION_ERROR");
              vals.push(p.order_id);
              db.execute(`UPDATE opc_procurement_orders SET ${sets.join(", ")} WHERE id = ?`, ...vals);
              return json(db.queryOne("SELECT * FROM opc_procurement_orders WHERE id = ?", p.order_id));
            }

            case "order_summary": {
              const total = db.queryOne(
                `SELECT COUNT(*) as order_count, COALESCE(SUM(amount), 0) as total_amount
                 FROM opc_procurement_orders WHERE company_id = ?`,
                p.company_id,
              ) as { order_count: number; total_amount: number };

              const byStatus = db.query(
                `SELECT status, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
                 FROM opc_procurement_orders WHERE company_id = ?
                 GROUP BY status`,
                p.company_id,
              );

              const byCategory = db.query(
                `SELECT s.category, COUNT(o.id) as order_count, COALESCE(SUM(o.amount), 0) as total_amount
                 FROM opc_procurement_orders o
                 LEFT JOIN opc_services s ON o.service_id = s.id
                 WHERE o.company_id = ?
                 GROUP BY s.category`,
                p.company_id,
              );

              const activeServices = db.queryOne(
                `SELECT COUNT(*) as count, COALESCE(SUM(unit_price), 0) as monthly_cost
                 FROM opc_services WHERE company_id = ? AND status = 'active'`,
                p.company_id,
              );

              return json({
                ...total,
                by_status: byStatus,
                by_category: byCategory,
                active_services: activeServices,
              });
            }

            case "delete_service": {
              db.execute("DELETE FROM opc_services WHERE id = ?", p.service_id);
              return json({ ok: true });
            }

            case "delete_order": {
              db.execute("DELETE FROM opc_procurement_orders WHERE id = ?", p.order_id);
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
    { name: "opc_procurement" },
  );

  api.logger.info("opc: 已注册 opc_procurement 工具");
}
