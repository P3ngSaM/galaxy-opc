/**
 * 星环OPC中心 — TypeBox 工具参数 Schema
 *
 * 使用 Type.Union + action 字符串字段，兼容所有 LLM Provider。
 */

import { Type, type Static } from "@sinclair/typebox";

// ── 公司管理 Schema ──────────────────────────────────────────

const RegisterCompany = Type.Object({
  action: Type.Literal("register_company"),
  name: Type.String({ description: "公司名称" }),
  industry: Type.String({ description: "所属行业" }),
  owner_name: Type.String({ description: "创办人姓名" }),
  owner_contact: Type.Optional(Type.String({ description: "创办人联系方式（手机/邮箱）" })),
  registered_capital: Type.Optional(Type.Number({ description: "注册资本（元）" })),
  description: Type.Optional(Type.String({ description: "公司简介" })),
});

const GetCompany = Type.Object({
  action: Type.Literal("get_company"),
  company_id: Type.String({ description: "公司 ID" }),
});

const ListCompanies = Type.Object({
  action: Type.Literal("list_companies"),
  status: Type.Optional(
    Type.String({ description: "按状态筛选: pending/active/suspended/acquired/packaged/terminated" }),
  ),
});

const UpdateCompany = Type.Object({
  action: Type.Literal("update_company"),
  company_id: Type.String({ description: "公司 ID" }),
  name: Type.Optional(Type.String({ description: "新公司名称" })),
  industry: Type.Optional(Type.String({ description: "新行业" })),
  description: Type.Optional(Type.String({ description: "新简介" })),
  owner_contact: Type.Optional(Type.String({ description: "新联系方式" })),
});

const ActivateCompany = Type.Object({
  action: Type.Literal("activate_company"),
  company_id: Type.String({ description: "公司 ID" }),
});

const ChangeCompanyStatus = Type.Object({
  action: Type.Literal("change_company_status"),
  company_id: Type.String({ description: "公司 ID" }),
  new_status: Type.String({ description: "目标状态: active/suspended/acquired/packaged/terminated" }),
});

// ── 交易记录 Schema ──────────────────────────────────────────

const AddTransaction = Type.Object({
  action: Type.Literal("add_transaction"),
  company_id: Type.String({ description: "公司 ID" }),
  type: Type.String({ description: "交易类型: income(收入) 或 expense(支出)" }),
  category: Type.Optional(
    Type.String({
      description:
        "分类: service_income/product_income/investment_income/salary/rent/utilities/marketing/tax/supplies/other",
    }),
  ),
  amount: Type.Number({ description: "金额（元）" }),
  description: Type.Optional(Type.String({ description: "交易描述" })),
  counterparty: Type.Optional(Type.String({ description: "交易对方" })),
  transaction_date: Type.Optional(Type.String({ description: "交易日期 (YYYY-MM-DD)，默认今天" })),
});

const ListTransactions = Type.Object({
  action: Type.Literal("list_transactions"),
  company_id: Type.String({ description: "公司 ID" }),
  type: Type.Optional(Type.String({ description: "按类型筛选: income/expense" })),
  start_date: Type.Optional(Type.String({ description: "起始日期 (YYYY-MM-DD)" })),
  end_date: Type.Optional(Type.String({ description: "截止日期 (YYYY-MM-DD)" })),
  limit: Type.Optional(Type.Number({ description: "返回条数，默认 50" })),
});

const GetFinanceSummary = Type.Object({
  action: Type.Literal("finance_summary"),
  company_id: Type.String({ description: "公司 ID" }),
  start_date: Type.Optional(Type.String({ description: "起始日期 (YYYY-MM-DD)" })),
  end_date: Type.Optional(Type.String({ description: "截止日期 (YYYY-MM-DD)" })),
});

// ── 客户管理 Schema ──────────────────────────────────────────

const AddContact = Type.Object({
  action: Type.Literal("add_contact"),
  company_id: Type.String({ description: "公司 ID" }),
  name: Type.String({ description: "联系人姓名" }),
  phone: Type.Optional(Type.String({ description: "手机号" })),
  email: Type.Optional(Type.String({ description: "邮箱" })),
  company_name: Type.Optional(Type.String({ description: "联系人所在公司" })),
  tags: Type.Optional(Type.String({ description: "标签，JSON 数组格式，如 [\"VIP\",\"供应商\"]" })),
  notes: Type.Optional(Type.String({ description: "备注" })),
});

const ListContacts = Type.Object({
  action: Type.Literal("list_contacts"),
  company_id: Type.String({ description: "公司 ID" }),
  tag: Type.Optional(Type.String({ description: "按标签筛选" })),
});

const UpdateContact = Type.Object({
  action: Type.Literal("update_contact"),
  contact_id: Type.String({ description: "联系人 ID" }),
  name: Type.Optional(Type.String({ description: "新姓名" })),
  phone: Type.Optional(Type.String({ description: "新手机号" })),
  email: Type.Optional(Type.String({ description: "新邮箱" })),
  company_name: Type.Optional(Type.String({ description: "新公司名" })),
  tags: Type.Optional(Type.String({ description: "新标签" })),
  notes: Type.Optional(Type.String({ description: "新备注" })),
  last_contact_date: Type.Optional(Type.String({ description: "最近联系日期 (YYYY-MM-DD)" })),
});

const DeleteContact = Type.Object({
  action: Type.Literal("delete_contact"),
  contact_id: Type.String({ description: "联系人 ID" }),
});

// ── Dashboard ────────────────────────────────────────────────

const GetDashboard = Type.Object({
  action: Type.Literal("dashboard"),
});

// ── Company Skills (OpenClaw agent-level skills) ──────────────

const SetCompanySkills = Type.Object({
  action: Type.Literal("set_company_skills"),
  company_id: Type.String({ description: "公司 ID" }),
  skills: Type.Array(Type.String(), { description: "OpenClaw 内置 skill 列表，如 [\"company-registration\", \"basic-finance\"]" }),
});

const GetCompanySkills = Type.Object({
  action: Type.Literal("get_company_skills"),
  company_id: Type.String({ description: "公司 ID" }),
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
]);

export type OpcManageParams = Static<typeof OpcManageSchema>;
