/**
 * 星环OPC中心 — TypeBox 工具参数 Schema
 *
 * 使用 Type.Union + action 字符串字段，兼容所有 LLM Provider。
 * 包含业务规则校验约束（字符串长度、金额范围、日期格式等）。
 */

import { Type, type Static } from "@sinclair/typebox";

/** 日期格式 pattern: YYYY-MM-DD */
const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

// ── 公司管理 Schema ──────────────────────────────────────────

const RegisterCompany = Type.Object({
  action: Type.Literal("register_company"),
  name: Type.String({ description: "公司名称", minLength: 2, maxLength: 100 }),
  industry: Type.String({ description: "所属行业", minLength: 1, maxLength: 50 }),
  owner_name: Type.String({ description: "创办人姓名", minLength: 1, maxLength: 50 }),
  owner_contact: Type.Optional(Type.String({ description: "创办人联系方式（手机/邮箱）", maxLength: 200 })),
  registered_capital: Type.Optional(Type.Number({ description: "注册资本（元）", minimum: 0 })),
  description: Type.Optional(Type.String({ description: "公司简介", maxLength: 2000 })),
});

const GetCompany = Type.Object({
  action: Type.Literal("get_company"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
});

const ListCompanies = Type.Object({
  action: Type.Literal("list_companies"),
  status: Type.Optional(
    Type.String({ description: "按状态筛选: pending/active/suspended/acquired/packaged/terminated" }),
  ),
});

const UpdateCompany = Type.Object({
  action: Type.Literal("update_company"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
  name: Type.Optional(Type.String({ description: "新公司名称", minLength: 2, maxLength: 100 })),
  industry: Type.Optional(Type.String({ description: "新行业", minLength: 1, maxLength: 50 })),
  description: Type.Optional(Type.String({ description: "新简介", maxLength: 2000 })),
  owner_contact: Type.Optional(Type.String({ description: "新联系方式", maxLength: 200 })),
});

const ActivateCompany = Type.Object({
  action: Type.Literal("activate_company"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
});

const ChangeCompanyStatus = Type.Object({
  action: Type.Literal("change_company_status"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
  new_status: Type.String({ description: "目标状态: active/suspended/acquired/packaged/terminated" }),
});

// ── 交易记录 Schema ──────────────────────────────────────────

const AddTransaction = Type.Object({
  action: Type.Literal("add_transaction"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
  type: Type.String({ description: "交易类型: income(收入) 或 expense(支出)" }),
  category: Type.Optional(
    Type.String({
      description:
        "分类: service_income/product_income/investment_income/salary/rent/utilities/marketing/tax/supplies/other",
    }),
  ),
  amount: Type.Number({ description: "金额（元）", minimum: 0 }),
  description: Type.Optional(Type.String({ description: "交易描述", maxLength: 500 })),
  counterparty: Type.Optional(Type.String({ description: "交易对方", maxLength: 200 })),
  transaction_date: Type.Optional(Type.String({ description: "交易日期 (YYYY-MM-DD)，默认今天", pattern: DATE_PATTERN })),
});

const ListTransactions = Type.Object({
  action: Type.Literal("list_transactions"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
  type: Type.Optional(Type.String({ description: "按类型筛选: income/expense" })),
  start_date: Type.Optional(Type.String({ description: "起始日期 (YYYY-MM-DD)", pattern: DATE_PATTERN })),
  end_date: Type.Optional(Type.String({ description: "截止日期 (YYYY-MM-DD)", pattern: DATE_PATTERN })),
  limit: Type.Optional(Type.Number({ description: "返回条数，默认 50", minimum: 1, maximum: 1000 })),
});

const GetFinanceSummary = Type.Object({
  action: Type.Literal("finance_summary"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
  start_date: Type.Optional(Type.String({ description: "起始日期 (YYYY-MM-DD)", pattern: DATE_PATTERN })),
  end_date: Type.Optional(Type.String({ description: "截止日期 (YYYY-MM-DD)", pattern: DATE_PATTERN })),
});

// ── 客户管理 Schema ──────────────────────────────────────────

const AddContact = Type.Object({
  action: Type.Literal("add_contact"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
  name: Type.String({ description: "联系人姓名", minLength: 1, maxLength: 100 }),
  phone: Type.Optional(Type.String({ description: "手机号", maxLength: 30 })),
  email: Type.Optional(Type.String({ description: "邮箱", maxLength: 200 })),
  company_name: Type.Optional(Type.String({ description: "联系人所在公司", maxLength: 200 })),
  tags: Type.Optional(Type.String({ description: "标签，JSON 数组格式，如 [\"VIP\",\"供应商\"]" })),
  notes: Type.Optional(Type.String({ description: "备注", maxLength: 2000 })),
  pipeline_stage: Type.Optional(Type.String({ description: "漏斗阶段: lead/qualified/proposal/negotiation/won/lost/churned" })),
  follow_up_date: Type.Optional(Type.String({ description: "下次跟进日期 (YYYY-MM-DD)", pattern: DATE_PATTERN })),
  deal_value: Type.Optional(Type.Number({ description: "潜在成交金额（元）", minimum: 0 })),
  source: Type.Optional(Type.String({ description: "来源: referral/website/cold_call/social_media/event/other" })),
});

const ListContacts = Type.Object({
  action: Type.Literal("list_contacts"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
  tag: Type.Optional(Type.String({ description: "按标签筛选" })),
});

const UpdateContact = Type.Object({
  action: Type.Literal("update_contact"),
  contact_id: Type.String({ description: "联系人 ID", minLength: 1 }),
  name: Type.Optional(Type.String({ description: "新姓名", minLength: 1, maxLength: 100 })),
  phone: Type.Optional(Type.String({ description: "新手机号", maxLength: 30 })),
  email: Type.Optional(Type.String({ description: "新邮箱", maxLength: 200 })),
  company_name: Type.Optional(Type.String({ description: "新公司名", maxLength: 200 })),
  tags: Type.Optional(Type.String({ description: "新标签" })),
  notes: Type.Optional(Type.String({ description: "新备注", maxLength: 2000 })),
  last_contact_date: Type.Optional(Type.String({ description: "最近联系日期 (YYYY-MM-DD)", pattern: DATE_PATTERN })),
  pipeline_stage: Type.Optional(Type.String({ description: "漏斗阶段: lead/qualified/proposal/negotiation/won/lost/churned" })),
  follow_up_date: Type.Optional(Type.String({ description: "下次跟进日期 (YYYY-MM-DD)", pattern: DATE_PATTERN })),
  deal_value: Type.Optional(Type.Number({ description: "潜在成交金额（元）", minimum: 0 })),
  source: Type.Optional(Type.String({ description: "来源: referral/website/cold_call/social_media/event/other" })),
});

const DeleteContact = Type.Object({
  action: Type.Literal("delete_contact"),
  contact_id: Type.String({ description: "联系人 ID", minLength: 1 }),
});

// ── Dashboard ────────────────────────────────────────────────

const GetDashboard = Type.Object({
  action: Type.Literal("dashboard"),
});

// ── Company Skills (OpenClaw agent-level skills) ──────────────

const SetCompanySkills = Type.Object({
  action: Type.Literal("set_company_skills"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
  skills: Type.Array(Type.String(), { description: "OpenClaw 内置 skill 列表，如 [\"company-registration\", \"basic-finance\"]" }),
});

const GetCompanySkills = Type.Object({
  action: Type.Literal("get_company_skills"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
});

// ── 批量导入 ────────────────────────────────────────────────

const BatchImportContacts = Type.Object({
  action: Type.Literal("batch_import_contacts"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
  contacts: Type.Array(Type.Object({
    name: Type.String({ description: "联系人姓名" }),
    phone: Type.Optional(Type.String({ description: "手机号" })),
    email: Type.Optional(Type.String({ description: "邮箱" })),
    company_name: Type.Optional(Type.String({ description: "联系人所在公司" })),
    tags: Type.Optional(Type.String({ description: "标签 JSON 数组" })),
  }), { description: "联系人数组", minItems: 1, maxItems: 500 }),
});

// ── CRM 客户跟进 ────────────────────────────────────────────

const CrmPipeline = Type.Object({
  action: Type.Literal("crm_pipeline"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
});

const AddInteraction = Type.Object({
  action: Type.Literal("add_interaction"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
  contact_id: Type.String({ description: "联系人 ID", minLength: 1 }),
  interaction_type: Type.String({ description: "交互类型: call/meeting/email/wechat/note/other" }),
  content: Type.String({ description: "交互内容", maxLength: 5000 }),
});

const ListInteractions = Type.Object({
  action: Type.Literal("list_interactions"),
  contact_id: Type.String({ description: "联系人 ID", minLength: 1 }),
  limit: Type.Optional(Type.Number({ description: "返回条数，默认 20", minimum: 1, maximum: 100 })),
});

const FollowUpReminders = Type.Object({
  action: Type.Literal("follow_up_reminders"),
  company_id: Type.String({ description: "公司 ID", minLength: 1 }),
  days: Type.Optional(Type.Number({ description: "未来 N 天内，默认 7", minimum: 1, maximum: 90 })),
});

// ── 切换公司 Agent Schema ────────────────────────────────────

const SwitchCompany = Type.Object({
  action: Type.Literal("switch_company"),
  company_id: Type.String({ description: "目标公司 ID 或公司名称", minLength: 1 }),
  // 以下字段由系统自动注入，AI 不需要填写
  _channel: Type.Optional(Type.String({ description: "（系统自动注入，勿填）当前频道" })),
  _peer_id: Type.Optional(Type.String({ description: "（系统自动注入，勿填）当前用户 ID" })),
});

// ── 飞书频道 Schema ──────────────────────────────────────────

const SetupFeishuChannel = Type.Object({
  action: Type.Literal("setup_feishu_channel"),
  app_id: Type.String({ description: "飞书应用 App ID" }),
  app_secret: Type.String({ description: "飞书应用 App Secret" }),
  bot_name: Type.Optional(Type.String({ description: "机器人名称，默认'星环OPC助手'" })),
});

const FeishuChannelStatus = Type.Object({
  action: Type.Literal("feishu_channel_status"),
});

// ── Union Schema ─────────────────────────────────────────────

export const OpcManageSchema = Type.Union([
  RegisterCompany,
  GetCompany,
  ListCompanies,
  UpdateCompany,
  ActivateCompany,
  ChangeCompanyStatus,
  AddTransaction,
  ListTransactions,
  GetFinanceSummary,
  AddContact,
  ListContacts,
  UpdateContact,
  DeleteContact,
  GetDashboard,
  SetCompanySkills,
  GetCompanySkills,
  BatchImportContacts,
  CrmPipeline,
  AddInteraction,
  ListInteractions,
  FollowUpReminders,
  SetupFeishuChannel,
  FeishuChannelStatus,
  SwitchCompany,
]);

export type OpcManageParams = Static<typeof OpcManageSchema>;
