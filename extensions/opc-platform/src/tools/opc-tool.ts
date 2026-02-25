/**
 * 星环OPC中心 — opc_manage 统一工具
 *
 * 单一工具 + action 字段模式，参照 feishu_doc 实现。
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { CompanyManager } from "../opc/company-manager.js";
import type { OpcCompanyStatus, OpcTransactionCategory, OpcTransactionType } from "../opc/types.js";
import { ensureCompanyWorkspace } from "../opc/workspace-factory.js";
import { OpcManageSchema, type OpcManageParams } from "./schemas.js";
import { json } from "../utils/tool-helper.js";

/**
 * 将 company_id（可能是 DB ID 或公司名称）解析为实际数据库 ID。
 * AI 有时会传公司名称而非 ID，此函数做兜底匹配。
 */
function resolveCompanyId(db: OpcDatabase, input: string): string {
  // 先精确匹配 ID
  const byId = db.queryOne("SELECT id FROM opc_companies WHERE id = ?", input) as { id: string } | null;
  if (byId) return byId.id;
  // 再精确匹配名称
  const byName = db.queryOne("SELECT id FROM opc_companies WHERE name = ?", input) as { id: string } | null;
  if (byName) return byName.id;
  // 最后模糊匹配名称
  const byLike = db.queryOne("SELECT id FROM opc_companies WHERE name LIKE ?", `%${input}%`) as { id: string } | null;
  if (byLike) return byLike.id;
  // 找不到就原样返回，由上层报错
  return input;
}

export function registerOpcTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  const manager = new CompanyManager(db);

  api.registerTool(
    {
      name: "opc_manage",
      label: "OPC 一人公司管理",
      description: [
        "一人公司(OPC)全生命周期管理工具。",
        "操作: register_company(注册公司), get_company(查询公司), list_companies(公司列表),",
        "update_company(更新公司), activate_company(激活公司), change_company_status(变更状态),",
        "add_transaction(记账), list_transactions(交易列表), finance_summary(财务摘要),",
        "add_contact(添加客户), list_contacts(客户列表), update_contact(更新客户),",
        "delete_contact(删除客户), dashboard(看板统计),",
        "set_company_skills(设置公司Agent skills), get_company_skills(查询公司Agent skills)",
      ].join(" "),
      parameters: OpcManageSchema,
      async execute(_toolCallId, params) {
        const p = params as OpcManageParams;
        try {
          switch (p.action) {
            // ── 公司管理 ──
            case "register_company": {
              const company = manager.registerCompany({
                name: p.name,
                industry: p.industry,
                owner_name: p.owner_name,
                owner_contact: p.owner_contact,
                registered_capital: p.registered_capital,
                description: p.description,
              });
              // 自动创建公司专属 Agent 工作区
              const skillsRow = db.queryOne("SELECT value FROM opc_tool_config WHERE key = ?", `company_skills_${company.id}`) as { value: string } | null;
              const companySkills: string[] = skillsRow ? (JSON.parse(skillsRow.value) as string[]) : [];
              ensureCompanyWorkspace({
                companyId: company.id,
                companyName: company.name,
                cfg: api.config,
                runtime: api.runtime,
                log: (msg) => api.logger.info(msg),
                skills: companySkills,
              }).catch((err) => api.logger.warn(`opc: 创建工作区失败: ${err}`));
              return json(company);
            }

            case "get_company":
              return json(manager.getCompany(p.company_id) ?? { error: "公司不存在" });

            case "list_companies":
              return json(
                manager.listCompanies(p.status as OpcCompanyStatus | undefined),
              );

            case "update_company":
              return json(
                manager.updateCompany(p.company_id, {
                  name: p.name,
                  industry: p.industry,
                  description: p.description,
                  owner_contact: p.owner_contact,
                }) ?? { error: "公司不存在" },
              );

            case "activate_company":
              return json(manager.activateCompany(p.company_id) ?? { error: "公司不存在" });

            case "change_company_status":
              return json(
                manager.transitionStatus(
                  p.company_id,
                  p.new_status as OpcCompanyStatus,
                ) ?? { error: "公司不存在" },
              );

            // ── 交易记录 ──
            case "add_transaction":
              return json(
                db.createTransaction({
                  company_id: p.company_id,
                  type: p.type as OpcTransactionType,
                  category: (p.category ?? "other") as OpcTransactionCategory,
                  amount: p.amount,
                  description: p.description ?? "",
                  counterparty: p.counterparty ?? "",
                  transaction_date: p.transaction_date ?? new Date().toISOString().slice(0, 10),
                }),
              );

            case "list_transactions":
              return json(
                db.listTransactions(p.company_id, {
                  type: p.type,
                  startDate: p.start_date,
                  endDate: p.end_date,
                  limit: p.limit ?? 50,
                }),
              );

            case "finance_summary":
              return json(
                db.getFinanceSummary(p.company_id, p.start_date, p.end_date),
              );

            // ── 客户管理 ──
            case "add_contact":
              return json(
                db.createContact({
                  company_id: p.company_id,
                  name: p.name,
                  phone: p.phone ?? "",
                  email: p.email ?? "",
                  company_name: p.company_name ?? "",
                  tags: p.tags ?? "[]",
                  notes: p.notes ?? "",
                  last_contact_date: new Date().toISOString().slice(0, 10),
                }),
              );

            case "list_contacts":
              return json(db.listContacts(p.company_id, p.tag));

            case "update_contact": {
              const updateData: Record<string, string> = {};
              if (p.name) updateData.name = p.name;
              if (p.phone) updateData.phone = p.phone;
              if (p.email) updateData.email = p.email;
              if (p.company_name) updateData.company_name = p.company_name;
              if (p.tags) updateData.tags = p.tags;
              if (p.notes) updateData.notes = p.notes;
              if (p.last_contact_date) updateData.last_contact_date = p.last_contact_date;
              return json(db.updateContact(p.contact_id, updateData) ?? { error: "联系人不存在" });
            }

            case "delete_contact":
              return json({ deleted: db.deleteContact(p.contact_id) });

            // ── Dashboard ──
            case "dashboard":
              return json(db.getDashboardStats());

            // ── Company Skills (OpenClaw agent-level skills) ──
            case "set_company_skills": {
              const resolvedId = resolveCompanyId(db, p.company_id);
              const key = `company_skills_${resolvedId}`;
              const value = JSON.stringify(p.skills ?? []);
              db.execute(
                `INSERT INTO opc_tool_config (key, value) VALUES (?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
                key, value,
              );
              return json({ ok: true, company_id: resolvedId, skills: p.skills });
            }

            case "get_company_skills": {
              const resolvedId = resolveCompanyId(db, p.company_id);
              const key = `company_skills_${resolvedId}`;
              const row = db.queryOne("SELECT value FROM opc_tool_config WHERE key = ?", key) as { value: string } | null;
              const skills = row ? (JSON.parse(row.value) as string[]) : [];
              return json({ company_id: resolvedId, skills });
            }

            default:
              return json({ error: `未知操作: ${(p as { action: string }).action}` });
          }
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    { name: "opc_manage" },
  );

  api.logger.info("opc: 已注册 opc_manage 工具");
}
