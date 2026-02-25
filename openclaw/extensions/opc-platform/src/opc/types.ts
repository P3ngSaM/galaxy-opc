/**
 * 星环OPC中心 — 核心业务类型定义
 */

/** 公司状态流转: pending → active → suspended → acquired → packaged → terminated */
export type OpcCompanyStatus =
  | "pending"
  | "active"
  | "suspended"
  | "acquired"
  | "packaged"
  | "terminated";

/** 一人公司 */
export type OpcCompany = {
  id: string;
  name: string;
  industry: string;
  owner_name: string;
  owner_contact: string;
  status: OpcCompanyStatus;
  registered_capital: number;
  description: string;
  created_at: string;
  updated_at: string;
};

/** AI 员工角色 */
export type OpcEmployeeRole =
  | "finance"
  | "legal"
  | "hr"
  | "media"
  | "project"
  | "general";

/** AI 员工 */
export type OpcEmployee = {
  id: string;
  company_id: string;
  name: string;
  role: OpcEmployeeRole;
  skills: string;
  status: "active" | "inactive";
  created_at: string;
};

/** 交易类型 */
export type OpcTransactionType = "income" | "expense";

/** 交易分类 */
export type OpcTransactionCategory =
  | "service_income"
  | "product_income"
  | "investment_income"
  | "salary"
  | "rent"
  | "utilities"
  | "marketing"
  | "tax"
  | "supplies"
  | "other";

/** 交易记录 */
export type OpcTransaction = {
  id: string;
  company_id: string;
  type: OpcTransactionType;
  category: OpcTransactionCategory;
  amount: number;
  description: string;
  counterparty: string;
  transaction_date: string;
  created_at: string;
};

/** 客户/联系人 */
export type OpcContact = {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  email: string;
  company_name: string;
  tags: string;
  notes: string;
  last_contact_date: string;
  created_at: string;
  updated_at: string;
};

// ── Phase 2 类型 ─────────────────────────────────────────────

/** 发票状态 */
export type OpcInvoiceStatus = "draft" | "issued" | "paid" | "void";

/** 发票 */
export type OpcInvoice = {
  id: string;
  company_id: string;
  invoice_number: string;
  type: "sales" | "purchase";
  counterparty: string;
  amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  status: OpcInvoiceStatus;
  issue_date: string;
  notes: string;
  created_at: string;
};

/** 税务申报记录 */
export type OpcTaxFiling = {
  id: string;
  company_id: string;
  period: string;
  tax_type: "vat" | "income_tax" | "other";
  revenue: number;
  deductible: number;
  tax_amount: number;
  status: "pending" | "filed" | "paid";
  due_date: string;
  filed_date: string;
  notes: string;
  created_at: string;
};

/** 合同状态 */
export type OpcContractStatus = "draft" | "active" | "expired" | "terminated" | "disputed";

/** 合同 */
export type OpcContract = {
  id: string;
  company_id: string;
  title: string;
  counterparty: string;
  contract_type: string;
  amount: number;
  start_date: string;
  end_date: string;
  status: OpcContractStatus;
  key_terms: string;
  risk_notes: string;
  reminder_date: string;
  created_at: string;
  updated_at: string;
};

/** 人力资源记录 */
export type OpcHrRecord = {
  id: string;
  company_id: string;
  employee_name: string;
  position: string;
  salary: number;
  social_insurance: number;
  housing_fund: number;
  start_date: string;
  end_date: string;
  contract_type: "full_time" | "part_time" | "contractor" | "intern";
  status: "active" | "resigned" | "terminated";
  notes: string;
  created_at: string;
  updated_at: string;
};

/** 新媒体内容 */
export type OpcMediaContent = {
  id: string;
  company_id: string;
  title: string;
  platform: string;
  content_type: "article" | "short_video" | "image" | "live" | "other";
  content: string;
  status: "draft" | "scheduled" | "published" | "archived";
  scheduled_date: string;
  published_date: string;
  tags: string;
  metrics: string;
  created_at: string;
  updated_at: string;
};

/** 项目状态 */
export type OpcProjectStatus = "planning" | "active" | "paused" | "completed" | "cancelled";

/** 项目 */
export type OpcProject = {
  id: string;
  company_id: string;
  name: string;
  description: string;
  status: OpcProjectStatus;
  start_date: string;
  end_date: string;
  budget: number;
  spent: number;
  created_at: string;
  updated_at: string;
};

/** 项目任务 */
export type OpcTask = {
  id: string;
  project_id: string;
  company_id: string;
  title: string;
  description: string;
  assignee: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "todo" | "in_progress" | "review" | "done";
  due_date: string;
  hours_estimated: number;
  hours_actual: number;
  created_at: string;
  updated_at: string;
};

// ── Phase 3 类型 ─────────────────────────────────────────────

/** 融资轮次 */
export type OpcInvestmentRound = {
  id: string;
  company_id: string;
  round_name: string;
  amount: number;
  valuation_pre: number;
  valuation_post: number;
  status: "planning" | "fundraising" | "closed" | "cancelled";
  lead_investor: string;
  close_date: string;
  notes: string;
  created_at: string;
};

/** 投资人 */
export type OpcInvestor = {
  id: string;
  round_id: string;
  company_id: string;
  name: string;
  type: "individual" | "institutional" | "angel" | "vc" | "strategic";
  amount: number;
  equity_percent: number;
  contact: string;
  notes: string;
  created_at: string;
};

/** 服务项目 */
export type OpcService = {
  id: string;
  company_id: string;
  name: string;
  category: string;
  provider: string;
  unit_price: number;
  billing_cycle: "monthly" | "quarterly" | "yearly" | "one_time";
  status: "active" | "suspended" | "terminated";
  description: string;
  created_at: string;
  updated_at: string;
};

/** 采购订单 */
export type OpcProcurementOrder = {
  id: string;
  service_id: string;
  company_id: string;
  title: string;
  amount: number;
  status: "pending" | "approved" | "paid" | "cancelled";
  order_date: string;
  delivery_date: string;
  notes: string;
  created_at: string;
};

/** 里程碑 */
export type OpcMilestone = {
  id: string;
  company_id: string;
  title: string;
  category: "business" | "product" | "finance" | "legal" | "team" | "other";
  target_date: string;
  completed_date: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  description: string;
  created_at: string;
};

/** 生命周期事件 */
export type OpcLifecycleEvent = {
  id: string;
  company_id: string;
  event_type: string;
  title: string;
  event_date: string;
  impact: string;
  description: string;
  created_at: string;
};

/** 运营指标 */
export type OpcMetric = {
  id: string;
  company_id: string;
  name: string;
  value: number;
  unit: string;
  category: string;
  recorded_at: string;
  notes: string;
  created_at: string;
};

/** 告警 */
export type OpcAlert = {
  id: string;
  company_id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  category: string;
  status: "active" | "acknowledged" | "resolved";
  message: string;
  resolved_at: string;
  created_at: string;
};
