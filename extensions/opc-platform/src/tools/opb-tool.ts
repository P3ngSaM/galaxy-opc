/**
 * 星环OPC中心 — opc_opb 一人企业画布工具
 *
 * 基于《一人企业方法论2.0》的 OPB Canvas（16模块），
 * 帮助创始人系统化设计与记录其一人公司战略蓝图。
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json, toolError } from "../utils/tool-helper.js";

const OPB_FIELDS = [
  "track",             // 赛道（所处行业/细分市场）
  "target_customer",   // 目标客户
  "pain_point",        // 核心痛点
  "solution",          // 解决方案
  "unique_value",      // 独特价值主张（USP）
  "channels",          // 获客渠道
  "revenue_model",     // 收入模式
  "cost_structure",    // 成本结构
  "key_resources",     // 关键资源
  "key_activities",    // 关键活动
  "key_partners",      // 关键合作伙伴
  "unfair_advantage",  // 不公平优势
  "metrics",           // 关键指标
  "non_compete",       // 非竞争策略
  "scaling_strategy",  // 规模化路径
  "notes",             // 备注
] as const;

const OpbSchema = Type.Union([
  Type.Object({
    action: Type.Literal("canvas_init"),
    company_id: Type.String({ description: "公司 ID" }),
    track: Type.Optional(Type.String({ description: "赛道（所处行业/细分市场）" })),
    target_customer: Type.Optional(Type.String({ description: "目标客户画像" })),
    pain_point: Type.Optional(Type.String({ description: "核心痛点" })),
    solution: Type.Optional(Type.String({ description: "解决方案" })),
    unique_value: Type.Optional(Type.String({ description: "独特价值主张（USP）" })),
    channels: Type.Optional(Type.String({ description: "获客渠道" })),
    revenue_model: Type.Optional(Type.String({ description: "收入模式" })),
    cost_structure: Type.Optional(Type.String({ description: "成本结构" })),
    key_resources: Type.Optional(Type.String({ description: "关键资源（三个池子：内容/产品/客户）" })),
    key_activities: Type.Optional(Type.String({ description: "关键活动" })),
    key_partners: Type.Optional(Type.String({ description: "关键合作伙伴" })),
    unfair_advantage: Type.Optional(Type.String({ description: "不公平优势" })),
    metrics: Type.Optional(Type.String({ description: "关键指标（KPI）" })),
    non_compete: Type.Optional(Type.String({ description: "非竞争策略" })),
    scaling_strategy: Type.Optional(Type.String({ description: "规模化路径" })),
    notes: Type.Optional(Type.String({ description: "其他备注" })),
  }),
  Type.Object({
    action: Type.Literal("canvas_get"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("canvas_update"),
    company_id: Type.String({ description: "公司 ID" }),
    track: Type.Optional(Type.String({ description: "赛道（所处行业/细分市场）" })),
    target_customer: Type.Optional(Type.String({ description: "目标客户画像" })),
    pain_point: Type.Optional(Type.String({ description: "核心痛点" })),
    solution: Type.Optional(Type.String({ description: "解决方案" })),
    unique_value: Type.Optional(Type.String({ description: "独特价值主张（USP）" })),
    channels: Type.Optional(Type.String({ description: "获客渠道" })),
    revenue_model: Type.Optional(Type.String({ description: "收入模式" })),
    cost_structure: Type.Optional(Type.String({ description: "成本结构" })),
    key_resources: Type.Optional(Type.String({ description: "关键资源（三个池子：内容/产品/客户）" })),
    key_activities: Type.Optional(Type.String({ description: "关键活动" })),
    key_partners: Type.Optional(Type.String({ description: "关键合作伙伴" })),
    unfair_advantage: Type.Optional(Type.String({ description: "不公平优势" })),
    metrics: Type.Optional(Type.String({ description: "关键指标（KPI）" })),
    non_compete: Type.Optional(Type.String({ description: "非竞争策略" })),
    scaling_strategy: Type.Optional(Type.String({ description: "规模化路径" })),
    notes: Type.Optional(Type.String({ description: "其他备注" })),
  }),
]);

type OpbParams = Static<typeof OpbSchema>;

interface CanvasRow {
  id: string; company_id: string;
  track: string; target_customer: string; pain_point: string; solution: string;
  unique_value: string; channels: string; revenue_model: string; cost_structure: string;
  key_resources: string; key_activities: string; key_partners: string;
  unfair_advantage: string; metrics: string; non_compete: string;
  scaling_strategy: string; notes: string;
  created_at: string; updated_at: string;
}

export function registerOpbTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerTool(
    {
      name: "opc_opb",
      label: "OPB 一人企业画布",
      description:
        "一人企业方法论（OPB）画布工具。" +
        "操作: canvas_init（初始化/填写画布）, canvas_get（查看画布）, canvas_update（更新画布字段）。" +
        "画布涵盖 16 个模块：赛道、目标客户、痛点、解决方案、独特价值、获客渠道、" +
        "收入模式、成本结构、关键资源、关键活动、关键合作伙伴、不公平优势、" +
        "关键指标、非竞争策略、规模化路径、备注。",
      parameters: OpbSchema,
      async execute(_toolCallId, params) {
        const p = params as OpbParams;
        try {
          switch (p.action) {
            case "canvas_init": {
              // Check if canvas already exists
              const existing = db.queryOne(
                "SELECT id FROM opc_opb_canvas WHERE company_id = ?", p.company_id,
              ) as { id: string } | null;
              if (existing) {
                return toolError("该公司画布已存在，请使用 canvas_update 更新", "VALIDATION_ERROR");
              }
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_opb_canvas (
                  id, company_id, track, target_customer, pain_point, solution,
                  unique_value, channels, revenue_model, cost_structure,
                  key_resources, key_activities, key_partners, unfair_advantage,
                  metrics, non_compete, scaling_strategy, notes, created_at, updated_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                id, p.company_id,
                p.track ?? "", p.target_customer ?? "", p.pain_point ?? "", p.solution ?? "",
                p.unique_value ?? "", p.channels ?? "", p.revenue_model ?? "", p.cost_structure ?? "",
                p.key_resources ?? "", p.key_activities ?? "", p.key_partners ?? "",
                p.unfair_advantage ?? "", p.metrics ?? "", p.non_compete ?? "",
                p.scaling_strategy ?? "", p.notes ?? "", now, now,
              );
              const canvas = db.queryOne(
                "SELECT * FROM opc_opb_canvas WHERE id = ?", id,
              ) as CanvasRow;
              return json({ ok: true, canvas, message: "OPB 画布已初始化。建议逐步填写各模块内容。" });
            }

            case "canvas_get": {
              const canvas = db.queryOne(
                "SELECT * FROM opc_opb_canvas WHERE company_id = ?", p.company_id,
              ) as CanvasRow | null;
              if (!canvas) {
                return toolError("该公司暂无 OPB 画布，请先使用 canvas_init 创建", "RECORD_NOT_FOUND");
              }
              // Calculate completion percentage
              const filled = OPB_FIELDS.filter(f => canvas[f as keyof CanvasRow] && String(canvas[f as keyof CanvasRow]).trim() !== "").length;
              const completion = Math.round((filled / (OPB_FIELDS.length - 1)) * 100); // exclude notes
              return json({ canvas, completion, total_fields: OPB_FIELDS.length - 1, filled });
            }

            case "canvas_update": {
              const existing = db.queryOne(
                "SELECT id FROM opc_opb_canvas WHERE company_id = ?", p.company_id,
              ) as { id: string } | null;
              if (!existing) {
                return toolError("该公司暂无 OPB 画布，请先使用 canvas_init 创建", "RECORD_NOT_FOUND");
              }
              const now = new Date().toISOString();
              const updates: string[] = [];
              const vals: unknown[] = [];
              for (const field of OPB_FIELDS) {
                const val = (p as Record<string, unknown>)[field];
                if (val !== undefined) {
                  updates.push(`${field} = ?`);
                  vals.push(val);
                }
              }
              if (updates.length === 0) {
                return toolError("未提供任何更新字段", "VALIDATION_ERROR");
              }
              updates.push("updated_at = ?");
              vals.push(now, existing.id);
              db.execute(
                `UPDATE opc_opb_canvas SET ${updates.join(", ")} WHERE id = ?`,
                ...vals,
              );
              const canvas = db.queryOne(
                "SELECT * FROM opc_opb_canvas WHERE id = ?", existing.id,
              ) as CanvasRow;
              return json({ ok: true, canvas, updated_fields: updates.length - 1 });
            }

            default:
              return toolError(`未知操作: ${(p as { action: string }).action}`, "UNKNOWN_ACTION");
          }
        } catch (err) {
          return toolError(err instanceof Error ? err.message : String(err), "DB_ERROR");
        }
      },
    },
    { name: "opc_opb" },
  );
  api.logger.info("opc: 已注册 opc_opb 工具");
}
