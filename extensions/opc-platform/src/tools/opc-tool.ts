/**
 * 星环OPC中心 — opc_manage 统一工具
 *
 * 单一工具 + action 字段模式，参照 feishu_doc 实现。
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { BusinessWorkflows } from "../opc/business-workflows.js";
import { CompanyManager } from "../opc/company-manager.js";
import type { OpcCompanyStatus, OpcTransactionCategory, OpcTransactionType } from "../opc/types.js";
import { ensureCompanyWorkspace } from "../opc/workspace-factory.js";
import { OpcManageSchema, type OpcManageParams } from "./schemas.js";
import { json, toolError, validationError } from "../utils/tool-helper.js";

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
        "add_contact(添加客户,支持CRM字段pipeline_stage/follow_up_date/deal_value/source),",
        "list_contacts(客户列表), update_contact(更新客户,支持CRM字段),",
        "delete_contact(删除客户), dashboard(看板统计),",
        "set_company_skills(设置公司Agent skills), get_company_skills(查询公司Agent skills),",
        "batch_import_contacts(批量导入联系人),",
        "crm_pipeline(销售漏斗), add_interaction(添加客户交互记录),",
        "list_interactions(交互历史), follow_up_reminders(跟进提醒),",
        "setup_feishu_channel(配置飞书频道), feishu_channel_status(查询飞书状态),",
        "switch_company(切换到指定公司的专属Agent)",
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

            case "get_company": {
              const found = manager.getCompany(p.company_id);
              if (!found) return toolError(`公司 ${p.company_id} 不存在`, "COMPANY_NOT_FOUND");
              return json(found);
            }

            case "list_companies":
              return json(
                manager.listCompanies(p.status as OpcCompanyStatus | undefined),
              );

            case "update_company": {
              const updated = manager.updateCompany(p.company_id, {
                name: p.name,
                industry: p.industry,
                description: p.description,
                owner_contact: p.owner_contact,
              });
              if (!updated) return toolError(`公司 ${p.company_id} 不存在`, "COMPANY_NOT_FOUND");
              return json(updated);
            }

            case "activate_company": {
              const activated = manager.activateCompany(p.company_id);
              if (!activated) return toolError(`公司 ${p.company_id} 不存在`, "COMPANY_NOT_FOUND");
              return json(activated);
            }

            case "change_company_status": {
              const transitioned = manager.transitionStatus(
                p.company_id,
                p.new_status as OpcCompanyStatus,
              );
              if (!transitioned) return toolError(`公司 ${p.company_id} 不存在`, "COMPANY_NOT_FOUND");
              return json(transitioned);
            }

            // ── 交易记录 ──
            case "add_transaction": {
              const tx = db.createTransaction({
                company_id: p.company_id,
                type: p.type as OpcTransactionType,
                category: (p.category ?? "other") as OpcTransactionCategory,
                amount: p.amount,
                description: p.description ?? "",
                counterparty: p.counterparty ?? "",
                transaction_date: p.transaction_date ?? new Date().toISOString().slice(0, 10),
              });
              // 业务闭环：收入自动开票、大额记里程碑
              const workflows = new BusinessWorkflows(db);
              const autoCreated = workflows.afterTransactionCreated({
                id: tx.id, company_id: p.company_id, type: p.type,
                amount: p.amount, counterparty: p.counterparty ?? "",
                description: p.description ?? "",
              });
              return json({ ...tx as object, _auto_created: autoCreated });
            }

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
            case "add_contact": {
              const contact = db.createContact({
                company_id: p.company_id,
                name: p.name,
                phone: p.phone ?? "",
                email: p.email ?? "",
                company_name: p.company_name ?? "",
                tags: p.tags ?? "[]",
                notes: p.notes ?? "",
                last_contact_date: new Date().toISOString().slice(0, 10),
              });
              // Update CRM fields if provided
              const crmFields: Record<string, unknown> = {};
              if ((p as Record<string, unknown>).pipeline_stage) crmFields.pipeline_stage = (p as Record<string, unknown>).pipeline_stage;
              if ((p as Record<string, unknown>).follow_up_date) crmFields.follow_up_date = (p as Record<string, unknown>).follow_up_date;
              if ((p as Record<string, unknown>).deal_value !== undefined) crmFields.deal_value = (p as Record<string, unknown>).deal_value;
              if ((p as Record<string, unknown>).source) crmFields.source = (p as Record<string, unknown>).source;
              if (Object.keys(crmFields).length > 0) {
                const sets = Object.keys(crmFields).map((k) => `${k} = ?`).join(", ");
                db.execute(`UPDATE opc_contacts SET ${sets} WHERE id = ?`, ...Object.values(crmFields), contact.id);
              }
              return json(db.queryOne("SELECT * FROM opc_contacts WHERE id = ?", contact.id));
            }

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
              const updatedContact = db.updateContact(p.contact_id, updateData);
              if (!updatedContact) return toolError(`联系人 ${p.contact_id} 不存在`, "CONTACT_NOT_FOUND");
              // Update CRM fields if provided
              const pp = p as Record<string, unknown>;
              const crmUpd: Record<string, unknown> = {};
              if (pp.pipeline_stage) crmUpd.pipeline_stage = pp.pipeline_stage;
              if (pp.follow_up_date) crmUpd.follow_up_date = pp.follow_up_date;
              if (pp.deal_value !== undefined) crmUpd.deal_value = pp.deal_value;
              if (pp.source) crmUpd.source = pp.source;
              if (Object.keys(crmUpd).length > 0) {
                const sets = Object.keys(crmUpd).map((k) => `${k} = ?`).join(", ");
                db.execute(`UPDATE opc_contacts SET ${sets}, updated_at = ? WHERE id = ?`, ...Object.values(crmUpd), new Date().toISOString(), p.contact_id);
              }
              return json(db.queryOne("SELECT * FROM opc_contacts WHERE id = ?", p.contact_id));
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

            // ── 批量导入联系人 ──
            case "batch_import_contacts": {
              const records: unknown[] = [];
              db.transaction(() => {
                const now = new Date().toISOString();
                const today = now.slice(0, 10);
                for (const c of p.contacts) {
                  const id = db.genId();
                  db.execute(
                    `INSERT OR IGNORE INTO opc_contacts (id, company_id, name, phone, email, company_name, tags, notes, last_contact_date, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)`,
                    id, p.company_id, c.name, c.phone ?? "", c.email ?? "",
                    c.company_name ?? "", c.tags ?? "[]", today, now, now,
                  );
                  records.push({ id, name: c.name });
                }
              });
              return json({ ok: true, imported_count: records.length, records });
            }

            // ── CRM 销售漏斗 ──
            case "crm_pipeline": {
              const stages = ["lead", "qualified", "proposal", "negotiation", "won", "lost", "churned"];
              const pipeline: Record<string, { count: number; total_deal_value: number; contacts: unknown[] }> = {};
              for (const stage of stages) {
                const contacts = db.query(
                  `SELECT id, name, company_name, deal_value, follow_up_date, source
                   FROM opc_contacts WHERE company_id = ? AND pipeline_stage = ?
                   ORDER BY deal_value DESC`,
                  p.company_id, stage,
                ) as unknown[];
                const totalValue = (contacts as { deal_value: number }[]).reduce((s, c) => s + (c.deal_value || 0), 0);
                pipeline[stage] = { count: contacts.length, total_deal_value: totalValue, contacts };
              }
              return json({ ok: true, pipeline });
            }

            // ── 添加客户交互记录 ──
            case "add_interaction": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_contact_interactions (id, contact_id, company_id, interaction_type, content, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                id, p.contact_id, p.company_id, p.interaction_type, p.content, now,
              );
              // 自动更新联系人的 last_contact_date
              db.execute(
                "UPDATE opc_contacts SET last_contact_date = ?, updated_at = ? WHERE id = ?",
                now.slice(0, 10), now, p.contact_id,
              );
              return json(db.queryOne("SELECT * FROM opc_contact_interactions WHERE id = ?", id));
            }

            // ── 查看交互历史 ──
            case "list_interactions": {
              const limit = (p as Record<string, unknown>).limit ?? 20;
              const interactions = db.query(
                `SELECT i.*, c.name as contact_name FROM opc_contact_interactions i
                 LEFT JOIN opc_contacts c ON i.contact_id = c.id
                 WHERE i.contact_id = ? ORDER BY i.created_at DESC LIMIT ?`,
                p.contact_id, limit,
              );
              return json(interactions);
            }

            // ── 跟进提醒 ──
            case "follow_up_reminders": {
              const days = (p as Record<string, unknown>).days ?? 7;
              const futureDate = new Date();
              futureDate.setDate(futureDate.getDate() + (days as number));
              const futureDateStr = futureDate.toISOString().slice(0, 10);
              const today = new Date().toISOString().slice(0, 10);

              const upcoming = db.query(
                `SELECT id, name, company_name, pipeline_stage, deal_value, follow_up_date, source
                 FROM opc_contacts
                 WHERE company_id = ? AND follow_up_date != '' AND follow_up_date <= ?
                   AND pipeline_stage NOT IN ('won', 'lost', 'churned')
                 ORDER BY follow_up_date`,
                p.company_id, futureDateStr,
              ) as { follow_up_date: string }[];

              const overdue = upcoming.filter((c) => c.follow_up_date < today);
              const dueSoon = upcoming.filter((c) => c.follow_up_date >= today);

              return json({ ok: true, overdue_count: overdue.length, upcoming_count: dueSoon.length, overdue, upcoming: dueSoon });
            }

            // ── 飞书频道 ──
            case "setup_feishu_channel": {
              const cfg = api.runtime.config.loadConfig() as Record<string, unknown>;
              const channels = (cfg.channels ?? {}) as Record<string, unknown>;
              channels.feishu = {
                enabled: true,
                dmPolicy: "pairing",
                groupPolicy: "open",
                streaming: true,
                accounts: {
                  main: {
                    appId: p.app_id,
                    appSecret: p.app_secret,
                    botName: p.bot_name || "\u661F\u73AFOPC\u52A9\u624B",
                  },
                },
              };
              cfg.channels = channels;
              await api.runtime.config.writeConfigFile(cfg);
              return json({ ok: true, message: "\u98DE\u4E66\u9891\u9053\u5DF2\u914D\u7F6E\uFF0C\u7CFB\u7EDF\u5C06\u81EA\u52A8\u91CD\u542F" });
            }

            case "feishu_channel_status": {
              const cfg = api.runtime.config.loadConfig();
              const feishuCfg = (cfg as Record<string, unknown>).channels as Record<string, unknown> | undefined;
              const feishu = feishuCfg?.feishu as Record<string, unknown> | undefined;
              const accounts = feishu?.accounts as Record<string, Record<string, string>> | undefined;
              const main = accounts?.main;
              return json({
                configured: !!(main?.appId && main.appId !== "YOUR_FEISHU_APP_ID"),
                enabled: feishu?.enabled ?? false,
                botName: main?.botName ?? "",
                dmPolicy: feishu?.dmPolicy ?? "pairing",
              });
            }

            // ── 切换公司 Agent ──
            case "switch_company": {
              const realId = resolveCompanyId(db, p.company_id);
              const company = manager.getCompany(realId);
              if (!company) return toolError(`公司 "${p.company_id}" 不存在`, "COMPANY_NOT_FOUND");

              const targetAgentId = `opc-${realId}`;
              const channel = (p as Record<string, unknown>)._channel as string | undefined;
              const peerId = (p as Record<string, unknown>)._peer_id as string | undefined;

              // 检查目标 agent 是否存在
              const switchCfg = api.runtime.config.loadConfig() as Record<string, unknown>;
              const agents = ((switchCfg.agents as Record<string, unknown>)?.list as Array<Record<string, unknown>>) ?? [];
              const agentExists = agents.some(a => a.id === targetAgentId);
              if (!agentExists) {
                return toolError(
                  `公司 "${company.name}" 的专属 Agent (${targetAgentId}) 尚未创建。请先注册并激活该公司。`,
                  "RECORD_NOT_FOUND",
                );
              }

              // 如果有 channel + peer 信息，更新 bindings
              if (channel && peerId) {
                const bindings = ((switchCfg.bindings ?? []) as Array<Record<string, unknown>>);

                // 移除该 peer 在该 channel 上的旧绑定
                const filtered = bindings.filter(b => {
                  const match = b.match as Record<string, unknown> | undefined;
                  const peer = match?.peer as Record<string, unknown> | undefined;
                  return !(match?.channel === channel && peer?.kind === "direct" && peer?.id === peerId);
                });

                // 添加新绑定
                filtered.push({
                  agentId: targetAgentId,
                  match: {
                    channel,
                    peer: { kind: "direct", id: peerId },
                  },
                });

                switchCfg.bindings = filtered;
                await api.runtime.config.writeConfigFile(switchCfg);

                return json({
                  ok: true,
                  message: `已切换到「${company.name}」。系统将自动重启，下一条消息将由公司专属 AI 员工接待。`,
                  company: { id: realId, name: company.name },
                  agent_id: targetAgentId,
                  restarting: true,
                });
              }

              // 没有 channel/peer 信息（webchat 等），返回提示
              return json({
                ok: true,
                message: `已找到公司「${company.name}」(Agent: ${targetAgentId})。当前频道不支持自动绑定，请在管理后台手动配置 bindings。`,
                company: { id: realId, name: company.name },
                agent_id: targetAgentId,
                restarting: false,
              });
            }

            default:
              return toolError(`未知操作: ${(p as { action: string }).action}`, "UNKNOWN_ACTION");
          }
        } catch (err) {
          return toolError(err instanceof Error ? err.message : String(err));
        }
      },
    },
    { name: "opc_manage" },
  );

  api.logger.info("opc: 已注册 opc_manage 工具");
}
