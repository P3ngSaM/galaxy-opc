/**
 * 星环OPC中心 — opc_legal 法务助手工具
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json } from "../utils/tool-helper.js";

const LegalSchema = Type.Union([
  Type.Object({
    action: Type.Literal("create_contract"),
    company_id: Type.String({ description: "公司 ID" }),
    title: Type.String({ description: "合同标题" }),
    counterparty: Type.String({ description: "签约对方" }),
    contract_type: Type.String({ description: "合同类型: 服务合同/采购合同/劳动合同/租赁合同/合作协议/NDA/其他" }),
    amount: Type.Optional(Type.Number({ description: "合同金额（元）" })),
    start_date: Type.Optional(Type.String({ description: "起始日期 (YYYY-MM-DD)" })),
    end_date: Type.Optional(Type.String({ description: "结束日期 (YYYY-MM-DD)" })),
    key_terms: Type.Optional(Type.String({ description: "核心条款摘要" })),
    risk_notes: Type.Optional(Type.String({ description: "风险提示" })),
    reminder_date: Type.Optional(Type.String({ description: "到期提醒日期" })),
  }),
  Type.Object({
    action: Type.Literal("list_contracts"),
    company_id: Type.String({ description: "公司 ID" }),
    status: Type.Optional(Type.String({ description: "按状态筛选: draft/active/expired/terminated/disputed" })),
  }),
  Type.Object({
    action: Type.Literal("get_contract"),
    contract_id: Type.String({ description: "合同 ID" }),
  }),
  Type.Object({
    action: Type.Literal("update_contract"),
    contract_id: Type.String({ description: "合同 ID" }),
    status: Type.Optional(Type.String({ description: "新状态" })),
    key_terms: Type.Optional(Type.String({ description: "更新核心条款" })),
    risk_notes: Type.Optional(Type.String({ description: "更新风险提示" })),
    reminder_date: Type.Optional(Type.String({ description: "更新提醒日期" })),
  }),
  Type.Object({
    action: Type.Literal("contract_risk_check"),
    contract_type: Type.String({ description: "合同类型" }),
    key_terms: Type.Optional(Type.String({ description: "条款内容（用于分析）" })),
  }),
  Type.Object({
    action: Type.Literal("compliance_checklist"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("contract_template"),
    contract_type: Type.String({ description: "合同类型: 服务合同/NDA/劳动合同/租赁合同" }),
  }),
  Type.Object({
    action: Type.Literal("delete_contract"),
    contract_id: Type.String({ description: "合同 ID" }),
  }),
]);

type LegalParams = Static<typeof LegalSchema>;

const CONTRACT_TEMPLATES: Record<string, { title: string; sections: string[] }> = {
  "服务合同": {
    title: "技术服务合同模板",
    sections: ["合同编号/日期", "甲乙双方信息", "服务内容与范围", "服务期限", "服务费用与支付方式", "验收标准", "保密条款", "知识产权归属", "违约责任", "争议解决", "附件"],
  },
  NDA: {
    title: "保密协议(NDA)模板",
    sections: ["定义与范围", "保密义务", "保密期限", "例外情形", "违约责任", "法律适用与争议解决"],
  },
  "劳动合同": {
    title: "劳动合同模板",
    sections: ["用人单位信息", "劳动者信息", "合同期限", "工作内容与地点", "工作时间与休假", "劳动报酬", "社会保险", "劳动保护", "合同解除/终止", "争议解决"],
  },
  "租赁合同": {
    title: "房屋租赁合同模板",
    sections: ["出租方/承租方信息", "房屋坐落与面积", "租赁用途", "租赁期限", "租金与支付", "押金", "维修责任", "转租限制", "合同解除", "争议解决"],
  },
};

const RISK_CHECKLIST: Record<string, string[]> = {
  "服务合同": ["是否明确验收标准", "付款节点是否合理", "知识产权归属是否清晰", "违约金是否过高或过低", "是否有保密条款", "争议解决方式是否约定"],
  "采购合同": ["质量标准是否明确", "交货时间是否合理", "退换货条款", "付款条件", "运输风险承担"],
  "劳动合同": ["试用期是否合规", "竞业限制是否有补偿", "加班约定是否合法", "社保公积金是否覆盖"],
  "租赁合同": ["租金递增条款", "提前退租条件", "装修归属", "押金退还条件"],
};

export function registerLegalTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerTool(
    {
      name: "opc_legal",
      label: "OPC 法务助手",
      description:
        "法务助手工具。操作: create_contract(创建合同), list_contracts(合同列表), " +
        "get_contract(合同详情), update_contract(更新合同), contract_risk_check(合同风险检查), " +
        "compliance_checklist(合规清单), contract_template(合同模板), delete_contract(删除合同)",
      parameters: LegalSchema,
      async execute(_toolCallId, params) {
        const p = params as LegalParams;
        try {
          switch (p.action) {
            case "create_contract": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_contracts (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
                id, p.company_id, p.title, p.counterparty, p.contract_type,
                p.amount ?? 0, p.start_date ?? "", p.end_date ?? "",
                p.key_terms ?? "", p.risk_notes ?? "", p.reminder_date ?? "", now, now,
              );
              return json(db.queryOne("SELECT * FROM opc_contracts WHERE id = ?", id));
            }

            case "list_contracts": {
              let sql = "SELECT * FROM opc_contracts WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.status) { sql += " AND status = ?"; params2.push(p.status); }
              sql += " ORDER BY created_at DESC";
              return json(db.query(sql, ...params2));
            }

            case "get_contract":
              return json(db.queryOne("SELECT * FROM opc_contracts WHERE id = ?", p.contract_id) ?? { error: "合同不存在" });

            case "update_contract": {
              const fields: string[] = [];
              const values: unknown[] = [];
              if (p.status) { fields.push("status = ?"); values.push(p.status); }
              if (p.key_terms) { fields.push("key_terms = ?"); values.push(p.key_terms); }
              if (p.risk_notes) { fields.push("risk_notes = ?"); values.push(p.risk_notes); }
              if (p.reminder_date) { fields.push("reminder_date = ?"); values.push(p.reminder_date); }
              fields.push("updated_at = ?"); values.push(new Date().toISOString());
              values.push(p.contract_id);
              db.execute(`UPDATE opc_contracts SET ${fields.join(", ")} WHERE id = ?`, ...values);
              return json(db.queryOne("SELECT * FROM opc_contracts WHERE id = ?", p.contract_id) ?? { error: "合同不存在" });
            }

            case "contract_risk_check": {
              const risks = RISK_CHECKLIST[p.contract_type] ?? RISK_CHECKLIST["服务合同"] ?? [];
              return json({
                contract_type: p.contract_type,
                risk_checklist: risks,
                general_risks: [
                  "确认对方主体资格（营业执照、法人身份）",
                  "确认签约代表人的授权",
                  "合同金额大写小写一致",
                  "约定管辖法院或仲裁机构",
                  "保留合同原件",
                ],
              });
            }

            case "compliance_checklist": {
              const contracts = db.query(
                "SELECT * FROM opc_contracts WHERE company_id = ? AND status = 'active' AND reminder_date != '' AND reminder_date <= date('now', '+30 days')",
                p.company_id,
              );
              return json({
                annual: ["工商年报（6月30日前）", "税务年报（5月31日前）", "社保年审", "劳动用工备案"],
                monthly: ["纳税申报", "社保公积金缴纳", "银行对账"],
                expiring_contracts: contracts,
              });
            }

            case "contract_template": {
              const tpl = CONTRACT_TEMPLATES[p.contract_type];
              if (!tpl) {
                return json({ error: `无此模板，可用: ${Object.keys(CONTRACT_TEMPLATES).join(", ")}` });
              }
              return json(tpl);
            }

            case "delete_contract": {
              db.execute("DELETE FROM opc_contracts WHERE id = ?", p.contract_id);
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
    { name: "opc_legal" },
  );

  api.logger.info("opc: 已注册 opc_legal 工具");
}
