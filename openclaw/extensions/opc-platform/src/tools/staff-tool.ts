/**
 * 星环OPC中心 — opc_staff AI 员工岗位配置工具
 *
 * 为每家一人公司配置 AI 员工角色（行政/HR/财务/法务等），
 * 实现"一人 = AI 团队"的核心理念。
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json } from "../utils/tool-helper.js";

/** 内置 AI 岗位定义 */
const BUILTIN_ROLES: Record<string, { name: string; prompt: string; skills: string[] }> = {
  admin: {
    name: "行政助理",
    prompt: "你是公司行政助理，负责日程管理、文件归档、会议安排、行政事务协调。用专业、简洁的方式处理行政工作。",
    skills: ["schedule", "document", "meeting"],
  },
  hr: {
    name: "HR 专员",
    prompt: "你是公司 HR 专员，负责员工招聘、入职手续、薪酬核算、劳动合同管理、社保公积金事务。熟悉劳动法规。",
    skills: ["recruit", "payroll", "labor-law"],
  },
  finance: {
    name: "财务顾问",
    prompt: "你是公司财务顾问，负责账务记录、发票管理、税务申报、现金流分析、财务报表。熟悉中国财税法规。",
    skills: ["bookkeeping", "tax", "invoice", "cashflow"],
  },
  legal: {
    name: "法务助理",
    prompt: "你是公司法务助理，负责合同审查、风险评估、合规检查、法律文件起草。熟悉中国商业法律。",
    skills: ["contract-review", "compliance", "risk-assessment"],
  },
  marketing: {
    name: "市场推广",
    prompt: "你是公司市场推广专员，负责品牌推广、内容营销、社交媒体运营、客户获取策略。",
    skills: ["content", "social-media", "brand"],
  },
  ops: {
    name: "运营经理",
    prompt: "你是公司运营经理，负责项目管理、流程优化、供应链协调、KPI 跟踪与分析。",
    skills: ["project-mgmt", "process", "kpi"],
  },
};

const StaffSchema = Type.Union([
  Type.Object({
    action: Type.Literal("configure_staff"),
    company_id: Type.String({ description: "公司 ID" }),
    role: Type.String({ description: "岗位角色: admin/hr/finance/legal/marketing/ops 或自定义" }),
    role_name: Type.Optional(Type.String({ description: "岗位显示名称，不填则使用内置名称" })),
    enabled: Type.Optional(Type.Boolean({ description: "是否启用，默认 true" })),
    system_prompt: Type.Optional(Type.String({ description: "自定义系统提示词，不填则使用内置提示词" })),
    skills: Type.Optional(Type.String({ description: "技能列表 JSON 数组，如 [\"finance\",\"tax\"]" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("list_staff"),
    company_id: Type.String({ description: "公司 ID" }),
    enabled_only: Type.Optional(Type.Boolean({ description: "仅返回已启用岗位，默认 false" })),
  }),
  Type.Object({
    action: Type.Literal("toggle_staff"),
    company_id: Type.String({ description: "公司 ID" }),
    role: Type.String({ description: "岗位角色" }),
    enabled: Type.Boolean({ description: "true=启用, false=停用" }),
  }),
  Type.Object({
    action: Type.Literal("init_default_staff"),
    company_id: Type.String({ description: "公司 ID，将初始化 6 个默认 AI 岗位" }),
  }),
  Type.Object({
    action: Type.Literal("list_builtin_roles"),
  }),
]);

type StaffParams = Static<typeof StaffSchema>;

export function registerStaffTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerTool(
    {
      name: "opc_staff",
      label: "OPC AI 员工配置",
      description:
        "AI 员工岗位配置工具。实现\"一人公司 = AI 团队\"。" +
        "操作: configure_staff(配置/更新岗位), list_staff(岗位列表), " +
        "toggle_staff(启用/停用岗位), init_default_staff(一键初始化6个默认岗位), " +
        "list_builtin_roles(查看内置岗位模板)",
      parameters: StaffSchema,
      async execute(_toolCallId, params) {
        const p = params as StaffParams;
        try {
          switch (p.action) {
            case "configure_staff": {
              const builtin = BUILTIN_ROLES[p.role];
              const roleName = p.role_name ?? builtin?.name ?? p.role;
              const prompt = p.system_prompt ?? builtin?.prompt ?? "";
              const skills = p.skills ?? JSON.stringify(builtin?.skills ?? []);
              const now = new Date().toISOString();

              // UPSERT: 存在则更新，不存在则插入
              const existing = db.queryOne(
                "SELECT id FROM opc_staff_config WHERE company_id = ? AND role = ?",
                p.company_id, p.role,
              );

              if (existing) {
                const sets: string[] = ["role_name = ?", "system_prompt = ?", "skills = ?", "updated_at = ?"];
                const vals: unknown[] = [roleName, prompt, skills, now];
                if (p.enabled !== undefined) { sets.push("enabled = ?"); vals.push(p.enabled ? 1 : 0); }
                if (p.notes !== undefined) { sets.push("notes = ?"); vals.push(p.notes); }
                vals.push(p.company_id, p.role);
                db.execute(
                  `UPDATE opc_staff_config SET ${sets.join(", ")} WHERE company_id = ? AND role = ?`,
                  ...vals,
                );
              } else {
                const id = db.genId();
                db.execute(
                  `INSERT INTO opc_staff_config (id, company_id, role, role_name, enabled, system_prompt, skills, notes, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  id, p.company_id, p.role, roleName,
                  (p.enabled ?? true) ? 1 : 0,
                  prompt, skills, p.notes ?? "", now, now,
                );
              }

              return json(db.queryOne(
                "SELECT * FROM opc_staff_config WHERE company_id = ? AND role = ?",
                p.company_id, p.role,
              ));
            }

            case "list_staff": {
              let sql = "SELECT * FROM opc_staff_config WHERE company_id = ?";
              const args: unknown[] = [p.company_id];
              if (p.enabled_only) { sql += " AND enabled = 1"; }
              sql += " ORDER BY created_at ASC";
              const rows = db.query(sql, ...args);
              return json({ staff: rows, count: (rows as unknown[]).length });
            }

            case "toggle_staff": {
              const now = new Date().toISOString();
              db.execute(
                "UPDATE opc_staff_config SET enabled = ?, updated_at = ? WHERE company_id = ? AND role = ?",
                p.enabled ? 1 : 0, now, p.company_id, p.role,
              );
              return json(db.queryOne(
                "SELECT * FROM opc_staff_config WHERE company_id = ? AND role = ?",
                p.company_id, p.role,
              ) ?? { error: "岗位配置不存在，请先调用 configure_staff 或 init_default_staff" });
            }

            case "init_default_staff": {
              const company = db.queryOne("SELECT * FROM opc_companies WHERE id = ?", p.company_id);
              if (!company) return json({ error: "公司不存在" });

              const now = new Date().toISOString();
              const created: string[] = [];
              const skipped: string[] = [];

              for (const [role, def] of Object.entries(BUILTIN_ROLES)) {
                const exists = db.queryOne(
                  "SELECT id FROM opc_staff_config WHERE company_id = ? AND role = ?",
                  p.company_id, role,
                );
                if (exists) { skipped.push(role); continue; }

                const id = db.genId();
                db.execute(
                  `INSERT INTO opc_staff_config (id, company_id, role, role_name, enabled, system_prompt, skills, notes, created_at, updated_at)
                   VALUES (?, ?, ?, ?, 1, ?, ?, '', ?, ?)`,
                  id, p.company_id, role, def.name,
                  def.prompt, JSON.stringify(def.skills), now, now,
                );
                created.push(role);
              }

              return json({
                company_id: p.company_id,
                created,
                skipped,
                message: `已初始化 ${created.length} 个 AI 岗位${skipped.length > 0 ? `，跳过 ${skipped.length} 个已存在岗位` : ""}`,
              });
            }

            case "list_builtin_roles": {
              const roles = Object.entries(BUILTIN_ROLES).map(([role, def]) => ({
                role,
                name: def.name,
                skills: def.skills,
                prompt_preview: def.prompt.slice(0, 50) + "…",
              }));
              return json({ builtin_roles: roles, count: roles.length });
            }

            default:
              return json({ error: `未知操作: ${(p as { action: string }).action}` });
          }
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    { name: "opc_staff" },
  );

  api.logger.info("opc: 已注册 opc_staff 工具");
}
