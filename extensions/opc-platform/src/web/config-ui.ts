/**
 * 星环OPC中心 — 配置管理 Web UI (增强版)
 *
 * 路由: /opc/admin/*
 * 提供仪表盘、公司管理、公司详情、财务总览、监控中心、工具管理六个页面视图
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import https from "node:https";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";

const CUSTOM_SKILLS_DIR = path.join(os.homedir(), ".openclaw", "custom-skills");

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const TOOL_NAMES = [
  { key: "opc_core", label: "核心管理", desc: "公司注册、员工、客户、交易" },
  { key: "opc_finance", label: "财税管理", desc: "发票、增值税、所得税、纳税申报" },
  { key: "opc_legal", label: "法务合同", desc: "合同管理、风险评估、到期提醒" },
  { key: "opc_hr", label: "人力资源", desc: "员工档案、薪资、社保、公积金" },
  { key: "opc_media", label: "新媒体运营", desc: "内容创建、发布排期、数据分析" },
  { key: "opc_project", label: "项目管理", desc: "项目、任务、进度、预算跟踪" },
  { key: "opc_investment", label: "投融资", desc: "融资轮次、投资人、股权结构" },
  { key: "opc_procurement", label: "服务采购", desc: "服务项目、采购订单、费用统计" },
  { key: "opc_lifecycle", label: "生命周期", desc: "里程碑、大事记、时间线、报告" },
  { key: "opc_monitoring", label: "运营监控", desc: "指标记录、告警管理、KPI看板" },
];

/* ── Helper: month boundaries ─────────────────────────────── */
function monthBounds(offsetMonths: number): { start: string; end: string } {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  const start = d.toISOString().slice(0, 10);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  const end = d.toISOString().slice(0, 10);
  return { start, end };
}

function monthLabel(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return (d.getMonth() + 1) + "月";
}

/* ── API handlers ─────────────────────────────────────────── */

interface DashboardRow { total_income: number; total_expense: number }
interface CountRow { cnt: number }
interface AmountRow { total: number }
interface TxRow {
  id: string; company_id: string; type: string; category: string;
  amount: number; description: string; counterparty: string;
  transaction_date: string; created_at: string;
}
interface CompanyNameRow { name: string }
interface AlertRow {
  id: string; company_id: string; title: string; severity: string;
  category: string; status: string; message: string;
  resolved_at: string; created_at: string;
}
interface CompanyRow {
  id: string; name: string; industry: string; owner_name: string;
  owner_contact: string; status: string; registered_capital: number;
  description: string; created_at: string; updated_at: string;
}
interface InvoiceRow {
  id: string; company_id: string; invoice_number: string; type: string;
  counterparty: string; amount: number; tax_rate: number;
  tax_amount: number; total_amount: number; status: string;
  issue_date: string; notes: string; created_at: string;
}
interface TaxRow {
  id: string; company_id: string; period: string; tax_type: string;
  revenue: number; deductible: number; tax_amount: number;
  status: string; due_date: string; filed_date: string;
  notes: string; created_at: string;
}
interface HrRow {
  id: string; company_id: string; employee_name: string; position: string;
  salary: number; social_insurance: number; housing_fund: number;
  start_date: string; end_date: string; contract_type: string;
  status: string; notes: string; created_at: string; updated_at: string;
}
interface ProjectRow {
  id: string; company_id: string; name: string; description: string;
  status: string; start_date: string; end_date: string;
  budget: number; spent: number; created_at: string; updated_at: string;
}
interface TaskRow {
  id: string; project_id: string; company_id: string; title: string;
  description: string; assignee: string; priority: string; status: string;
  due_date: string; hours_estimated: number; hours_actual: number;
  created_at: string; updated_at: string;
}
interface ContractRow {
  id: string; company_id: string; title: string; counterparty: string;
  contract_type: string; amount: number; start_date: string;
  end_date: string; status: string; key_terms: string;
  risk_notes: string; reminder_date: string;
  created_at: string; updated_at: string;
}
interface RoundRow {
  id: string; company_id: string; round_name: string; amount: number;
  valuation_pre: number; valuation_post: number; status: string;
  lead_investor: string; close_date: string; notes: string; created_at: string;
}
interface InvestorRow {
  id: string; round_id: string; company_id: string; name: string;
  type: string; amount: number; equity_percent: number;
  contact: string; notes: string; created_at: string;
}
interface MilestoneRow {
  id: string; company_id: string; title: string; category: string;
  target_date: string; completed_date: string; status: string;
  description: string; created_at: string;
}
interface LifecycleRow {
  id: string; company_id: string; event_type: string; title: string;
  event_date: string; impact: string; description: string; created_at: string;
}
interface MetricRow {
  id: string; company_id: string; name: string; value: number;
  unit: string; category: string; recorded_at: string;
  notes: string; created_at: string;
}
interface CategorySum { category: string; total: number }

function handleDashboardEnhanced(db: OpcDatabase): unknown {
  const stats = db.getDashboardStats();

  // Monthly trends (last 6 months)
  const trends: { month: string; income: number; expense: number }[] = [];
  for (let i = -5; i <= 0; i++) {
    const b = monthBounds(i);
    const row = db.queryOne(
      "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as total_income, COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as total_expense FROM opc_transactions WHERE transaction_date >= ? AND transaction_date <= ?",
      b.start, b.end,
    ) as DashboardRow | null;
    trends.push({
      month: monthLabel(i),
      income: row ? row.total_income : 0,
      expense: row ? row.total_expense : 0,
    });
  }

  // Expense by category
  const expenseByCategory = db.query(
    "SELECT category, SUM(amount) as total FROM opc_transactions WHERE type='expense' GROUP BY category ORDER BY total DESC",
  ) as CategorySum[];

  // Active contracts value
  const contractVal = db.queryOne(
    "SELECT COALESCE(SUM(amount),0) as total FROM opc_contracts WHERE status='active'",
  ) as AmountRow;

  // Active projects count
  const projCount = db.queryOne(
    "SELECT COUNT(*) as cnt FROM opc_projects WHERE status='active'",
  ) as CountRow;

  // Recent transactions (last 10)
  const recentTx = db.query(
    "SELECT * FROM opc_transactions ORDER BY transaction_date DESC, created_at DESC LIMIT 10",
  ) as TxRow[];

  // Enrich with company names
  const txWithNames = recentTx.map((tx) => {
    const c = db.queryOne("SELECT name FROM opc_companies WHERE id = ?", tx.company_id) as CompanyNameRow | null;
    return { ...tx, company_name: c ? c.name : "" };
  });

  // Active alerts
  const alerts = db.query(
    "SELECT * FROM opc_alerts WHERE status='active' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC LIMIT 5",
  ) as AlertRow[];

  const alertsWithNames = alerts.map((a) => {
    const c = db.queryOne("SELECT name FROM opc_companies WHERE id = ?", a.company_id) as CompanyNameRow | null;
    return { ...a, company_name: c ? c.name : "" };
  });

  // Month-over-month for current vs last month
  const cur = monthBounds(0);
  const prev = monthBounds(-1);
  const curRow = db.queryOne(
    "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as total_income, COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as total_expense FROM opc_transactions WHERE transaction_date >= ? AND transaction_date <= ?",
    cur.start, cur.end,
  ) as DashboardRow;
  const prevRow = db.queryOne(
    "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as total_income, COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as total_expense FROM opc_transactions WHERE transaction_date >= ? AND transaction_date <= ?",
    prev.start, prev.end,
  ) as DashboardRow;

  // 孵化平台运营方统计（资金闭环视角）
  const incubatorStats = {
    total_companies: (db.queryOne("SELECT COUNT(*) as cnt FROM opc_companies") as { cnt: number }).cnt,
    active_companies: (db.queryOne("SELECT COUNT(*) as cnt FROM opc_companies WHERE status='active'") as { cnt: number }).cnt,
    acquired_companies: (db.queryOne("SELECT COUNT(*) as cnt FROM opc_companies WHERE status='acquired'") as { cnt: number }).cnt,
    total_employees: (db.queryOne("SELECT COUNT(*) as cnt FROM opc_employees") as { cnt: number }).cnt,
    total_revenue: ((db.queryOne("SELECT COALESCE(SUM(amount),0) as total FROM opc_transactions WHERE type='income'") as { total: number }).total),
    financing_fee_income: ((db.queryOne("SELECT COALESCE(SUM(fee_amount),0) as total FROM opc_financing_fees WHERE status='paid'") as { total: number }).total),
    asset_packages: (db.queryOne("SELECT COUNT(*) as cnt FROM opc_asset_packages") as { cnt: number }).cnt,
    sci_loan_facilitated: ((db.queryOne("SELECT COALESCE(SUM(sci_loan_actual),0) as total FROM opc_ct_transfers") as { total: number }).total),
  };

  return {
    stats,
    trends,
    expenseByCategory,
    activeContractValue: contractVal.total,
    activeProjects: projCount.cnt,
    recentTransactions: txWithNames,
    alerts: alertsWithNames,
    mom: {
      curIncome: curRow.total_income,
      prevIncome: prevRow.total_income,
      curExpense: curRow.total_expense,
      prevExpense: prevRow.total_expense,
    },
    incubator: incubatorStats,
  };
}

function handleCompaniesList(db: OpcDatabase, urlObj: URL): unknown {
  const search = (urlObj.searchParams.get("search") || "").trim();
  const status = urlObj.searchParams.get("status") || "";
  const page = Math.max(1, parseInt(urlObj.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(urlObj.searchParams.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  let countSql = "SELECT COUNT(*) as cnt FROM opc_companies WHERE 1=1";
  let dataSql = "SELECT * FROM opc_companies WHERE 1=1";
  const params: unknown[] = [];

  if (status) {
    countSql += " AND status = ?";
    dataSql += " AND status = ?";
    params.push(status);
  }
  if (search) {
    const like = "%" + search + "%";
    countSql += " AND (name LIKE ? OR industry LIKE ? OR owner_name LIKE ?)";
    dataSql += " AND (name LIKE ? OR industry LIKE ? OR owner_name LIKE ?)";
    params.push(like, like, like);
  }

  const countRow = db.queryOne(countSql, ...params) as CountRow;
  const total = countRow.cnt;

  dataSql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  const dataParams = [...params, limit, offset];
  const companies = db.query(dataSql, ...dataParams) as CompanyRow[];

  // Status counts
  const allCount = (db.queryOne("SELECT COUNT(*) as cnt FROM opc_companies") as CountRow).cnt;
  const activeCount = (db.queryOne("SELECT COUNT(*) as cnt FROM opc_companies WHERE status='active'") as CountRow).cnt;
  const pendingCount = (db.queryOne("SELECT COUNT(*) as cnt FROM opc_companies WHERE status='pending'") as CountRow).cnt;
  const otherCount = allCount - activeCount - pendingCount;

  return {
    companies,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    statusCounts: { all: allCount, active: activeCount, pending: pendingCount, other: otherCount },
  };
}

function handleCompanyDetail(db: OpcDatabase, companyId: string): unknown {
  const company = db.queryOne("SELECT * FROM opc_companies WHERE id = ?", companyId) as CompanyRow | null;
  if (!company) return null;

  const financeSummary = db.queryOne(
    "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as total_income, COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as total_expense FROM opc_transactions WHERE company_id = ?",
    companyId,
  ) as DashboardRow;

  const transactions = db.query(
    "SELECT * FROM opc_transactions WHERE company_id = ? ORDER BY transaction_date DESC LIMIT 50",
    companyId,
  ) as TxRow[];

  const invoices = db.query(
    "SELECT * FROM opc_invoices WHERE company_id = ? ORDER BY issue_date DESC",
    companyId,
  ) as InvoiceRow[];

  const taxFilings = db.query(
    "SELECT * FROM opc_tax_filings WHERE company_id = ? ORDER BY due_date DESC",
    companyId,
  ) as TaxRow[];

  const hrRecords = db.query(
    "SELECT * FROM opc_hr_records WHERE company_id = ? ORDER BY created_at DESC",
    companyId,
  ) as HrRow[];

  const projects = db.query(
    "SELECT * FROM opc_projects WHERE company_id = ? ORDER BY created_at DESC",
    companyId,
  ) as ProjectRow[];

  const tasks = db.query(
    "SELECT * FROM opc_tasks WHERE company_id = ? ORDER BY created_at DESC",
    companyId,
  ) as TaskRow[];

  const contracts = db.query(
    "SELECT * FROM opc_contracts WHERE company_id = ? ORDER BY created_at DESC",
    companyId,
  ) as ContractRow[];

  const rounds = db.query(
    "SELECT * FROM opc_investment_rounds WHERE company_id = ? ORDER BY created_at DESC",
    companyId,
  ) as RoundRow[];

  const investors = db.query(
    "SELECT * FROM opc_investors WHERE company_id = ? ORDER BY created_at DESC",
    companyId,
  ) as InvestorRow[];

  const milestones = db.query(
    "SELECT * FROM opc_milestones WHERE company_id = ? ORDER BY target_date DESC",
    companyId,
  ) as MilestoneRow[];

  const lifecycleEvents = db.query(
    "SELECT * FROM opc_lifecycle_events WHERE company_id = ? ORDER BY event_date DESC",
    companyId,
  ) as LifecycleRow[];

  const alerts = db.query(
    "SELECT * FROM opc_alerts WHERE company_id = ? AND status='active' ORDER BY created_at DESC",
    companyId,
  ) as AlertRow[];

  const contacts = db.query(
    "SELECT * FROM opc_contacts WHERE company_id = ? ORDER BY updated_at DESC",
    companyId,
  );

  const employees = db.query(
    "SELECT * FROM opc_employees WHERE company_id = ? ORDER BY created_at DESC",
    companyId,
  );

  // Salary summary
  const salarySum = db.queryOne(
    "SELECT COALESCE(SUM(salary),0) as total_salary, COALESCE(SUM(social_insurance),0) as total_si, COALESCE(SUM(housing_fund),0) as total_hf, COUNT(*) as cnt FROM opc_hr_records WHERE company_id = ? AND status='active'",
    companyId,
  ) as { total_salary: number; total_si: number; total_hf: number; cnt: number };

  const staffConfig = db.query(
    "SELECT * FROM opc_staff_config WHERE company_id = ? ORDER BY role",
    companyId,
  ) as { id: string; role: string; role_name: string; enabled: number; system_prompt: string; notes: string; created_at: string; updated_at: string }[];

  const mediaContent = db.query(
    "SELECT id, title, platform, content_type, status, scheduled_date, published_date, metrics, created_at FROM opc_media_content WHERE company_id = ? ORDER BY created_at DESC LIMIT 50",
    companyId,
  ) as { id: string; title: string; platform: string; content_type: string; status: string; scheduled_date: string; published_date: string; metrics: string; created_at: string }[];

  const procurementOrders = db.query(
    "SELECT o.id, o.title, o.amount, o.status, o.order_date, o.notes, o.created_at, s.name as service_name FROM opc_procurement_orders o LEFT JOIN opc_services s ON o.service_id = s.id WHERE o.company_id = ? ORDER BY o.created_at DESC LIMIT 50",
    companyId,
  ) as { id: string; title: string; service_name: string; amount: number; status: string; order_date: string; notes: string; created_at: string }[];

  const services = db.query(
    "SELECT * FROM opc_services WHERE company_id = ? ORDER BY status, created_at DESC",
    companyId,
  ) as { id: string; name: string; category: string; provider: string; unit_price: number; billing_cycle: string; status: string; description: string; created_at: string }[];

  return {
    company,
    finance: {
      income: financeSummary.total_income,
      expense: financeSummary.total_expense,
      net: financeSummary.total_income - financeSummary.total_expense,
      transactions,
      invoices,
      taxFilings,
    },
    hr: { records: hrRecords, salarySummary: salarySum },
    projects: { list: projects, tasks },
    contracts,
    investment: { rounds, investors },
    timeline: { milestones, events: lifecycleEvents },
    alerts,
    contacts,
    employees,
    staffConfig,
    mediaContent,
    procurementOrders,
    services,
  };
}

function handleFinanceOverview(db: OpcDatabase): unknown {
  // 12-month trend
  const trends: { month: string; income: number; expense: number }[] = [];
  for (let i = -11; i <= 0; i++) {
    const b = monthBounds(i);
    const row = db.queryOne(
      "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as total_income, COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as total_expense FROM opc_transactions WHERE transaction_date >= ? AND transaction_date <= ?",
      b.start, b.end,
    ) as DashboardRow;
    trends.push({ month: monthLabel(i), income: row.total_income, expense: row.total_expense });
  }

  // Invoice summary
  const invoiceSummary = {
    sales: {
      draft: (db.queryOne("SELECT COUNT(*) as cnt FROM opc_invoices WHERE type='sales' AND status='draft'") as CountRow).cnt,
      issued: (db.queryOne("SELECT COUNT(*) as cnt FROM opc_invoices WHERE type='sales' AND status='issued'") as CountRow).cnt,
      paid: (db.queryOne("SELECT COUNT(*) as cnt FROM opc_invoices WHERE type='sales' AND status='paid'") as CountRow).cnt,
      void: (db.queryOne("SELECT COUNT(*) as cnt FROM opc_invoices WHERE type='sales' AND status='void'") as CountRow).cnt,
    },
    purchase: {
      draft: (db.queryOne("SELECT COUNT(*) as cnt FROM opc_invoices WHERE type='purchase' AND status='draft'") as CountRow).cnt,
      issued: (db.queryOne("SELECT COUNT(*) as cnt FROM opc_invoices WHERE type='purchase' AND status='issued'") as CountRow).cnt,
      paid: (db.queryOne("SELECT COUNT(*) as cnt FROM opc_invoices WHERE type='purchase' AND status='paid'") as CountRow).cnt,
      void: (db.queryOne("SELECT COUNT(*) as cnt FROM opc_invoices WHERE type='purchase' AND status='void'") as CountRow).cnt,
    },
  };

  // Tax calendar
  const taxFilings = db.query(
    "SELECT t.*, c.name as company_name FROM opc_tax_filings t LEFT JOIN opc_companies c ON t.company_id = c.id ORDER BY CASE t.status WHEN 'pending' THEN 0 WHEN 'filed' THEN 1 ELSE 2 END, t.due_date ASC",
  ) as (TaxRow & { company_name: string })[];

  return { trends, invoiceSummary, taxFilings };
}

function handleMonitoring(db: OpcDatabase): unknown {
  // Alert counts by severity
  const criticalCount = (db.queryOne("SELECT COUNT(*) as cnt FROM opc_alerts WHERE status='active' AND severity='critical'") as CountRow).cnt;
  const warningCount = (db.queryOne("SELECT COUNT(*) as cnt FROM opc_alerts WHERE status='active' AND severity='warning'") as CountRow).cnt;
  const infoCount = (db.queryOne("SELECT COUNT(*) as cnt FROM opc_alerts WHERE status='active' AND severity='info'") as CountRow).cnt;

  // All active alerts
  const alerts = db.query(
    "SELECT a.*, c.name as company_name FROM opc_alerts a LEFT JOIN opc_companies c ON a.company_id = c.id WHERE a.status='active' ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, a.created_at DESC",
  ) as (AlertRow & { company_name: string })[];

  // Metrics grouped by category
  const latestMetrics = db.query(
    "SELECT m1.* FROM opc_metrics m1 INNER JOIN (SELECT company_id, name, MAX(recorded_at) as max_at FROM opc_metrics GROUP BY company_id, name) m2 ON m1.company_id = m2.company_id AND m1.name = m2.name AND m1.recorded_at = m2.max_at ORDER BY m1.category, m1.name",
  ) as MetricRow[];

  // Recent 50 metric records
  const recentMetrics = db.query(
    "SELECT m.*, c.name as company_name FROM opc_metrics m LEFT JOIN opc_companies c ON m.company_id = c.id ORDER BY m.recorded_at DESC LIMIT 50",
  ) as (MetricRow & { company_name: string })[];

  // Metric trend: last 30 days, group by metric name + day
  const metricTrends = db.query(
    `SELECT name, category, unit,
      DATE(recorded_at) as day,
      AVG(value) as avg_value,
      MAX(value) as max_value
     FROM opc_metrics
     WHERE recorded_at >= DATE('now', '-30 days')
     GROUP BY name, DATE(recorded_at)
     ORDER BY name, day`
  ) as { name: string; category: string; unit: string; day: string; avg_value: number; max_value: number }[];

  return {
    alertCounts: { critical: criticalCount, warning: warningCount, info: infoCount },
    alerts,
    latestMetrics,
    recentMetrics,
    metricTrends,
  };
}

function handleAlertDismiss(db: OpcDatabase, alertId: string): unknown {
  const now = new Date().toISOString();
  const result = db.execute(
    "UPDATE opc_alerts SET status = 'resolved', resolved_at = ? WHERE id = ? AND status = 'active'",
    now, alertId,
  );
  return { ok: result.changes > 0 };
}

/* ── HTML builder ─────────────────────────────────────────── */

function buildPageHtml(authRequired = false): string {
  const toolsJson = JSON.stringify(TOOL_NAMES);
  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' + "\u661F\u73AFOPC\u4E2D\u5FC3 - \u7BA1\u7406\u540E\u53F0" + '</title>\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet">\n<style>\n' + getCss() + '\n</style>\n</head>\n<body>\n' + getBodyHtml() + '\n<div class="toast" id="toast"></div>\n<script>\nvar TOOLS = ' + toolsJson + ';\nvar _authRequired = ' + (authRequired ? 'true' : 'false') + ';\n' + getJs() + '\n</script>\n</body>\n</html>';
}

function getCss(): string {
  return ":root{--font:'Instrument Sans','Noto Sans SC',-apple-system,BlinkMacSystemFont,sans-serif;--pri:#0f172a;--pri-l:#334155;--pri-d:#020617;--bg:#fafafa;--card:#ffffff;--tx:#0f172a;--tx2:#6b7280;--tx3:#9ca3af;--bd:#e5e7eb;--ok:#059669;--warn:#d97706;--err:#dc2626;--r:8px;--sh:none;--sh-lg:0 4px 6px -1px rgba(0,0,0,.05)}"
  + "\n*{margin:0;padding:0;box-sizing:border-box}"
  + "\nbody{font-family:var(--font);background:var(--bg);color:var(--tx);min-height:100vh;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}"
  + "\n@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}"
  // Layout
  + "\n.layout{display:flex;min-height:100vh}"
  // Sidebar — white + right border
  + "\n.sidebar{width:220px;background:var(--card);border-right:1px solid var(--bd);padding:32px 0 24px;flex-shrink:0;position:sticky;top:0;height:100vh;overflow-y:auto}"
  + "\n.sidebar-brand{padding:0 24px 28px;border-bottom:1px solid var(--bd);font-size:16px;font-weight:700;color:var(--tx);letter-spacing:-0.02em;display:flex;align-items:center;gap:10px}"
  + "\n.sidebar-brand svg{flex-shrink:0}"
  + "\n.sidebar-brand small{display:block;font-size:11px;color:var(--tx3);font-weight:400;margin-top:3px;letter-spacing:0.02em;text-transform:uppercase}"
  + "\n.sidebar-nav{padding:20px 12px}"
  + "\n.sidebar-nav a{display:flex;align-items:center;gap:10px;padding:9px 12px;color:var(--tx2);text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;transition:all .15s;margin-bottom:2px;cursor:pointer;border-left:2px solid transparent;position:relative}"
  + "\n.sidebar-nav a:hover{background:#f3f4f6;color:var(--tx)}"
  + "\n.sidebar-nav a.active{background:#f3f4f6;color:var(--tx);font-weight:600;border-left-color:var(--tx)}"
  + "\n.sidebar-nav a .icon{font-size:15px;width:20px;text-align:center;opacity:.6}"
  + "\n.sidebar-nav a.active .icon{opacity:1}"
  // Main
  + "\n.main{flex:1;padding:40px 48px;overflow-y:auto;min-width:0}"
  + "\n.page-header{margin-bottom:32px}"
  + "\n.page-header h1{font-size:22px;font-weight:700;letter-spacing:-0.02em;color:var(--tx)}"
  + "\n.page-header p{color:var(--tx3);font-size:13px;margin-top:6px;font-weight:400}"
  // Stats grid
  + "\n.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:28px}"
  + "\n.stat-card{background:var(--card);border-radius:var(--r);padding:24px;border:1px solid var(--bd);transition:box-shadow .2s ease}"
  + "\n.stat-card:hover{box-shadow:var(--sh-lg)}"
  + "\n.stat-card .label{font-size:12px;color:var(--tx3);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;text-transform:uppercase;letter-spacing:0.04em;font-weight:500}"
  + "\n.stat-card .value{font-size:28px;font-weight:700;color:var(--tx);letter-spacing:-0.02em}"
  + "\n.stat-card .unit{font-size:13px;color:var(--tx3);font-weight:400;letter-spacing:0}"
  + "\n.trend-up{color:var(--ok);font-size:11px;font-weight:600}"
  + "\n.trend-down{color:var(--err);font-size:11px;font-weight:600}"
  // Card
  + "\n.card{background:var(--card);border-radius:var(--r);padding:28px;border:1px solid var(--bd);margin-bottom:20px;transition:box-shadow .2s ease}"
  + "\n.card:hover{box-shadow:var(--sh-lg)}"
  + "\n.card h2{font-size:15px;font-weight:600;margin-bottom:20px;letter-spacing:-0.01em;color:var(--tx)}"
  + "\n.card h3{font-size:13px;font-weight:600;margin-bottom:12px;color:var(--tx2);text-transform:uppercase;letter-spacing:0.03em}"
  + "\n.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px}"
  // Alert banners
  + "\n.alert-banner{padding:12px 16px;border-radius:var(--r);margin-bottom:8px;font-size:13px;display:flex;align-items:center;gap:8px;border:1px solid}"
  + "\n.alert-critical{background:#fef2f2;border-color:#fecaca;color:#991b1b}"
  + "\n.alert-warning{background:#fffbeb;border-color:#fde68a;color:#92400e}"
  + "\n.alert-info{background:#f0f9ff;border-color:#bae6fd;color:#0c4a6e}"
  // Table
  + "\ntable{width:100%;border-collapse:collapse;font-size:13px}"
  + "\nth{text-align:left;padding:12px 16px;color:var(--tx3);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid var(--bd);white-space:nowrap}"
  + "\ntd{padding:14px 16px;border-bottom:none}"
  + "\ntr:nth-child(even) td{background:#f9fafb}"
  + "\ntr:hover td{background:#f3f4f6}"
  + "\ntr.clickable{cursor:pointer}"
  // Badges — line-frame style
  + "\n.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;white-space:nowrap;border:1px solid}"
  + "\n.badge-active,.badge-ok,.badge-paid{background:#f0fdf4;border-color:#86efac;color:#166534}"
  + "\n.badge-pending,.badge-draft{background:#fffbeb;border-color:#fcd34d;color:#92400e}"
  + "\n.badge-suspended,.badge-err,.badge-void,.badge-critical{background:#fef2f2;border-color:#fca5a5;color:#991b1b}"
  + "\n.badge-warning{background:#fff7ed;border-color:#fdba74;color:#9a3412}"
  + "\n.badge-info{background:#f0f9ff;border-color:#7dd3fc;color:#0c4a6e}"
  + "\n.badge-other,.badge-default{background:#f3f4f6;border-color:#d1d5db;color:#4b5563}"
  + "\n.badge-income{background:#f0fdf4;border-color:#86efac;color:#166534}"
  + "\n.badge-expense{background:#fef2f2;border-color:#fca5a5;color:#991b1b}"
  // Search
  + "\n.search-bar{display:flex;gap:8px;margin-bottom:20px}"
  + "\n.search-bar input{flex:1;padding:9px 14px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none;transition:border-color .15s;font-family:var(--font);background:var(--card)}"
  + "\n.search-bar input:focus{border-color:var(--tx3)}"
  // Status tabs
  + "\n.status-tabs{display:flex;gap:0;margin-bottom:20px;border-bottom:1px solid var(--bd);padding-bottom:0}"
  + "\n.status-tabs button{padding:10px 18px;border:none;background:transparent;font-size:13px;cursor:pointer;color:var(--tx3);border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s;font-family:var(--font);font-weight:500}"
  + "\n.status-tabs button.active{color:var(--tx);border-bottom-color:var(--tx);font-weight:600}"
  + "\n.status-tabs button:hover{color:var(--tx2)}"
  // Pagination
  + "\n.pagination{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:20px;font-size:13px;color:var(--tx2)}"
  + "\n.pagination button{padding:7px 14px;border:1px solid var(--bd);background:var(--card);border-radius:var(--r);cursor:pointer;font-size:13px;font-family:var(--font);transition:all .15s}"
  + "\n.pagination button:disabled{opacity:.35;cursor:not-allowed}"
  + "\n.pagination button:hover:not(:disabled){background:#f3f4f6}"
  // Detail header
  + "\n.detail-header{display:flex;align-items:flex-start;gap:24px;margin-bottom:32px}"
  + "\n.detail-header .info{flex:1}"
  + "\n.detail-header .info h1{font-size:22px;font-weight:700;margin-bottom:6px;letter-spacing:-0.02em}"
  + "\n.detail-header .info p{color:var(--tx2);font-size:13px;margin-top:4px;line-height:1.5}"
  + "\n.detail-header .meta{display:flex;gap:20px;margin-top:10px;flex-wrap:wrap}"
  + "\n.detail-header .meta span{font-size:13px;color:var(--tx2)}"
  // Detail tabs
  + "\n.detail-tabs{display:flex;gap:0;margin-bottom:24px;border-bottom:1px solid var(--bd);overflow-x:auto}"
  + "\n.detail-tabs button{padding:10px 16px;border:none;background:transparent;font-size:13px;cursor:pointer;color:var(--tx3);border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;transition:all .15s;font-family:var(--font);font-weight:500}"
  + "\n.detail-tabs button.active{color:var(--tx);border-bottom-color:var(--tx);font-weight:600}"
  + "\n.detail-tabs button:hover{color:var(--tx2)}"
  // Tab panels
  + "\n.tab-panel{display:none}"
  + "\n.tab-panel.active{display:block;animation:fadeIn .25s ease}"
  // Progress
  + "\n.progress-bar{height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;flex:1}"
  + "\n.progress-fill{height:100%;border-radius:3px;transition:width .3s}"
  + "\n.progress-green{background:var(--ok)}"
  + "\n.progress-yellow{background:var(--warn)}"
  + "\n.progress-red{background:var(--err)}"
  // Timeline
  + "\n.timeline{position:relative;padding-left:24px}"
  + "\n.timeline::before{content:'';position:absolute;left:8px;top:0;bottom:0;width:1px;background:var(--bd)}"
  + "\n.timeline-item{position:relative;margin-bottom:24px;padding-left:16px}"
  + "\n.timeline-item::before{content:'';position:absolute;left:-20px;top:5px;width:10px;height:10px;border-radius:50%;background:var(--tx3);border:2px solid var(--card)}"
  + "\n.timeline-item .tl-date{font-size:11px;color:var(--tx3);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.03em}"
  + "\n.timeline-item .tl-title{font-weight:600;font-size:14px;color:var(--tx)}"
  + "\n.timeline-item .tl-desc{font-size:13px;color:var(--tx2);margin-top:3px;line-height:1.5}"
  + "\n.timeline-item.milestone::before{background:var(--warn)}"
  // Tool grid
  + "\n.tool-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}"
  + "\n.tool-card{background:var(--card);border-radius:var(--r);border:1px solid var(--bd);overflow:hidden;transition:box-shadow .2s}"
  + "\n.tool-card:hover{box-shadow:var(--sh-lg)}"
  + "\n.tool-card.disabled{opacity:.55}"
  + "\n.tool-card-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--bd);background:#f9fafb}"
  + "\n.tool-card-header .name{font-weight:600;font-size:14px;color:var(--tx)}"
  + "\n.tool-card-header .key{font-size:11px;color:var(--tx3);font-family:'SF Mono',Consolas,monospace;letter-spacing:0.02em}"
  + "\n.tool-card-body{padding:16px 20px}"
  + "\n.tool-card-body .desc{font-size:13px;color:var(--tx2);margin-bottom:14px;line-height:1.5}"
  + "\n.tool-card-body .field{margin-bottom:14px}"
  + "\n.tool-card-body .field label{display:block;font-size:11px;font-weight:600;color:var(--tx3);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em}"
  + "\n.tool-card-body .field select,.tool-card-body .field textarea,.tool-card-body .field input[type=text]{width:100%;padding:8px 12px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);outline:none;transition:border-color .15s;background:var(--card)}"
  + "\n.tool-card-body .field select:focus,.tool-card-body .field textarea:focus,.tool-card-body .field input[type=text]:focus{border-color:var(--tx3)}"
  + "\n.tool-card-body .field textarea{min-height:64px;resize:vertical;line-height:1.5}"
  + "\n.tool-card-footer{padding:12px 20px;border-top:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;background:#f9fafb}"
  + "\n.tool-expand-btn{background:none;border:none;color:var(--tx2);font-size:12px;cursor:pointer;padding:4px 0;font-family:var(--font);transition:color .15s}"
  + "\n.tool-expand-btn:hover{color:var(--tx)}"
  + "\n.tool-settings{display:none;border-top:1px solid var(--bd);padding:16px 20px;background:#f9fafb}"
  + "\n.tool-settings.open{display:block}"
  // Toggle
  + "\n.toggle{position:relative;width:40px;height:22px;flex-shrink:0}"
  + "\n.toggle input{opacity:0;width:0;height:0}"
  + "\n.toggle .slider{position:absolute;cursor:pointer;inset:0;background:#d1d5db;border-radius:22px;transition:.2s}"
  + "\n.toggle .slider:before{content:'';position:absolute;height:16px;width:16px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s}"
  + "\n.toggle input:checked+.slider{background:var(--ok)}"
  + "\n.toggle input:checked+.slider:before{transform:translateX(18px)}"
  // Buttons
  + "\n.btn{padding:7px 16px;border:1px solid var(--bd);background:var(--card);border-radius:var(--r);cursor:pointer;font-size:13px;font-family:var(--font);font-weight:500;transition:all .15s;color:var(--tx)}"
  + "\n.btn:hover{background:#f3f4f6;border-color:#d1d5db}"
  + "\n.btn-sm{padding:5px 12px;font-size:12px}"
  + "\n.btn-pri{background:var(--pri);color:#fff;border-color:var(--pri)}"
  + "\n.btn-pri:hover{background:var(--pri-l);border-color:var(--pri-l)}"
  + "\n.btn-err{background:var(--err);color:#fff;border-color:var(--err)}"
  + "\n.btn-agent{background:#0e7490;color:#fff;border-color:#0e7490;text-decoration:none;display:inline-flex;align-items:center;gap:4px}"
  + "\n.btn-agent:hover{background:#0891b2;border-color:#0891b2;color:#fff}"
  + "\n.btn-agent-lg{padding:8px 18px;font-size:14px;border-radius:8px}"
  + "\n.detail-header-actions{display:flex;align-items:flex-start;padding-top:4px}"
  // SOP guide styles
  + "\n.sop-banner{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;border-radius:12px;padding:28px 32px;margin-bottom:28px;text-align:center}"
  + "\n.sop-tagline{font-size:28px;font-weight:800;letter-spacing:-0.03em;margin-bottom:8px}"
  + "\n.sop-sub{font-size:14px;opacity:0.75;letter-spacing:0.02em}"
  + "\n.sop-flow{display:flex;flex-direction:column;gap:0}"
  + "\n.sop-step{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:20px 24px;display:flex;gap:20px;align-items:flex-start}"
  + "\n.sop-step-wide{background:var(--card)}"
  + "\n.sop-step-highlight{background:linear-gradient(135deg,#0c4a6e11,#0e749011);border-color:#0e7490}"
  + "\n.sop-step-num{font-size:32px;font-weight:900;color:#0e7490;opacity:0.4;line-height:1;min-width:48px}"
  + "\n.sop-step-body{flex:1;min-width:0}"
  + "\n.sop-step-title{font-size:18px;font-weight:700;margin-bottom:4px}"
  + "\n.sop-step-desc{font-size:13px;color:var(--tx2);margin-bottom:10px}"
  + "\n.sop-step-actions{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}"
  + "\n.sop-tag{background:#0e749018;color:#0e7490;border:1px solid #0e749033;border-radius:4px;padding:2px 8px;font-size:11px;font-family:monospace}"
  + "\n.sop-step-detail{font-size:13px;color:var(--tx2);background:var(--bg);border-radius:8px;padding:12px 16px}"
  + "\n.sop-step-detail ol{margin:6px 0 0 16px;padding:0}"
  + "\n.sop-step-detail li{margin-bottom:4px}"
  + "\n.sop-roles{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}"
  + "\n.sop-roles span{background:var(--card);border:1px solid var(--bd);border-radius:6px;padding:4px 10px;font-size:12px}"
  + "\n.sop-arrow{text-align:center;font-size:20px;color:var(--tx3);padding:4px 0;line-height:1}"
  + "\n.sop-modules{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}"
  + "\n.sop-module{background:var(--bg);border:1px solid var(--bd);border-radius:8px;padding:12px;text-align:center}"
  + "\n.sop-module-icon{font-size:22px;margin-bottom:4px}"
  + "\n.sop-module-name{font-size:13px;font-weight:600;margin-bottom:2px}"
  + "\n.sop-module-tool{font-size:10px;font-family:monospace;color:#0e7490;margin-bottom:2px}"
  + "\n.sop-module-acts{font-size:10px;color:var(--tx3)}"
  + "\n.sop-reminder-tip{margin-top:14px;background:#78350f15;border:1px solid #78350f33;border-radius:8px;padding:10px 14px;font-size:13px;color:#78350f}"
  + "\n.sop-capital-loop{margin-top:16px}"
  + "\n.sop-capital-row{display:grid;align-items:center;gap:0}"
  + "\n.sop-capital-step{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:18px 16px;height:148px;box-sizing:border-box;display:flex;flex-direction:column;gap:4px;transition:box-shadow .2s,border-color .2s}"
  + "\n.sop-capital-step:hover{box-shadow:0 4px 16px rgba(0,0,0,.08);border-color:#93c5fd}"
  + "\n.sop-cap-num{font-size:20px;font-weight:900;color:#2563eb;opacity:0.3;line-height:1}"
  + "\n.sop-cap-title{font-size:14px;font-weight:700;color:var(--tx);margin:4px 0 2px}"
  + "\n.sop-cap-desc{font-size:12px;color:var(--tx2);line-height:1.5;flex:1}"
  + "\n.sop-cap-arrow{display:flex;align-items:center;justify-content:center;padding:0 6px;color:var(--tx3)}"
  + "\n.sop-cap-tag{display:inline-block;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;padding:2px 7px;font-size:10px;font-family:monospace;font-weight:600;margin-top:2px;width:fit-content}"
  + "\n.sop-quickstart{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:24px;margin-top:24px}"
  + "\n.sop-quickstart h3{font-size:16px;font-weight:700;margin-bottom:16px}"
  + "\n.sop-cmd-list{display:flex;flex-direction:column;gap:10px}"
  + "\n.sop-cmd{display:flex;gap:14px;align-items:flex-start;background:var(--bg);border-radius:8px;padding:12px 14px}"
  + "\n.sop-cmd-num{width:24px;height:24px;background:#0e7490;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}"
  + "\n.sop-cmd-title{font-size:13px;font-weight:600;margin-bottom:2px}"
  + "\n.sop-cmd-text{font-size:12px;color:var(--tx2);font-family:monospace}"
  // View transitions
  + "\n.view{display:none}"
  + "\n.view.active{display:block;animation:fadeIn .3s ease}"
  // Toast
  + "\n.toast{position:fixed;bottom:24px;right:24px;background:var(--tx);color:#fff;padding:12px 20px;border-radius:var(--r);font-size:13px;font-family:var(--font);opacity:0;transition:opacity .2s;pointer-events:none;z-index:100}"
  + "\n.toast.show{opacity:1}"
  // Skeleton
  + "\n.skeleton{background:linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:var(--r);min-height:20px}"
  + "\n@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}"
  // Empty state
  + "\n.empty-state{text-align:center;padding:48px 24px;color:var(--tx3)}"
  + "\n.empty-state .icon{font-size:40px;margin-bottom:12px;opacity:.25}"
  + "\n.empty-state p{font-size:13px}"
  // SVG text
  + "\nsvg text{font-family:var(--font)}"
  + "\n.card svg{max-width:100%}"
  // Back link
  + "\n.back-link{display:inline-flex;align-items:center;gap:6px;color:var(--tx2);text-decoration:none;font-size:13px;margin-bottom:20px;cursor:pointer;font-weight:500;transition:color .15s}"
  + "\n.back-link:hover{color:var(--tx)}"
  // Table overflow
  + "\n.card{overflow-x:auto}"
  // Responsive
  + "\n@media(max-width:1024px){.main{padding:28px 24px}.stats-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}.tool-grid{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}}"
  + "\n@media(max-width:768px){.layout{flex-direction:column}.sidebar{width:100%;padding:12px 0;height:auto;position:relative;border-right:none;border-bottom:1px solid var(--bd)}.sidebar-brand{padding:0 16px 12px;font-size:15px}.sidebar-nav{display:flex;padding:4px 8px;gap:2px;overflow-x:auto;flex-wrap:nowrap}.sidebar-nav a{white-space:nowrap;font-size:12px;padding:6px 10px;gap:6px;border-left:none;border-bottom:2px solid transparent}.sidebar-nav a.active{border-left-color:transparent;border-bottom-color:var(--tx)}.sidebar-nav a .icon{font-size:13px;width:16px}.main{padding:16px}.stats-grid{grid-template-columns:repeat(2,1fr);gap:8px}.stat-card{padding:16px}.stat-card .value{font-size:22px}.grid-2{grid-template-columns:1fr}.detail-header{flex-direction:column}.tool-grid{grid-template-columns:1fr}.page-header h1{font-size:18px}}"
  + "\n.skill-list{display:flex;flex-direction:column;gap:6px}"
  + "\n.skill-item{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--bd);border-radius:6px;font-size:13px;background:var(--card)}"
  + "\n.skill-badge{font-size:11px;padding:2px 8px;border-radius:20px;font-weight:600}"
  + "\n.badge-builtin{background:#f0fdf4;color:#166534}"
  + "\n.badge-custom{background:#eff6ff;color:#1d4ed8}"
  + "\n.skill-card{background:var(--card);border:1px solid var(--bd);border-radius:var(--r);padding:14px 16px;display:flex;align-items:center;gap:12px}"
  + "\n.skill-card-emoji{font-size:20px;width:32px;text-align:center;flex-shrink:0}"
  + "\n.skill-card-info{flex:1;min-width:0}"
  + "\n.skill-card-name{font-size:13px;font-weight:600;color:var(--tx)}"
  + "\n.skill-card-desc{font-size:12px;color:var(--tx2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}"
  + "\n.tab-bar{display:flex;gap:2px;background:var(--bg);border-radius:6px;padding:3px;border:1px solid var(--bd);width:fit-content;margin-bottom:16px}"
  + "\n.tab-bar button{padding:6px 14px;border:none;background:none;border-radius:4px;font-size:13px;cursor:pointer;color:var(--tx2)}"
  + "\n.tab-bar button.active{background:var(--card);color:var(--tx);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.06)}"
  + "\n.btn-pdf{background:#1e293b;color:#fff;border:none;padding:6px 14px;border-radius:var(--r);font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px}"
  + "\n.btn-pdf:hover{background:#334155}"
  + "\n@media print{"
  + "\n.sidebar,.btn,.btn-pri,.btn-sm,.btn-pdf,button,a.btn{display:none!important}"
  + "\n.layout{display:block}"
  + "\n.main{padding:16px}"
  + "\n.view{display:block!important}"
  + "\n.view:not(.print-target){display:none!important}"
  + "\n.card{break-inside:avoid;box-shadow:none;border:1px solid #e5e7eb}"
  + "\n.stat-card{break-inside:avoid}"
  + "\n}"
  // Feishu / Channel form styles
  + "\n.ch-form{display:grid;gap:20px;max-width:520px}"
  + "\n.ch-field{display:flex;flex-direction:column;gap:5px}"
  + "\n.ch-field label{font-size:13px;font-weight:600;color:var(--tx);display:flex;align-items:baseline;gap:6px}"
  + "\n.ch-field label .hint{font-weight:400;color:var(--tx3);font-size:12px}"
  + "\n.ch-field input,.ch-field select{padding:10px 14px;border:1.5px solid var(--bd);border-radius:8px;font-size:14px;font-family:var(--font);outline:none;transition:border-color .2s,box-shadow .2s;background:var(--card);color:var(--tx);width:100%}"
  + "\n.ch-field input:focus,.ch-field select:focus{border-color:var(--pri);box-shadow:0 0 0 3px rgba(15,23,42,.08)}"
  + "\n.ch-field input::placeholder{color:var(--tx3);font-size:13px}"
  + "\n.ch-field select{appearance:none;-webkit-appearance:none;background-image:url(\"data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 6l4 4 4-4' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 12px center;padding-right:36px;cursor:pointer}"
  + "\n.ch-status-dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex-shrink:0}"
  + "\n.ch-status-row{display:flex;align-items:center;gap:10px;margin-bottom:16px}"
  + "\n.ch-status-row strong{font-size:15px}"
  + "\n.ch-info-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}"
  + "\n.ch-info-item{background:var(--bg);border-radius:8px;padding:12px 14px}"
  + "\n.ch-info-item .ch-info-label{font-size:11px;color:var(--tx3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px}"
  + "\n.ch-info-item .ch-info-value{font-size:14px;font-weight:500;color:var(--tx)}"
  + "\n.ch-guide-box{background:var(--bg);border-radius:10px;padding:24px;font-size:13px;line-height:2}"
  + "\n.ch-guide-box ol{padding-left:20px;margin:0}"
  + "\n.ch-guide-box li{margin-bottom:14px;padding-left:4px}"
  + "\n.ch-guide-box li strong{color:var(--tx)}"
  + "\n.ch-guide-box .step-hint{display:block;color:var(--tx3);font-size:12px;margin-top:2px}"
  + "\n.ch-guide-box code{background:#e8ecf1;padding:2px 8px;border-radius:5px;font-size:12px;font-family:'SF Mono',Consolas,monospace;color:var(--pri-l)}"
  + "\n.ch-section-title{font-size:17px;font-weight:600;display:flex;align-items:center;gap:8px;margin-bottom:16px}"
  + "\n.ch-future{margin-top:32px;padding-top:24px;border-top:1px solid var(--bd)}"
  + "\n.ch-future h2{font-size:15px;font-weight:600;color:var(--tx3);margin-bottom:6px}"
  + "\n.ch-future p{color:var(--tx3);font-size:13px}";
}

function getBodyHtml(): string {
  return '<div class="layout">'
  + '<nav class="sidebar">'
  + '<div class="sidebar-brand">'
  + '<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="12" stroke="#0f172a" stroke-width="2"/><path d="M9 14h10M14 9v10" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/><circle cx="14" cy="14" r="4" stroke="#0f172a" stroke-width="1.5"/></svg>'
  + '<div>' + "\u661F\u73AFOPC\u4E2D\u5FC3"
  + '<small>' + "\u7BA1\u7406\u540E\u53F0" + '</small>'
  + '</div></div>'
  + '<div class="sidebar-nav">'
  + '<a data-view="dashboard" class="active"><span class="icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/></svg></span> ' + "\u4EEA\u8868\u76D8" + '</a>'
  + '<a data-view="companies"><span class="icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="12" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M5 3V1M11 3V1M2 7h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span> ' + "\u516C\u53F8\u7BA1\u7406" + '</a>'
  + '<a data-view="canvas"><span class="icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="11" r="1.5" fill="currentColor"/></svg></span> ' + "OPB \u753B\u5E03" + '</a>'
  + '<a data-view="finance"><span class="icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12l3-4 3 2 4-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 14h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span> ' + "\u8D22\u52A1\u603B\u89C8" + '</a>'
  + '<a data-view="monitoring"><span class="icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span> ' + "\u76D1\u63A7\u4E2D\u5FC3" + '</a>'
  + '<a data-view="feishu"><span class="icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 8.5C2.5 5 5 3 7.5 2.5c-1 2-1.2 4-.2 6.5L10.5 13l-3.5-1.5C4.5 12.5 2 11.5 1 8.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12.5" cy="5" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M12.5 4v2M11.5 5h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></span> ' + "\u9891\u9053" + '</a>'
  + '<a data-view="tools"><span class="icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span> ' + "\u5DE5\u5177\u7BA1\u7406" + '</a>'
  + '<a data-view="closure"><span class="icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1L14 4V8C14 11.3 11.3 14.3 8 15C4.7 14.3 2 11.3 2 8V4L8 1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M5.5 8l1.5 1.5L10.5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span> ' + "\u8D44\u91D1\u95ED\u73AF" + '</a>'
  + '<a data-view="guide"><span class="icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2h12v12H2z" stroke="currentColor" stroke-width="1.5" rx="1"/><path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span> ' + "\u4F7F\u7528\u6307\u5357" + '</a>'
  + '</div>'
  + '</nav>'
  + '<main class="main">'
  + '<div id="view-dashboard" class="view active"><div class="page-header"><h1>' + "\u4EEA\u8868\u76D8" + '</h1><p>' + "\u5E73\u53F0\u6574\u4F53\u8FD0\u8425\u6570\u636E\u6982\u89C8" + '</p></div><div id="dashboard-content"><div class="skeleton" style="height:200px"></div></div></div>'
  + '<div id="view-companies" class="view"><div class="page-header"><h1>' + "\u516C\u53F8\u7BA1\u7406" + '</h1><p>' + "\u641C\u7D22\u3001\u7B5B\u9009\u548C\u7BA1\u7406\u6240\u6709\u6CE8\u518C\u516C\u53F8" + '</p></div><div id="companies-content"><div class="skeleton" style="height:200px"></div></div></div>'
  + '<div id="view-company-detail" class="view"><div id="company-detail-content"><div class="skeleton" style="height:200px"></div></div></div>'
  + '<div id="view-finance" class="view"><div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1>' + "\u8D22\u52A1\u603B\u89C8" + '</h1><p>' + "\u5E73\u53F0\u6574\u4F53\u8D22\u52A1\u6570\u636E\u5206\u6790" + '</p></div><button class="btn-pdf" onclick="printView(\'finance\')">&#128438; \u5bfc\u51fa PDF</button></div><div id="finance-content"><div class="skeleton" style="height:200px"></div></div></div>'
  + '<div id="view-monitoring" class="view"><div class="page-header"><h1>' + "\u76D1\u63A7\u4E2D\u5FC3" + '</h1><p>' + "\u544A\u8B66\u7BA1\u7406\u4E0E\u8FD0\u8425\u6307\u6807\u76D1\u63A7" + '</p></div><div id="monitoring-content"><div class="skeleton" style="height:200px"></div></div></div>'
  + '<div id="view-feishu" class="view"><div class="page-header"><h1>' + "\u9891\u9053" + '</h1><p>' + "\u8FDE\u63A5\u98DE\u4E66\u3001\u5FAE\u4FE1\u7B49\u5E73\u53F0\uFF0C\u5728\u804A\u5929\u4E2D\u76F4\u63A5\u7BA1\u7406\u4F60\u7684\u516C\u53F8" + '</p></div><div id="feishu-content"><div class="skeleton" style="height:200px"></div></div></div>'
  + '<div id="view-tools" class="view"><div class="page-header"><h1>' + "\u5DE5\u5177\u7BA1\u7406" + '</h1><p>' + "\u542F\u7528\u3001\u914D\u7F6E\u5404\u529F\u80FD\u6A21\u5757\uFF0C\u81EA\u5B9A\u4E49\u63D0\u793A\u8BCD\u548C\u4F18\u5148\u7EA7" + '</p></div><div id="tool-list"></div>'
  + '</div>'
  + '<div id="view-guide" class="view"><div id="guide-content"></div></div>'
  + '<div id="view-canvas" class="view"><div class="page-header"><h1>' + "OPB \u4E00\u4EBA\u4F01\u4E1A\u753B\u5E03" + '</h1><p>' + "\u57FA\u4E8E\u300A\u4E00\u4EBA\u4F01\u4E1A\u65B9\u6CD5\u8BBA 2.0\u300B\u7684 16 \u6A21\u5757\u6218\u7565\u753B\u5E03" + '</p></div><div style="margin-bottom:20px"><div style="position:relative;display:inline-block;min-width:260px"><select id="canvas-company-select" onchange="loadCanvas()" style="appearance:none;-webkit-appearance:none;width:100%;padding:10px 40px 10px 16px;font-size:14px;font-weight:500;color:var(--tx);background:var(--card);border:1.5px solid var(--bd);border-radius:8px;cursor:pointer;outline:none;font-family:var(--font);box-shadow:0 1px 3px rgba(0,0,0,.06)"><option value="">' + "\u2014\u00A0\u00A0\u9009\u62E9\u516C\u53F8\u00A0\u00A0\u2014" + '</option></select><span style="pointer-events:none;position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--tx2)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div></div><div id="canvas-content"></div></div>'
  + '<div id="view-closure" class="view"><div class="page-header"><h1>' + "\u8D44\u91D1\u95ED\u73AF" + '</h1><p>' + "\u6536\u5E76\u8D2D\u7BA1\u7406\u3001\u8D44\u4EA7\u5305\u6253\u5305\u3001\u57CE\u6295\u8F6C\u8BA9\u4E0E\u878D\u8D44\u670D\u52A1\u8D39" + '</p></div><div id="closure-content"><div class="skeleton" style="height:200px"></div></div></div>'
  + '</main>'
  + '</div>';
}

function getJs(): string {
  return "/* Token management */"
  + "\n(function(){"
  + "var p=new URLSearchParams(window.location.search);"
  + "var t=p.get('token');"
  + "if(t){sessionStorage.setItem('opc_token',t);p.delete('token');"
  + "var newUrl=window.location.pathname;"
  + "var qs=p.toString();"
  + "if(qs)newUrl+='?'+qs;"
  + "window.history.replaceState({},'',newUrl);}"
  + "})();"
  + "\nvar _opcToken=sessionStorage.getItem('opc_token')||'';"
  + "\nvar _origFetch=window.fetch;"
  + "\nwindow.fetch=function(url,opts){"
  + "opts=opts||{};"
  + "if(_opcToken){"
  + "opts.headers=opts.headers||{};"
  + "if(typeof opts.headers==='object'&&!(opts.headers instanceof Headers)){"
  + "opts.headers['Authorization']='Bearer '+_opcToken;"
  + "}}"
  + "return _origFetch.call(window,url,opts).then(function(r){"
  + "if(r.status===401){sessionStorage.removeItem('opc_token');_opcToken='';showLoginPage();}return r;"
  + "});};"
  + "\nfunction showLoginPage(){"
  + "document.querySelector('.layout').innerHTML="
  + "'<div style=\"display:flex;align-items:center;justify-content:center;width:100%;min-height:100vh;background:var(--bg)\">"
  + "<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:48px;max-width:380px;width:100%;text-align:center\">"
  + "<h2 style=\"font-size:20px;font-weight:700;margin-bottom:8px\">\\u661F\\u73AFOPC\\u4E2D\\u5FC3</h2>"
  + "<p style=\"color:var(--tx3);font-size:13px;margin-bottom:24px\">\\u8BF7\\u8F93\\u5165\\u8BBF\\u95EE\\u4EE4\\u724C</p>"
  + "<input id=\"login-token\" type=\"password\" placeholder=\"Gateway Token\" style=\"width:100%;padding:10px 12px;border:1px solid var(--bd);border-radius:6px;font-size:14px;margin-bottom:16px;outline:none\"/>"
  + "<button onclick=\"doLogin()\" style=\"width:100%;padding:10px;background:var(--pri);color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer\">\\u767B\\u5F55</button>"
  + "</div></div>';}"
  + "\nfunction doLogin(){"
  + "var v=document.getElementById('login-token').value.trim();"
  + "if(!v)return;"
  + "sessionStorage.setItem('opc_token',v);_opcToken=v;"
  + "window.location.reload();}"
  + "\nif(_authRequired&&!_opcToken&&window.location.pathname.indexOf('/opc/admin')===0){"
  + "document.addEventListener('DOMContentLoaded',function(){showLoginPage();});}"
  + "\nif(!localStorage.getItem('openclaw.i18n.locale')){localStorage.setItem('openclaw.i18n.locale','zh-CN');}"
  + "\nvar toolConfig={};"
  + "var companiesState={search:'',status:'',page:1};"
  + "var currentView='dashboard';"
  + "\nfunction esc(s){if(s===null||s===undefined)return '';s=String(s);return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#x27;');}"
  + "\nfunction showView(name){currentView=name;document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active')});document.querySelectorAll('.sidebar-nav a').forEach(function(a){a.classList.remove('active')});var el=document.getElementById('view-'+name);if(el)el.classList.add('active');var nav=document.querySelector('.sidebar-nav a[data-view=\"'+name+'\"]');if(nav)nav.classList.add('active');if(name==='dashboard')loadDashboard();if(name==='companies')loadCompanies();if(name==='finance')loadFinance();if(name==='monitoring')loadMonitoring();if(name==='tools')loadConfig();if(name==='guide')loadGuide();if(name==='canvas')initCanvasView();if(name==='feishu')loadFeishu();}"
  + "\nfunction showToast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2000);}"
  + "\nfunction fmt(n){if(n>=100000000)return(n/100000000).toFixed(2)+' \\u4ebf';if(n>=10000)return(n/10000).toFixed(1)+' \\u4e07';return n.toLocaleString();}"
  + "\nfunction fmtDate(s){if(!s)return '--';return s.slice(0,10);}"
  + "\nfunction statusBadge(status){var m={'active':'\\u8fd0\\u8425\\u4e2d','pending':'\\u5f85\\u6ce8\\u518c','suspended':'\\u5df2\\u6682\\u505c','terminated':'\\u5df2\\u6ce8\\u9500','acquired':'\\u5df2\\u6536\\u8d2d','packaged':'\\u6253\\u5305\\u4e2d'};var cls=status==='active'?'badge-active':status==='pending'?'badge-pending':status==='suspended'?'badge-suspended':'badge-other';return '<span class=\"badge '+cls+'\">'+(m[status]||esc(status))+'</span>';}"
  + "\nfunction severityBadge(s){var m={'critical':'\\u4e25\\u91cd','warning':'\\u8b66\\u544a','info':'\\u63d0\\u793a'};var c=s==='critical'?'badge-critical':s==='warning'?'badge-warning':'badge-info';return '<span class=\"badge '+c+'\">'+(m[s]||esc(s))+'</span>';}"
  + "\nfunction invoiceStatusBadge(s){var m={'draft':'\\u8349\\u7a3f','issued':'\\u5df2\\u5f00','paid':'\\u5df2\\u4ed8','void':'\\u4f5c\\u5e9f'};var c=s==='paid'?'badge-paid':s==='void'?'badge-void':s==='issued'?'badge-ok':'badge-draft';return '<span class=\"badge '+c+'\">'+(m[s]||esc(s))+'</span>';}"
  + "\nfunction taxStatusBadge(s){var m={'pending':'\\u5f85\\u7533\\u62a5','filed':'\\u5df2\\u7533\\u62a5','paid':'\\u5df2\\u7f34\\u7eb3'};var c=s==='paid'?'badge-paid':s==='filed'?'badge-ok':'badge-draft';return '<span class=\"badge '+c+'\">'+(m[s]||esc(s))+'</span>';}"
  + "\nfunction contractStatusBadge(s){var m={'draft':'\\u8349\\u7a3f','active':'\\u751f\\u6548\\u4e2d','expired':'\\u5df2\\u8fc7\\u671f','terminated':'\\u5df2\\u7ec8\\u6b62','disputed':'\\u4e89\\u8bae\\u4e2d'};var c=s==='active'?'badge-active':s==='draft'?'badge-draft':s==='disputed'?'badge-err':'badge-other';return '<span class=\"badge '+c+'\">'+(m[s]||esc(s))+'</span>';}"
  + "\nfunction projectStatusBadge(s){var m={'planning':'\\u89c4\\u5212\\u4e2d','active':'\\u8fdb\\u884c\\u4e2d','paused':'\\u5df2\\u6682\\u505c','completed':'\\u5df2\\u5b8c\\u6210','cancelled':'\\u5df2\\u53d6\\u6d88'};var c=s==='active'?'badge-active':s==='completed'?'badge-ok':s==='cancelled'?'badge-err':'badge-other';return '<span class=\"badge '+c+'\">'+(m[s]||esc(s))+'</span>';}"
  + "\nfunction trendArrow(cur,prev){if(prev===0)return '';var pct=((cur-prev)/prev*100).toFixed(1);if(cur>prev)return '<span class=\"trend-up\">\\u2191'+pct+'%</span>';if(cur<prev)return '<span class=\"trend-down\">\\u2193'+Math.abs(parseFloat(pct)).toFixed(1)+'%</span>';return '';}"
  + "\nfunction buildSingleBarChart(data,ww,hh,keyX,keyVal,color,label){"
  + "if(!data||!data.length)return '<div class=\"empty-state\"><p>\\u6682\\u65e0\\u6570\\u636e</p></div>';"
  + "var maxV=0;data.forEach(function(d){var v=d[keyVal]||0;if(v>maxV)maxV=v;});"
  + "if(maxV===0)maxV=1;"
  + "var pad=60,bot=30,top_=16,chartW=ww-pad*2,chartH=hh-bot-top_;"
  + "var barW=Math.max(12,Math.floor(chartW/data.length*0.55));"
  + "var s='<svg viewBox=\"0 0 '+ww+' '+hh+'\" style=\"width:100%;max-height:'+hh+'px;display:block\">';"
  + "for(var g=0;g<=4;g++){var gy=top_+chartH-chartH*g/4;var gv=Math.round(maxV*g/4);s+='<line x1=\"'+pad+'\" y1=\"'+gy+'\" x2=\"'+(ww-pad/2)+'\" y2=\"'+gy+'\" stroke=\"#e2e8f0\" stroke-width=\"1\"/>';s+='<text x=\"'+(pad-6)+'\" y=\"'+(gy+4)+'\" text-anchor=\"end\" fill=\"#94a3b8\" font-size=\"10\">'+fmt(gv)+'</text>';}"
  + "data.forEach(function(d,i){var x=pad+i*(chartW/data.length)+(chartW/data.length-barW)/2;var hv=(d[keyVal]||0)/maxV*chartH;"
  + "var grad='grad'+i+keyVal;"
  + "s+='<rect x=\"'+x+'\" y=\"'+(top_+chartH-hv)+'\" width=\"'+barW+'\" height=\"'+hv+'\" fill=\"'+color+'\" rx=\"3\" opacity=\"0.85\"><title>'+esc(d[keyX])+' '+label+': '+fmt(d[keyVal])+'</title></rect>';"
  + "s+='<text x=\"'+(x+barW/2)+'\" y=\"'+(top_+chartH+16)+'\" text-anchor=\"middle\" fill=\"#94a3b8\" font-size=\"11\">'+esc(d[keyX])+'</text>';});"
  + "s+='</svg>';return s;}"
  + "\nfunction buildBarChart(data,ww,hh,keyX,keyA,keyB,colorA,colorB,labelA,labelB){"
  + "if(!data||!data.length)return '<div class=\"empty-state\"><p>\\u6682\\u65e0\\u6570\\u636e</p></div>';"
  + "var maxV=0;data.forEach(function(d){var v=Math.max(d[keyA]||0,d[keyB]||0);if(v>maxV)maxV=v;});"
  + "if(maxV===0)maxV=1;"
  + "var pad=50,bot=30,top_=20,chartW=ww-pad*2,chartH=hh-bot-top_;"
  + "var barW=Math.max(8,Math.floor(chartW/data.length/3));"
  + "var gap=Math.max(4,Math.floor(chartW/data.length)-barW*2);"
  + "var s='<svg viewBox=\"0 0 '+ww+' '+hh+'\" style=\"width:100%;max-height:'+hh+'px;display:block\">';"
  + "for(var g=0;g<=4;g++){var gy=top_+chartH-chartH*g/4;var gv=Math.round(maxV*g/4);s+='<line x1=\"'+pad+'\" y1=\"'+gy+'\" x2=\"'+(ww-pad)+'\" y2=\"'+gy+'\" stroke=\"#e2e8f0\" stroke-width=\"1\"/>';s+='<text x=\"'+(pad-4)+'\" y=\"'+(gy+4)+'\" text-anchor=\"end\" fill=\"#94a3b8\" font-size=\"10\">'+fmt(gv)+'</text>';}"
  + "data.forEach(function(d,i){var x=pad+i*(barW*2+gap)+gap/2;var hA=d[keyA]/maxV*chartH;var hB=d[keyB]/maxV*chartH;"
  + "s+='<rect x=\"'+x+'\" y=\"'+(top_+chartH-hA)+'\" width=\"'+barW+'\" height=\"'+hA+'\" fill=\"'+colorA+'\" rx=\"2\"><title>'+esc(d[keyX])+' '+labelA+': '+fmt(d[keyA])+'</title></rect>';"
  + "s+='<rect x=\"'+(x+barW)+'\" y=\"'+(top_+chartH-hB)+'\" width=\"'+barW+'\" height=\"'+hB+'\" fill=\"'+colorB+'\" rx=\"2\"><title>'+esc(d[keyX])+' '+labelB+': '+fmt(d[keyB])+'</title></rect>';"
  + "s+='<text x=\"'+(x+barW)+'\" y=\"'+(top_+chartH+16)+'\" text-anchor=\"middle\" fill=\"#94a3b8\" font-size=\"11\">'+esc(d[keyX])+'</text>';});"
  + "s+='<rect x=\"'+(ww-pad-140)+'\" y=\"4\" width=\"10\" height=\"10\" fill=\"'+colorA+'\" rx=\"2\"/><text x=\"'+(ww-pad-126)+'\" y=\"13\" fill=\"#64748b\" font-size=\"11\">'+labelA+'</text>';"
  + "s+='<rect x=\"'+(ww-pad-60)+'\" y=\"4\" width=\"10\" height=\"10\" fill=\"'+colorB+'\" rx=\"2\"/><text x=\"'+(ww-pad-46)+'\" y=\"13\" fill=\"#64748b\" font-size=\"11\">'+labelB+'</text>';"
  + "s+='</svg>';return s;}"
  + "\nfunction buildDonutChart(data,size,labelKey,valKey){"
  + "if(!data||!data.length)return '<div class=\"empty-state\"><p>\\u6682\\u65e0\\u6570\\u636e</p></div>';"
  + "var colors=['#0f172a','#64748b','#94a3b8','#cbd5e1','#334155','#475569','#9ca3af','#e2e8f0'];"
  + "var total=0;data.forEach(function(d){total+=d[valKey]||0;});"
  + "if(total===0)return '<div class=\"empty-state\"><p>\\u6682\\u65e0\\u6570\\u636e</p></div>';"
  + "var r=size/2-10,cx=size/2,cy=size/2,circumference=2*Math.PI*r;"
  + "var s='<div style=\"display:flex;align-items:center;gap:20px;flex-wrap:wrap\"><svg width=\"'+size+'\" height=\"'+size+'\" viewBox=\"0 0 '+size+' '+size+'\">';"
  + "var offset=0;"
  + "data.forEach(function(d,i){var pct=(d[valKey]||0)/total;var dash=pct*circumference;var col=colors[i%colors.length];"
  + "s+='<circle cx=\"'+cx+'\" cy=\"'+cy+'\" r=\"'+r+'\" fill=\"none\" stroke=\"'+col+'\" stroke-width=\"20\" stroke-dasharray=\"'+dash+' '+(circumference-dash)+'\" stroke-dashoffset=\"'+(-offset)+'\" transform=\"rotate(-90 '+cx+' '+cy+')\"><title>'+esc(d[labelKey])+': '+fmt(d[valKey])+'</title></circle>';"
  + "offset+=dash;});"
  + "s+='<text x=\"'+cx+'\" y=\"'+(cy-6)+'\" text-anchor=\"middle\" fill=\"#1e293b\" font-size=\"16\" font-weight=\"700\">'+fmt(total)+'</text>';"
  + "s+='<text x=\"'+cx+'\" y=\"'+(cy+12)+'\" text-anchor=\"middle\" fill=\"#94a3b8\" font-size=\"11\">\\u603b\\u989d(\\u5143)</text>';"
  + "s+='</svg><div style=\"display:flex;flex-direction:column;gap:4px\">';"
  + "data.forEach(function(d,i){var col=colors[i%colors.length];var pct=((d[valKey]||0)/total*100).toFixed(1);"
  + "s+='<div style=\"display:flex;align-items:center;gap:6px;font-size:12px\"><span style=\"display:inline-block;width:10px;height:10px;border-radius:2px;background:'+col+'\"></span><span style=\"color:#64748b\">'+esc(d[labelKey])+'</span><span style=\"font-weight:600\">'+fmt(d[valKey])+'</span><span style=\"color:#94a3b8\">('+pct+'%)</span></div>';});"
  + "s+='</div></div>';return s;}"
  + "\nfunction buildLineChart(data,ww,hh,keyX,keyY,color,label){"
  + "if(!data||!data.length)return '<div class=\"empty-state\"><p>\\u6682\\u65e0\\u6570\\u636e</p></div>';"
  + "var maxV=0,minV=Infinity;"
  + "data.forEach(function(d){var v=parseFloat(d[keyY])||0;if(v>maxV)maxV=v;if(v<minV)minV=v;});"
  + "if(maxV===minV){maxV=maxV+1;minV=Math.max(0,minV-1);}"
  + "var pad=50,bot=30,top_=20,chartW=ww-pad*2,chartH=hh-bot-top_;"
  + "var s='<svg viewBox=\"0 0 '+ww+' '+hh+'\" style=\"width:100%;max-height:'+hh+'px;display:block\">';"
  + "for(var g=0;g<=4;g++){var gy=top_+chartH-chartH*g/4;var gv=(minV+(maxV-minV)*g/4).toFixed(1);"
  + "s+='<line x1=\"'+pad+'\" y1=\"'+gy+'\" x2=\"'+(ww-pad)+'\" y2=\"'+gy+'\" stroke=\"#e2e8f0\" stroke-width=\"1\"/>';"
  + "s+='<text x=\"'+(pad-4)+'\" y=\"'+(gy+4)+'\" text-anchor=\"end\" fill=\"#94a3b8\" font-size=\"10\">'+gv+'</text>';}"
  + "var points=data.map(function(d,i){var x=pad+i*chartW/(data.length-1||1);var v=parseFloat(d[keyY])||0;var y=top_+chartH-(v-minV)/(maxV-minV)*chartH;return x+','+y;});"
  + "s+='<polyline points=\"'+points.join(' ')+'\" fill=\"none\" stroke=\"'+color+'\" stroke-width=\"2\" stroke-linejoin=\"round\"/>';"
  + "data.forEach(function(d,i){var x=pad+i*chartW/(data.length-1||1);var v=parseFloat(d[keyY])||0;var y=top_+chartH-(v-minV)/(maxV-minV)*chartH;"
  + "s+='<circle cx=\"'+x+'\" cy=\"'+y+'\" r=\"3\" fill=\"'+color+'\"><title>'+esc(d[keyX])+': '+v+'</title></circle>';});"
  + "var step=Math.ceil(data.length/8);"
  + "data.forEach(function(d,i){if(i%step===0||i===data.length-1){var x=pad+i*chartW/(data.length-1||1);var lbl=d[keyX];if(lbl&&lbl.length>5)lbl=lbl.slice(5);"
  + "s+='<text x=\"'+x+'\" y=\"'+(top_+chartH+16)+'\" text-anchor=\"middle\" fill=\"#94a3b8\" font-size=\"10\">'+esc(lbl)+'</text>';}});"
  + "s+='<rect x=\"'+(ww-pad-60)+'\" y=\"4\" width=\"10\" height=\"10\" fill=\"'+color+'\" rx=\"2\"/>';"
  + "s+='<text x=\"'+(ww-pad-46)+'\" y=\"13\" fill=\"#64748b\" font-size=\"11\">'+label+'</text>';"
  + "s+='</svg>';return s;}"
  + "\nfunction progressBar(spent,budget){"
  + "if(!budget||budget===0)return '<div class=\"progress-bar\"><div class=\"progress-fill progress-green\" style=\"width:0\"></div></div>';"
  + "var pct=Math.min(100,Math.round(spent/budget*100));"
  + "var cls=pct<60?'progress-green':pct<85?'progress-yellow':'progress-red';"
  + "return '<div style=\"display:flex;align-items:center;gap:8px\"><div class=\"progress-bar\"><div class=\"progress-fill '+cls+'\" style=\"width:'+pct+'%\"></div></div><span style=\"font-size:12px;color:#64748b;white-space:nowrap\">'+pct+'%</span></div>';}"
  // ── loadDashboard ──
  + "\nfunction loadDashboard(){"
  + "var el=document.getElementById('dashboard-content');"
  + "el.innerHTML='<div class=\"skeleton\" style=\"height:400px\"></div>';"
  + "fetch('/opc/admin/api/dashboard/enhanced').then(function(r){return r.json()}).then(function(d){"
  + "var h='';"
  // alerts banner
  + "if(d.alerts&&d.alerts.length){"
  + "d.alerts.slice(0,3).forEach(function(a){"
  + "h+='<div class=\"alert-banner alert-'+esc(a.severity)+'\">';"
  + "h+=severityBadge(a.severity)+' ';"
  + "h+='<strong>'+esc(a.company_name||'')+'</strong> '+esc(a.title)+': '+esc(a.message)+'</div>';});}"
  // stat cards
  + "h+='<div class=\"stats-grid\">';"
  + "var cards=["
  + "{l:'\\u516c\\u53f8\\u603b\\u6570',v:d.stats.total_companies,u:'\\u5bb6'},"
  + "{l:'\\u8fd0\\u8425\\u4e2d',v:d.stats.active_companies,u:'\\u5bb6'},"
  + "{l:'\\u603b\\u6536\\u5165',v:fmt(d.stats.total_revenue),u:'\\u5143',t:trendArrow(d.mom.curIncome,d.mom.prevIncome)},"
  + "{l:'\\u603b\\u652f\\u51fa',v:fmt(d.stats.total_expense),u:'\\u5143',t:trendArrow(d.mom.curExpense,d.mom.prevExpense)},"
  + "{l:'\\u4ea4\\u6613\\u7b14\\u6570',v:d.stats.total_transactions,u:'\\u7b14'},"
  + "{l:'\\u5ba2\\u6237\\u6570',v:d.stats.total_contacts,u:'\\u4eba'}"
  + "];"
  + "cards.forEach(function(c){h+='<div class=\"stat-card\"><div class=\"label\">'+c.l+(c.t?' '+c.t:'')+'</div><div class=\"value\">'+c.v+' <span class=\"unit\">'+c.u+'</span></div></div>';});"
  + "h+='</div>';"
  // 孵化平台视角统计
  + "if(d.incubator){"
  + "h+='<div class=\"card\" style=\"margin-bottom:20px\"><div class=\"card-header\"><h3 style=\"margin:0\">\u5b75\u5316\u5e73\u53f0\u8fd0\u8425\u6307\u6807</h3></div><div class=\"card-body\"><div class=\"stats-grid\" style=\"grid-template-columns:repeat(4,1fr)\">';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\u5df2\u5b75\u5316\u516c\u53f8</div><div class=\"value\">'+d.incubator.total_companies+' <span class=\"unit\">\u5bb6</span></div><div style=\"font-size:12px;color:var(--tx2);margin-top:4px\">\u8fd0\u8425\u4e2d '+d.incubator.active_companies+' | \u5df2\u6536\u8d2d '+d.incubator.acquired_companies+'</div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\u5c31\u4e1a\u5c97\u4f4d\u4f30\u7b97</div><div class=\"value\">'+d.incubator.total_employees+' <span class=\"unit\">\u4eba</span></div></div>';"
  + "h+='<div class=\"stat-card\" style=\"border-left:4px solid var(--accent,#0ea5e9)\"><div class=\"label\">\u878d\u8d44\u670d\u52a1\u8d39\u6536\u5165</div><div class=\"value\" style=\"color:var(--accent,#0ea5e9)\">\uFFE5'+fmt(d.incubator.financing_fee_income)+'</div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\u52a9\u529b\u57ce\u6295\u79d1\u521b\u8d37</div><div class=\"value\">\uFFE5'+fmt(d.incubator.sci_loan_facilitated)+'</div></div>';"
  + "h+='</div></div></div>';}"
  // charts
  + "h+='<div class=\"grid-2\">';"
  + "h+='<div class=\"card\"><h2>\\u6536\\u652f\\u8d8b\\u52bf (\\u8fd1 6 \\u4e2a\\u6708)</h2>'+buildBarChart(d.trends,500,240,'month','income','expense','#0f172a','#d1d5db','\\u6536\\u5165','\\u652f\\u51fa')+'</div>';"
  + "h+='<div class=\"card\"><h2>\\u652f\\u51fa\\u5206\\u7c7b</h2>'+buildDonutChart(d.expenseByCategory,180,'category','total')+'</div>';"
  + "h+='</div>';"
  // recent transactions
  + "h+='<div class=\"card\"><h2>\\u8fd1\\u671f\\u4ea4\\u6613</h2>';"
  + "if(d.recentTransactions&&d.recentTransactions.length){"
  + "h+='<table><thead><tr><th>\\u516c\\u53f8</th><th>\\u7c7b\\u578b</th><th>\\u5206\\u7c7b</th><th>\\u91d1\\u989d</th><th>\\u5bf9\\u65b9</th><th>\\u65e5\\u671f</th></tr></thead><tbody>';"
  + "d.recentTransactions.forEach(function(tx){"
  + "h+='<tr><td>'+esc(tx.company_name)+'</td><td><span class=\"badge badge-'+(tx.type==='income'?'income':'expense')+'\">'+(tx.type==='income'?'\\u6536\\u5165':'\\u652f\\u51fa')+'</span></td><td>'+esc(tx.category)+'</td><td style=\"font-weight:600\">'+(tx.type==='income'?'+':'-')+fmt(tx.amount)+' \\u5143</td><td>'+esc(tx.counterparty)+'</td><td>'+fmtDate(tx.transaction_date)+'</td></tr>';});"
  + "h+='</tbody></table>';}else{h+='<div class=\"empty-state\"><div class=\"icon\">\\ud83d\\udcb3</div><p>\\u6682\\u65e0\\u4ea4\\u6613\\u8bb0\\u5f55</p></div>';}"
  + "h+='</div>';"
  + "el.innerHTML=h;"
  + "}).catch(function(e){el.innerHTML='<div class=\"card\"><div class=\"empty-state\"><div class=\"icon\">\\u26a0\\ufe0f</div><p>\\u52a0\\u8f7d\\u5931\\u8d25: '+esc(String(e))+'</p></div></div>';});}"
  // ── loadCompanies ──
  + "\nfunction loadCompanies(){"
  + "var el=document.getElementById('companies-content');"
  + "el.innerHTML='<div class=\"skeleton\" style=\"height:400px\"></div>';"
  + "var q='?page='+companiesState.page+'&limit=20';"
  + "if(companiesState.status)q+='&status='+encodeURIComponent(companiesState.status);"
  + "if(companiesState.search)q+='&search='+encodeURIComponent(companiesState.search);"
  + "fetch('/opc/admin/api/companies/list'+q).then(function(r){return r.json()}).then(function(d){"
  + "var h='';"
  + "h+='<div class=\"search-bar\"><input type=\"text\" id=\"company-search\" placeholder=\"\\u641c\\u7d22\\u516c\\u53f8\\u540d\\u79f0/\\u884c\\u4e1a/\\u8d1f\\u8d23\\u4eba...\" value=\"'+esc(companiesState.search)+'\" onkeydown=\"if(event.key===\\'Enter\\')doCompanySearch()\"/><button class=\"btn btn-pri\" onclick=\"doCompanySearch()\">\\u641c\\u7d22</button><a class=\"btn\" href=\"/opc/admin/api/export/companies\" download>\\u5bfc\\u51fa CSV</a></div>';"
  + "h+='<div class=\"status-tabs\">';"
  + "var tabs=[{k:'',l:'\\u5168\\u90e8('+d.statusCounts.all+')'},{k:'active',l:'\\u8fd0\\u8425\\u4e2d('+d.statusCounts.active+')'},{k:'pending',l:'\\u5f85\\u6ce8\\u518c('+d.statusCounts.pending+')'},{k:'__other',l:'\\u5176\\u4ed6('+d.statusCounts.other+')'}];"
  + "tabs.forEach(function(t){h+='<button class=\"'+(companiesState.status===t.k?'active':'')+'\" onclick=\"filterByStatus(\\''+t.k+'\\')\">'+ t.l+'</button>';});"
  + "h+='</div>';"
  // table
  + "h+='<div class=\"card\">';"
  + "if(d.companies&&d.companies.length){"
  + "h+='<table><thead><tr><th>\\u540d\\u79f0</th><th>\\u884c\\u4e1a</th><th>\\u8d1f\\u8d23\\u4eba</th><th>\\u6ce8\\u518c\\u8d44\\u672c</th><th>\\u72b6\\u6001</th><th>\\u521b\\u5efa\\u65f6\\u95f4</th><th>\\u64cd\\u4f5c</th></tr></thead><tbody>';"
  + "d.companies.forEach(function(c){"
  + "var agentUrl=window.location.protocol+'//'+window.location.host+'/chat?session='+encodeURIComponent('agent:opc-'+c.id+':main');"
  + "h+='<tr class=\"clickable\" onclick=\"showCompany(\\''+esc(c.id)+'\\')\"><td><strong>'+esc(c.name)+'</strong></td><td>'+esc(c.industry)+'</td><td>'+esc(c.owner_name)+'</td><td>'+fmt(c.registered_capital)+' \\u5143</td><td>'+statusBadge(c.status)+'</td><td>'+fmtDate(c.created_at)+'</td><td style=\"white-space:nowrap\"><button class=\"btn btn-sm\" onclick=\"event.stopPropagation();showCompany(\\''+esc(c.id)+'\\')\">' + '\\u8be6\\u60c5' + '</button> <a class=\"btn btn-sm btn-agent\" href=\"'+agentUrl+'\" onclick=\"event.stopPropagation()\" title=\"\\u8fdb\\u5165\\u516c\\u53f8 AI \\u52a9\\u624b\">\\ud83e\\udd16 \\u5bf9\\u8bdd</a> <button class=\"btn btn-sm\" style=\"color:#dc2626;border-color:#fca5a5\" onclick=\"event.stopPropagation();deleteCompany(\\''+esc(c.id)+'\\',\\''+esc(c.name)+'\\')\">\\u5220\\u9664</button></td></tr>';});"
  + "h+='</tbody></table>';"
  + "if(d.totalPages>1){"
  + "h+='<div class=\"pagination\"><button '+(d.page<=1?'disabled':'')+' onclick=\"goPage('+(d.page-1)+')\">\\u4e0a\\u4e00\\u9875</button><span>\\u7b2c '+d.page+' / '+d.totalPages+' \\u9875 (\\u5171 '+d.total+' \\u6761)</span><button '+(d.page>=d.totalPages?'disabled':'')+' onclick=\"goPage('+(d.page+1)+')\">\\u4e0b\\u4e00\\u9875</button></div>';}"
  + "}else{h+='<div class=\"empty-state\"><div class=\"icon\">\\ud83c\\udfe2</div><p>\\u6682\\u65e0\\u516c\\u53f8\\u6570\\u636e</p></div>';}"
  + "h+='</div>';"
  + "el.innerHTML=h;"
  + "}).catch(function(e){el.innerHTML='<div class=\"card\"><div class=\"empty-state\"><p>\\u52a0\\u8f7d\\u5931\\u8d25</p></div></div>';});}"
  + "\nfunction doCompanySearch(){var inp=document.getElementById('company-search');companiesState.search=inp?inp.value:'';companiesState.page=1;loadCompanies();}"
  + "\nfunction deleteCompany(id,name){"
  + "var existing=document.getElementById('confirm-modal');if(existing)existing.remove();"
  + "var modal=document.createElement('div');"
  + "modal.id='confirm-modal';"
  + "modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)';"
  + "modal.innerHTML="
  + "'<div style=\"background:var(--card);border-radius:12px;padding:28px 32px;max-width:420px;width:calc(100% - 32px);box-shadow:0 20px 60px rgba(0,0,0,.18);border:1px solid var(--bd)\">'"
  + "+'<div style=\"display:flex;align-items:center;gap:12px;margin-bottom:16px\">'"
  + "+'<div style=\"width:40px;height:40px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;flex-shrink:0\">'"
  + "+'<svg width=\"18\" height=\"18\" viewBox=\"0 0 16 16\" fill=\"none\"><path d=\"M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zm0 3.5v3m0 2v.5\" stroke=\"#dc2626\" stroke-width=\"1.5\" stroke-linecap=\"round\"/></svg>'"
  + "+'</div>'"
  + "+'<h3 style=\"margin:0;font-size:16px;font-weight:600;color:var(--tx)\">\u5220\u9664\u516c\u53f8</h3>'"
  + "+'</div>'"
  + "+'<p style=\"margin:0 0 8px;font-size:14px;color:var(--tx);line-height:1.6\">\u786e\u5b9a\u8981\u5220\u9664\u516c\u53f8\u300c<strong>'+name+'</strong>\u300d\u5417\uff1f</p>'"
  + "+'<p style=\"margin:0 0 24px;font-size:13px;color:#dc2626;line-height:1.6\">\u8be5\u516c\u53f8\u7684\u6240\u6709\u76f8\u5173\u6570\u636e\uff08\u8d22\u52a1\u3001\u5408\u540c\u3001\u5458\u5de5\u3001\u9879\u76ee\u7b49\uff09\u5c06\u88ab\u6c38\u4e45\u5220\u9664\uff0c\u4e0d\u53ef\u6062\u590d\u3002</p>'"
  + "+'<div style=\"display:flex;gap:8px;justify-content:flex-end\">'"
  + "+'<button id=\"confirm-cancel\" class=\"btn\" style=\"min-width:72px\">\u53d6\u6d88</button>'"
  + "+'<button id=\"confirm-ok\" class=\"btn btn-pri\" style=\"min-width:72px;background:#dc2626;border-color:#dc2626\">\u786e\u5b9a\u5220\u9664</button>'"
  + "+'</div>'"
  + "+'</div>';"
  + "document.body.appendChild(modal);"
  + "modal.addEventListener('click',function(e){if(e.target===modal)modal.remove();});"
  + "document.getElementById('confirm-cancel').onclick=function(){modal.remove();};"
  + "document.getElementById('confirm-ok').onclick=function(){"
  + "modal.remove();"
  + "fetch('/opc/admin/api/companies/'+encodeURIComponent(id),{method:'DELETE'})"
  + ".then(function(r){return r.json()}).then(function(d){"
  + "if(d.ok){showToast('\u516c\u53f8\u300c'+name+'\u300d\u5df2\u5220\u9664');loadCompanies();}"
  + "else{showToast('\u5220\u9664\u5931\u8d25: '+(d.error||'\u672a\u77e5\u9519\u8bef'));}"
  + "}).catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});"
  + "};}"
  + "\nfunction filterByStatus(s){companiesState.status=s;companiesState.page=1;loadCompanies();}"
  + "\nfunction goPage(p){companiesState.page=p;loadCompanies();}"
  // ── showCompany ──
  + "\nfunction showCompany(id){"
  + "currentView='company-detail';"
  + "document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active')});"
  + "document.getElementById('view-company-detail').classList.add('active');"
  + "document.querySelectorAll('.sidebar-nav a').forEach(function(a){a.classList.remove('active')});"
  + "var nav=document.querySelector('.sidebar-nav a[data-view=\"companies\"]');if(nav)nav.classList.add('active');"
  + "window.location.hash='company/'+id;"
  + "window.currentCompanyId=id;"
  + "var el=document.getElementById('company-detail-content');"
  + "el.innerHTML='<div class=\"skeleton\" style=\"height:400px\"></div>';"
  + "fetch('/opc/admin/api/companies/'+encodeURIComponent(id)+'/detail').then(function(r){return r.json()}).then(function(d){"
  + "if(!d||!d.company){el.innerHTML='<div class=\"card\"><div class=\"empty-state\"><p>\\u516c\\u53f8\\u4e0d\\u5b58\\u5728</p></div></div>';return;}"
  + "var c=d.company;var h='';"
  + "var agentChatUrl=window.location.protocol+'//'+window.location.host+'/chat?session='+encodeURIComponent('agent:opc-'+c.id+':main');"
  + "h+='<a class=\"back-link\" onclick=\"showView(\\'companies\\')\">\\u2190 \\u8fd4\\u56de\\u516c\\u53f8\\u5217\\u8868</a>';"
  // header
  + "h+='<div class=\"detail-header\"><div class=\"info\"><h1>'+esc(c.name)+' '+statusBadge(c.status)+'</h1>';"
  + "h+='<div class=\"meta\"><span>\\u884c\\u4e1a: '+esc(c.industry)+'</span><span>\\u8d1f\\u8d23\\u4eba: '+esc(c.owner_name)+'</span><span>\\u6ce8\\u518c\\u8d44\\u672c: '+fmt(c.registered_capital)+' \\u5143</span></div>';"
  + "if(c.description)h+='<p style=\"margin-top:8px;color:#64748b;font-size:13px\">'+esc(c.description)+'</p>';"
  + "h+='</div><div class=\"detail-header-actions\" style=\"display:flex;gap:8px\"><button class=\"btn\" onclick=\"editCompany(\\''+c.id+'\\',\\''+esc(c.name)+'\\',\\''+esc(c.industry)+'\\',\\''+esc(c.owner_name)+'\\',\\''+esc(c.owner_contact)+'\\',\\''+esc(c.description||'')+'\\',\\''+esc(c.registered_capital)+'\\',\\''+esc(c.status)+'\\')\">\\u2712 \\u7f16\\u8f91</button><a class=\"btn btn-agent btn-agent-lg\" href=\"'+agentChatUrl+'\">\\ud83e\\udd16 \\u8fdb\\u5165 AI \\u52a9\\u624b</a></div></div>';"
  // tabs
  + "h+='<div class=\"detail-tabs\" id=\"detail-tabs\">';"
  + "var tabNames=[{k:'overview',l:'\\u6982\\u89c8'},{k:'finance',l:'\\u8d22\\u52a1'},{k:'team',l:'\\u56e2\\u961f'},{k:'projects',l:'\\u9879\\u76ee'},{k:'contracts',l:'\\u5408\\u540c'},{k:'investment',l:'\\u6295\\u878d\\u8d44'},{k:'timeline',l:'\\u65f6\\u95f4\\u7ebf'},{k:'staff',l:'AI\\u5458\\u5de5'},{k:'media',l:'\\u65b0\\u5a92\\u4f53'},{k:'procurement',l:'\\u91c7\\u8d2d'}];"
  + "tabNames.forEach(function(t,i){h+='<button class=\"'+(i===0?'active':'')+'\" onclick=\"switchDetailTab(\\''+t.k+'\\')\">'+ t.l+'</button>';});"
  + "h+='</div>';"
  // ── Tab: overview ──
  + "h+='<div class=\"tab-panel active\" id=\"dtab-overview\">';"
  + "h+='<div class=\"stats-grid\">';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u603b\\u6536\\u5165</div><div class=\"value\">'+fmt(d.finance.income)+' <span class=\"unit\">\\u5143</span></div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u603b\\u652f\\u51fa</div><div class=\"value\">'+fmt(d.finance.expense)+' <span class=\"unit\">\\u5143</span></div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u51c0\\u5229\\u6da6</div><div class=\"value\">'+fmt(d.finance.net)+' <span class=\"unit\">\\u5143</span></div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u5458\\u5de5</div><div class=\"value\">'+(d.hr.salarySummary.cnt||0)+' <span class=\"unit\">\\u4eba</span></div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u5408\\u540c</div><div class=\"value\">'+(d.contracts?d.contracts.length:0)+' <span class=\"unit\">\\u4efd</span></div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u9879\\u76ee</div><div class=\"value\">'+(d.projects.list?d.projects.list.length:0)+' <span class=\"unit\">\\u4e2a</span></div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u544a\\u8b66</div><div class=\"value\">'+(d.alerts?d.alerts.length:0)+' <span class=\"unit\">\\u6761</span></div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u5ba2\\u6237</div><div class=\"value\">'+(d.contacts?d.contacts.length:0)+' <span class=\"unit\">\\u4eba</span></div></div>';"
  + "h+='</div>';"
  // timeline preview
  + "h+='<div class=\"card\"><h2>\\u65f6\\u95f4\\u7ebf\\u9884\\u89c8</h2>';"
  + "var tlItems=[];"
  + "if(d.timeline.milestones)d.timeline.milestones.slice(0,3).forEach(function(m){tlItems.push({date:m.target_date||m.created_at,title:m.title,desc:m.description,type:'milestone'})});"
  + "if(d.timeline.events)d.timeline.events.slice(0,3).forEach(function(e){tlItems.push({date:e.event_date||e.created_at,title:e.title,desc:e.description,type:'event'})});"
  + "tlItems.sort(function(a,b){return b.date>a.date?1:-1});"
  + "if(tlItems.length){h+='<div class=\"timeline\">';tlItems.slice(0,5).forEach(function(t){h+='<div class=\"timeline-item '+(t.type==='milestone'?'milestone':'')+'\"><div class=\"tl-date\">'+fmtDate(t.date)+'</div><div class=\"tl-title\">'+esc(t.title)+'</div><div class=\"tl-desc\">'+esc(t.desc)+'</div></div>';});h+='</div>';}else{h+='<div class=\"empty-state\"><p>\\u6682\\u65e0\\u65f6\\u95f4\\u7ebf\\u6570\\u636e</p></div>';}"
  + "h+='</div>';"
  + "h+='</div>';"
  // ── Tab: finance ──
  + "h+='<div class=\"tab-panel\" id=\"dtab-finance\">';"
  + "h+='<div class=\"stats-grid\"><div class=\"stat-card\"><div class=\"label\">\\u6536\\u5165</div><div class=\"value\" style=\"color:var(--ok)\">'+fmt(d.finance.income)+'</div></div><div class=\"stat-card\"><div class=\"label\">\\u652f\\u51fa</div><div class=\"value\" style=\"color:var(--err)\">'+fmt(d.finance.expense)+'</div></div><div class=\"stat-card\"><div class=\"label\">\\u51c0\\u5229\\u6da6</div><div class=\"value\">'+fmt(d.finance.net)+'</div></div></div>';"
  // transactions table
  + "h+='<div class=\"card\"><div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:16px\"><h2 style=\"margin:0\">\\u4ea4\\u6613\\u8bb0\\u5f55</h2><div style=\"display:flex;gap:8px\"><button class=\"btn btn-pri btn-sm\" onclick=\"addTransaction(\\''+c.id+'\\')\">' + '+ \\u65b0\\u589e\\u4ea4\\u6613' + '</button><a class=\"btn btn-sm\" href=\"/opc/admin/api/export/transactions?company_id='+encodeURIComponent(c.id)+'\" download>\\u5bfc\\u51fa CSV</a></div></div>';"
  + "if(d.finance.transactions&&d.finance.transactions.length){"
  + "h+='<table><thead><tr><th>\\u7c7b\\u578b</th><th>\\u5206\\u7c7b</th><th>\\u91d1\\u989d</th><th>\\u5bf9\\u65b9</th><th>\\u63cf\\u8ff0</th><th>\\u65e5\\u671f</th></tr></thead><tbody>';"
  + "d.finance.transactions.forEach(function(tx){h+='<tr><td><span class=\"badge badge-'+(tx.type==='income'?'income':'expense')+'\">'+(tx.type==='income'?'\\u6536\\u5165':'\\u652f\\u51fa')+'</span></td><td>'+esc(tx.category)+'</td><td style=\"font-weight:600\">'+fmt(tx.amount)+' \\u5143</td><td>'+esc(tx.counterparty)+'</td><td>'+esc(tx.description)+'</td><td>'+fmtDate(tx.transaction_date)+'</td></tr>';});"
  + "h+='</tbody></table>';}else{h+='<div class=\"empty-state\"><p>\\u6682\\u65e0\\u4ea4\\u6613</p></div>';}"
  + "h+='</div>';"
  // invoices
  + "h+='<div class=\"card\"><h2>\\u53d1\\u7968\\u5217\\u8868</h2>';"
  + "if(d.finance.invoices&&d.finance.invoices.length){"
  + "h+='<table><thead><tr><th>\\u53d1\\u7968\\u53f7</th><th>\\u7c7b\\u578b</th><th>\\u5bf9\\u65b9</th><th>\\u91d1\\u989d</th><th>\\u7a0e\\u989d</th><th>\\u72b6\\u6001</th><th>\\u65e5\\u671f</th></tr></thead><tbody>';"
  + "d.finance.invoices.forEach(function(inv){h+='<tr><td>'+esc(inv.invoice_number)+'</td><td>'+(inv.type==='sales'?'\\u9500\\u9879':'\\u8fdb\\u9879')+'</td><td>'+esc(inv.counterparty)+'</td><td>'+fmt(inv.total_amount)+' \\u5143</td><td>'+fmt(inv.tax_amount)+' \\u5143</td><td>'+invoiceStatusBadge(inv.status)+'</td><td>'+fmtDate(inv.issue_date)+'</td></tr>';});"
  + "h+='</tbody></table>';}else{h+='<div class=\"empty-state\"><p>\\u6682\\u65e0\\u53d1\\u7968</p></div>';}"
  + "h+='</div>';"
  // tax filings
  + "h+='<div class=\"card\"><h2>\\u7a0e\\u52a1\\u7533\\u62a5</h2>';"
  + "if(d.finance.taxFilings&&d.finance.taxFilings.length){"
  + "h+='<table><thead><tr><th>\\u671f\\u95f4</th><th>\\u7a0e\\u79cd</th><th>\\u6536\\u5165</th><th>\\u7a0e\\u989d</th><th>\\u72b6\\u6001</th><th>\\u622a\\u6b62\\u65e5</th></tr></thead><tbody>';"
  + "d.finance.taxFilings.forEach(function(tf){h+='<tr><td>'+esc(tf.period)+'</td><td>'+esc(tf.tax_type)+'</td><td>'+fmt(tf.revenue)+' \\u5143</td><td>'+fmt(tf.tax_amount)+' \\u5143</td><td>'+taxStatusBadge(tf.status)+'</td><td>'+fmtDate(tf.due_date)+'</td></tr>';});"
  + "h+='</tbody></table>';}else{h+='<div class=\"empty-state\"><p>\\u6682\\u65e0\\u7a0e\\u52a1\\u8bb0\\u5f55</p></div>';}"
  + "h+='</div>';"
  + "h+='</div>';"
  // ── Tab: team ──
  + "h+='<div class=\"tab-panel\" id=\"dtab-team\">';"
  + "h+='<div class=\"stats-grid\"><div class=\"stat-card\"><div class=\"label\">\\u5728\\u804c\\u4eba\\u6570</div><div class=\"value\">'+(d.hr.salarySummary.cnt||0)+'</div></div><div class=\"stat-card\"><div class=\"label\">\\u6708\\u85aa\\u8d44\\u603b\\u989d</div><div class=\"value\">'+fmt(d.hr.salarySummary.total_salary)+'</div></div><div class=\"stat-card\"><div class=\"label\">\\u793e\\u4fdd\\u603b\\u989d</div><div class=\"value\">'+fmt(d.hr.salarySummary.total_si)+'</div></div><div class=\"stat-card\"><div class=\"label\">\\u516c\\u79ef\\u91d1\\u603b\\u989d</div><div class=\"value\">'+fmt(d.hr.salarySummary.total_hf)+'</div></div></div>';"
  + "h+='<div style=\"margin-bottom:16px\"><button class=\"btn btn-pri btn-sm\" onclick=\"addEmployee(\\''+c.id+'\\')\">' + '+ \\u65b0\\u589e\\u5458\\u5de5' + '</button></div>';"
  + "h+='<div class=\"card\"><h2>HR \\u8bb0\\u5f55</h2>';"
  + "if(d.hr.records&&d.hr.records.length){"
  + "h+='<table><thead><tr><th>\\u59d3\\u540d</th><th>\\u804c\\u4f4d</th><th>\\u85aa\\u8d44</th><th>\\u793e\\u4fdd</th><th>\\u516c\\u79ef\\u91d1</th><th>\\u5408\\u540c\\u7c7b\\u578b</th><th>\\u72b6\\u6001</th></tr></thead><tbody>';"
  + "d.hr.records.forEach(function(r){var st=r.status==='active'?'badge-active':r.status==='resigned'?'badge-warning':'badge-err';h+='<tr><td><strong>'+esc(r.employee_name)+'</strong></td><td>'+esc(r.position)+'</td><td>'+fmt(r.salary)+'</td><td>'+fmt(r.social_insurance)+'</td><td>'+fmt(r.housing_fund)+'</td><td>'+esc(r.contract_type)+'</td><td><span class=\"badge '+st+'\">'+esc(r.status)+'</span></td></tr>';});"
  + "h+='</tbody></table>';}else{h+='<div class=\"empty-state\"><p>\\u6682\\u65e0 HR \\u8bb0\\u5f55</p></div>';}"
  + "h+='</div></div>';"
  // ── Tab: projects ──
  + "h+='<div class=\"tab-panel\" id=\"dtab-projects\">';"
  + "h+='<div style=\"margin-bottom:16px\"><button class=\"btn btn-pri btn-sm\" onclick=\"createProject(\\''+c.id+'\\')\">' + '+ \\u65b0\\u5efa\\u9879\\u76ee' + '</button></div>';"
  + "if(d.projects.list&&d.projects.list.length){"
  + "h+='<div class=\"stats-grid\">';"
  + "d.projects.list.forEach(function(p){"
  + "h+='<div class=\"stat-card\" style=\"cursor:default\"><div class=\"label\">'+esc(p.name)+' '+projectStatusBadge(p.status)+'</div>';"
  + "h+='<div style=\"font-size:13px;color:#64748b;margin:8px 0\">\\u9884\\u7b97: '+fmt(p.budget)+' \\u5143 | \\u5df2\\u82b1: '+fmt(p.spent)+' \\u5143</div>';"
  + "h+=progressBar(p.spent,p.budget);"
  + "h+='</div>';});"
  + "h+='</div>';"
  + "}else{h+='<div class=\"card\"><div class=\"empty-state\"><p>\\u6682\\u65e0\\u9879\\u76ee</p></div></div>';}"
  // tasks
  + "if(d.projects.tasks&&d.projects.tasks.length){"
  + "h+='<div class=\"card\"><h2>\\u4efb\\u52a1\\u5217\\u8868</h2>';"
  + "h+='<table><thead><tr><th>\\u4efb\\u52a1</th><th>\\u8d1f\\u8d23\\u4eba</th><th>\\u4f18\\u5148\\u7ea7</th><th>\\u72b6\\u6001</th><th>\\u622a\\u6b62\\u65e5</th></tr></thead><tbody>';"
  + "d.projects.tasks.forEach(function(t){var priCls=t.priority==='urgent'?'badge-critical':t.priority==='high'?'badge-warning':'badge-default';h+='<tr><td>'+esc(t.title)+'</td><td>'+esc(t.assignee)+'</td><td><span class=\"badge '+priCls+'\">'+esc(t.priority)+'</span></td><td>'+esc(t.status)+'</td><td>'+fmtDate(t.due_date)+'</td></tr>';});"
  + "h+='</tbody></table></div>';}"
  + "h+='</div>';"
  // ── Tab: contracts ──
  + "h+='<div class=\"tab-panel\" id=\"dtab-contracts\">';"
  + "h+='<div class=\"card\"><div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:16px\"><h2 style=\"margin:0\">\\u5408\\u540c\\u5217\\u8868</h2><div style=\"display:flex;gap:8px\"><button class=\"btn btn-pri btn-sm\" onclick=\"createContract(\\''+c.id+'\\')\">' + '+ \\u65b0\\u5efa\\u5408\\u540c' + '</button><a class=\"btn btn-sm\" href=\"/opc/admin/api/export/contracts\" download>\\u5bfc\\u51fa CSV</a><button class=\"btn-pdf\" style=\"font-size:11px;padding:5px 10px\" onclick=\"printContracts()\">&#128438; PDF</button></div></div>';"
  + "if(d.contracts&&d.contracts.length){"
  + "h+='<table><thead><tr><th>\\u6807\\u9898</th><th>\\u5bf9\\u65b9</th><th>\\u91d1\\u989d</th><th>\\u5f00\\u59cb</th><th>\\u7ed3\\u675f</th><th>\\u72b6\\u6001</th><th>\\u98ce\\u9669\\u5907\\u6ce8</th><th>\\u64cd\\u4f5c</th></tr></thead><tbody>';"
  + "d.contracts.forEach(function(ct){h+='<tr><td><strong>'+esc(ct.title)+'</strong></td><td>'+esc(ct.counterparty)+'</td><td>'+fmt(ct.amount)+' \\u5143</td><td>'+fmtDate(ct.start_date)+'</td><td>'+fmtDate(ct.end_date)+'</td><td>'+contractStatusBadge(ct.status)+'</td><td style=\"font-size:12px;color:#94a3b8\">'+esc(ct.risk_notes||'--')+'</td><td style=\"white-space:nowrap\"><button class=\"btn btn-sm\" onclick=\"editContract(\\''+esc(ct.id)+'\\',\\''+esc(ct.title)+'\\',\\''+esc(ct.counterparty)+'\\',\\''+ct.amount+'\\',\\''+esc(ct.status)+'\\',\\''+esc(ct.start_date)+'\\',\\''+esc(ct.end_date)+'\\',\\''+esc(ct.key_terms||'')+'\\',\\''+esc(ct.risk_notes||'')+'\\')\">' + '\\u2712 \\u7f16\\u8f91' + '</button></td></tr>';});"
  + "h+='</tbody></table>';}else{h+='<div class=\"empty-state\"><p>\\u6682\\u65e0\\u5408\\u540c</p></div>';}"
  + "h+='</div></div>';"
  // ── Tab: investment ──
  + "h+='<div class=\"tab-panel\" id=\"dtab-investment\">';"
  // rounds
  + "h+='<div class=\"card\"><div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px\"><h2 style=\"margin:0\">\\u878d\\u8d44\\u8f6e\\u6b21</h2><button class=\"btn btn-pri\" onclick=\"createInvestRound(\\''+c.id+'\\')\">' + '+ \\u65b0\\u5efa\\u8f6e\\u6b21' + '</button></div>';"
  + "if(d.investment.rounds&&d.investment.rounds.length){"
  + "h+='<table><thead><tr><th>\\u8f6e\\u6b21</th><th>\\u878d\\u8d44\\u989d</th><th>\\u6295\\u524d\\u4f30\\u503c</th><th>\\u6295\\u540e\\u4f30\\u503c</th><th>\\u9886\\u6295</th><th>\\u72b6\\u6001</th></tr></thead><tbody>';"
  + "d.investment.rounds.forEach(function(r){h+='<tr><td><strong>'+esc(r.round_name)+'</strong></td><td>'+fmt(r.amount)+' \\u5143</td><td>'+fmt(r.valuation_pre)+' \\u5143</td><td>'+fmt(r.valuation_post)+' \\u5143</td><td>'+esc(r.lead_investor)+'</td><td>'+esc(r.status)+'</td></tr>';});"
  + "h+='</tbody></table>';}else{h+='<div class=\"empty-state\"><p>\\u6682\\u65e0\\u878d\\u8d44\\u8bb0\\u5f55</p></div>';}"
  + "h+='</div>';"
  // investors
  + "h+='<div class=\"card\"><div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px\"><h2 style=\"margin:0\">\\u6295\\u8d44\\u4eba\\u5217\\u8868</h2><button class=\"btn btn-pri\" onclick=\"addInvestor(\\''+c.id+'\\')\">' + '+ \\u65b0\\u589e\\u6295\\u8d44\\u4eba' + '</button></div>';"
  + "if(d.investment.investors&&d.investment.investors.length){"
  + "h+='<table><thead><tr><th>\\u540d\\u79f0</th><th>\\u7c7b\\u578b</th><th>\\u6295\\u8d44\\u989d</th><th>\\u80a1\\u6743\\u5360\\u6bd4</th></tr></thead><tbody>';"
  + "d.investment.investors.forEach(function(inv){h+='<tr><td><strong>'+esc(inv.name)+'</strong></td><td>'+esc(inv.type)+'</td><td>'+fmt(inv.amount)+' \\u5143</td><td>'+inv.equity_percent+'%</td></tr>';});"
  + "h+='</tbody></table>';"
  // equity donut
  + "h+='<div style=\"margin-top:16px\"><h3>\\u80a1\\u6743\\u7ed3\\u6784</h3>'+buildDonutChart(d.investment.investors,160,'name','equity_percent')+'</div>';"
  + "}else{h+='<div class=\"empty-state\"><p>\\u6682\\u65e0\\u6295\\u8d44\\u4eba</p></div>';}"
  + "h+='</div></div>';"
  // ── Tab: timeline ──
  + "h+='<div class=\"tab-panel\" id=\"dtab-timeline\">';"
  + "h+='<div class=\"card\">';"
  + "h+='<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:16px\">';"
  + "h+='<h2 style=\"margin:0\">\\u516c\\u53f8\\u65f6\\u95f4\\u7ebf</h2>';"
  + "h+='<div style=\"display:flex;gap:8px\">';"
  + "h+='<button class=\"btn\" onclick=\"addMilestone(\\''+c.id+'\\')\">' + '+ \\u91cc\\u7a0b\\u7891' + '</button>';"
  + "h+='<button class=\"btn btn-pri\" onclick=\"addLifecycleEvent(\\''+c.id+'\\')\">' + '+ \\u4e8b\\u4ef6' + '</button>';"
  + "h+='</div></div>';"
  + "var allTl=[];"
  + "if(d.timeline.milestones)d.timeline.milestones.forEach(function(m){allTl.push({date:m.target_date||m.created_at,title:m.title,desc:m.description,type:'milestone',cat:m.category,status:m.status})});"
  + "if(d.timeline.events)d.timeline.events.forEach(function(e){allTl.push({date:e.event_date||e.created_at,title:e.title,desc:e.description,type:'event',cat:e.event_type,status:''})});"
  + "allTl.sort(function(a,b){return b.date>a.date?1:-1});"
  + "if(allTl.length){h+='<div class=\"timeline\">';allTl.forEach(function(t){"
  + "h+='<div class=\"timeline-item '+(t.type==='milestone'?'milestone':'')+'\">';"
  + "h+='<div class=\"tl-date\">'+fmtDate(t.date)+' <span class=\"badge badge-'+(t.type==='milestone'?'warning':'info')+'\">'+esc(t.type==='milestone'?'\\u91cc\\u7a0b\\u7891':'\\u4e8b\\u4ef6')+'</span>'+(t.cat?' <span class=\"badge badge-default\">'+esc(t.cat)+'</span>':'')+'</div>';"
  + "h+='<div class=\"tl-title\">'+esc(t.title)+'</div>';"
  + "h+='<div class=\"tl-desc\">'+esc(t.desc)+'</div>';"
  + "h+='</div>';});"
  + "h+='</div>';}else{h+='<div class=\"empty-state\"><p>\\u6682\\u65e0\\u65f6\\u95f4\\u7ebf\\u6570\\u636e</p></div>';}"
  + "h+='</div></div>';"
  // ── Tab: staff (AI员工配置) ──
  + "h+='<div class=\"tab-panel\" id=\"dtab-staff\">';"
  + "h+='<div class=\"card\">';"
  + "h+='<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:20px\">';"
  + "h+='<h2 style=\"margin:0\">AI \\u5458\\u5de5\\u914d\\u7f6e</h2>';"
  + "h+='<button class=\"btn btn-pri\" onclick=\"initDefaultStaff(\\''+c.id+'\\')\">' + '\\u4e00\\u952e\\u521d\\u59cb\\u5316\\u9ed8\\u8ba4\\u5c97\\u4f4d' + '</button>';"
  + "h+='</div>';"
  + "if(d.staffConfig&&d.staffConfig.length){"
  + "h+='<table><thead><tr><th>\\u5c97\\u4f4d</th><th>\\u540d\\u79f0</th><th>\\u542f\\u7528</th><th>\\u63d0\\u793a\\u8bcd\\u9884\\u89c8</th><th>\\u66f4\\u65b0\\u65f6\\u95f4</th><th>\\u64cd\\u4f5c</th></tr></thead><tbody>';"
  + "d.staffConfig.forEach(function(s){"
  + "var promptPreview=s.system_prompt?esc(s.system_prompt.slice(0,50))+(s.system_prompt.length>50?'...':''):'<span style=\"color:var(--tx3)\">\\u672a\\u914d\\u7f6e</span>';"
  + "h+='<tr>';"
  + "h+='<td><code style=\"font-size:11px;background:#f3f4f6;padding:2px 6px;border-radius:4px\">'+esc(s.role)+'</code></td>';"
  + "h+='<td><strong>'+esc(s.role_name)+'</strong></td>';"
  + "h+='<td><label class=\"toggle\" style=\"cursor:pointer\" title=\"'+(s.enabled?'\\u70b9\\u51fb\\u505c\\u7528':'\\u70b9\\u51fb\\u542f\\u7528')+'\">';"
  + "h+='<input type=\"checkbox\" '+(s.enabled?'checked':'')+' onchange=\"toggleStaff(\\''+esc(s.id)+'\\',\\''+esc(c.id)+'\\',\\''+esc(s.role)+'\\',this.checked)\">';"
  + "h+='<span class=\"slider\"></span></label></td>';"
  + "h+='<td style=\"max-width:260px;font-size:12px;color:var(--tx2)\">'+promptPreview+'</td>';"
  + "h+='<td style=\"white-space:nowrap\">'+fmtDate(s.updated_at)+'</td>';"
  + "h+='<td style=\"white-space:nowrap\"><button class=\"btn btn-sm\" onclick=\"editStaff(\\''+esc(s.id)+'\\',\\''+esc(s.role)+'\\',\\''+esc(s.role_name)+'\\',\\''+c.id+'\\')\">\\u2712 \\u7f16\\u8f91</button></td>';"
  + "h+='</tr>';"
  + "});"
  + "h+='</tbody></table>';"
  + "}else{"
  + "h+='<div class=\"empty-state\"><div class=\"icon\">\\ud83e\\udd16</div><p>\\u6682\\u65e0 AI \\u5458\\u5de5\\u914d\\u7f6e</p><p style=\"margin-top:8px;font-size:12px\">\\u70b9\\u51fb\\u53f3\\u4e0a\\u89d2\\u300c\\u4e00\\u952e\\u521d\\u59cb\\u5316\\u9ed8\\u8ba4\\u5c97\\u4f4d\\u300d\\u5373\\u53ef\\u5feb\\u901f\\u521b\\u5efa 6 \\u4e2a AI \\u5458\\u5de5</p></div>';"
  + "}"
  + "h+='</div></div>';"
  // ── Tab: media (新媒体内容) ──
  + "h+='<div class=\"tab-panel\" id=\"dtab-media\">';"
  + "h+='<div class=\"card\"><div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px\"><h2 style=\"margin:0\">\\u65b0\\u5a92\\u4f53\\u5185\\u5bb9</h2><button class=\"btn btn-pri\" onclick=\"createMedia(\\''+c.id+'\\')\">' + '+ \\u65b0\\u5efa\\u5185\\u5bb9' + '</button></div>';"
  + "if(d.mediaContent&&d.mediaContent.length){"
  + "h+='<table><thead><tr><th>\\u6807\\u9898</th><th>\\u5e73\\u53f0</th><th>\\u7c7b\\u578b</th><th>\\u72b6\\u6001</th><th>\\u9884\\u7ea6/\\u53d1\\u5e03\\u65e5\\u671f</th></tr></thead><tbody>';"
  + "d.mediaContent.forEach(function(m){"
  + "var statusMap={'draft':'\\u8349\\u7a3f','scheduled':'\\u5df2\\u5b89\\u6392','published':'\\u5df2\\u53d1\\u5e03','archived':'\\u5df2\\u5f52\\u6863'};"
  + "var statusCls={'draft':'badge-draft','scheduled':'badge-info','published':'badge-active','archived':'badge-other'};"
  + "h+='<tr><td><strong>'+esc(m.title)+'</strong></td><td>'+esc(m.platform)+'</td><td>'+esc(m.content_type)+'</td><td><span class=\"badge '+(statusCls[m.status]||'badge-other')+'\">'+(statusMap[m.status]||esc(m.status))+'</span></td><td>'+fmtDate(m.scheduled_date||m.published_date)+'</td></tr>';"
  + "});"
  + "h+='</tbody></table>';"
  + "}else{h+='<div class=\"empty-state\"><div class=\"icon\">\\ud83d\\udce3</div><p>\\u6682\\u65e0\\u5185\\u5bb9\\u8bb0\\u5f55\\uff0c\\u70b9\\u51fb\\u300c+ \\u65b0\\u5efa\\u5185\\u5bb9\\u300d\\u5f00\\u59cb\\u521b\\u5efa</p></div>';}"
  + "h+='</div></div>';"
  // ── Tab: procurement (服务采购) ──
  + "h+='<div class=\"tab-panel\" id=\"dtab-procurement\">';"
  + "h+='<div class=\"card\"><div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px\"><h2 style=\"margin:0\">\\u670d\\u52a1\\u91c7\\u8d2d\\u8ba2\\u5355</h2><button class=\"btn btn-pri\" onclick=\"createOrder(\\''+c.id+'\\')\">' + '+ \\u65b0\\u5efa\\u8ba2\\u5355' + '</button></div>';"
  + "if(d.procurementOrders&&d.procurementOrders.length){"
  + "var totalProcurement=d.procurementOrders.reduce(function(s,o){return s+(o.amount||0);},0);"
  + "h+='<div class=\"stats-grid\" style=\"grid-template-columns:repeat(3,1fr);margin-bottom:16px\">';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u91c7\\u8d2d\\u8ba2\\u5355</div><div class=\"value\">'+d.procurementOrders.length+' <span class=\"unit\">\\u4efd</span></div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u91c7\\u8d2d\\u603b\\u989d</div><div class=\"value\">'+fmt(totalProcurement)+' <span class=\"unit\">\\u5143</span></div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u5df2\\u5b8c\\u6210</div><div class=\"value\">'+d.procurementOrders.filter(function(o){return o.status==='completed';}).length+' <span class=\"unit\">\\u5355</span></div></div>';"
  + "h+='</div>';"
  + "h+='<table><thead><tr><th>\\u6807\\u9898</th><th>\\u670d\\u52a1\\u540d\\u79f0</th><th>\\u91d1\\u989d</th><th>\\u72b6\\u6001</th><th>\\u4e0b\\u5355\\u65e5\\u671f</th><th>\\u5907\\u6ce8</th></tr></thead><tbody>';"
  + "d.procurementOrders.forEach(function(o){"
  + "var statusMap={'pending':'\\u5f85\\u5904\\u7406','approved':'\\u5df2\\u5ba1\\u6279','completed':'\\u5df2\\u5b8c\\u6210','cancelled':'\\u5df2\\u53d6\\u6d88'};"
  + "var statusCls={'pending':'badge-draft','approved':'badge-info','completed':'badge-active','cancelled':'badge-err'};"
  + "h+='<tr><td><strong>'+esc(o.title||'--')+'</strong></td><td>'+esc(o.service_name||'--')+'</td><td>'+fmt(o.amount)+' \\u5143</td><td><span class=\"badge '+(statusCls[o.status]||'badge-other')+'\">'+(statusMap[o.status]||esc(o.status))+'</span></td><td>'+fmtDate(o.order_date||o.created_at)+'</td><td style=\"font-size:12px;color:var(--tx2)\">'+esc(o.notes||'--')+'</td></tr>';"
  + "});"
  + "h+='</tbody></table>';"
  + "}else{h+='<div class=\"empty-state\"><div class=\"icon\">\\ud83d\\uded2</div><p>\\u6682\\u65e0\\u91c7\\u8d2d\\u8ba2\\u5355\\uff0c\\u8bf7\\u5728\\u5bf9\\u8bdd\\u4e2d\\u4f7f\\u7528 opc_procurement \\u5de5\\u5177\\u521b\\u5efa\\u8ba2\\u5355</p></div>';}"
  + "h+='</div>';"
  + "if(d.services&&d.services.length){"
  + "h+='<div class=\"card\" style=\"margin-top:16px\"><h2>\\u670d\\u52a1\\u76ee\\u5f55</h2>';"
  + "h+='<table><thead><tr><th>\\u540d\\u79f0</th><th>\\u5206\\u7c7b</th><th>\\u63d0\\u4f9b\\u65b9</th><th>\\u5355\\u4ef7</th><th>\\u8ba1\\u8d39\\u5468\\u671f</th><th>\\u72b6\\u6001</th></tr></thead><tbody>';"
  + "d.services.forEach(function(s){h+='<tr><td><strong>'+esc(s.name)+'</strong></td><td>'+esc(s.category)+'</td><td>'+esc(s.provider)+'</td><td>'+fmt(s.unit_price)+' \\u5143</td><td>'+esc(s.billing_cycle)+'</td><td>'+esc(s.status)+'</td></tr>';});"
  + "h+='</tbody></table></div>';}"
  + "h+='</div>';"
  + "el.innerHTML=h;"
  + "}).catch(function(e){el.innerHTML='<div class=\"card\"><div class=\"empty-state\"><p>\\u52a0\\u8f7d\\u5931\\u8d25: '+esc(String(e))+'</p></div></div>';});}"
  + "\nfunction switchDetailTab(name){document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active')});document.querySelectorAll('.detail-tabs button').forEach(function(b){b.classList.remove('active')});var panel=document.getElementById('dtab-'+name);if(panel)panel.classList.add('active');var btns=document.querySelectorAll('.detail-tabs button');btns.forEach(function(b){var fn=b.getAttribute('onclick')||'';if(fn.indexOf(\"'\"+name+\"'\")>-1||fn.indexOf('\"'+name+'\"')>-1)b.classList.add('active')});}"
  // ── loadFinance ──
  + "\nfunction loadFinance(){"
  + "var el=document.getElementById('finance-content');"
  + "el.innerHTML='<div class=\"skeleton\" style=\"height:400px\"></div>';"
  + "fetch('/opc/admin/api/finance/overview').then(function(r){return r.json()}).then(function(d){"
  + "var h='';"
  + "h+='<div class=\"grid-2\" style=\"margin-bottom:16px\">';"
  + "h+='<div class=\"card\"><h2 style=\"margin-bottom:16px\">12 \\u4e2a\\u6708\\u6536\\u5165\\u8d8b\\u52bf</h2>'+buildSingleBarChart(d.trends,460,220,'month','income','#0ea5e9','\\u6536\\u5165')+'</div>';"
  + "h+='<div class=\"card\"><h2 style=\"margin-bottom:16px\">12 \\u4e2a\\u6708\\u652f\\u51fa\\u8d8b\\u52bf</h2>'+buildSingleBarChart(d.trends,460,220,'month','expense','#f97316','\\u652f\\u51fa')+'</div>';"
  + "h+='</div>';"
  // invoice summary
  + "h+='<div class=\"card\"><h2>\\u53d1\\u7968\\u72b6\\u6001\\u6c47\\u603b</h2><div class=\"grid-2\">';"
  + "h+='<div><h3>\\u9500\\u9879\\u53d1\\u7968</h3><div class=\"stats-grid\" style=\"grid-template-columns:repeat(4,1fr)\">';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u8349\\u7a3f</div><div class=\"value\">'+d.invoiceSummary.sales.draft+'</div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u5df2\\u5f00</div><div class=\"value\">'+d.invoiceSummary.sales.issued+'</div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u5df2\\u4ed8</div><div class=\"value\" style=\"color:var(--ok)\">'+d.invoiceSummary.sales.paid+'</div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u4f5c\\u5e9f</div><div class=\"value\" style=\"color:var(--err)\">'+d.invoiceSummary.sales.void+'</div></div>';"
  + "h+='</div></div>';"
  + "h+='<div><h3>\\u8fdb\\u9879\\u53d1\\u7968</h3><div class=\"stats-grid\" style=\"grid-template-columns:repeat(4,1fr)\">';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u8349\\u7a3f</div><div class=\"value\">'+d.invoiceSummary.purchase.draft+'</div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u5df2\\u5f00</div><div class=\"value\">'+d.invoiceSummary.purchase.issued+'</div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u5df2\\u4ed8</div><div class=\"value\" style=\"color:var(--ok)\">'+d.invoiceSummary.purchase.paid+'</div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\\u4f5c\\u5e9f</div><div class=\"value\" style=\"color:var(--err)\">'+d.invoiceSummary.purchase.void+'</div></div>';"
  + "h+='</div></div>';"
  + "h+='</div></div>';"
  // tax calendar
  + "h+='<div class=\"card\"><h2>\\u7a0e\\u52a1\\u65e5\\u5386</h2>';"
  + "if(d.taxFilings&&d.taxFilings.length){"
  + "var today=new Date().toISOString().slice(0,10);"
  + "h+='<table><thead><tr><th>\\u516c\\u53f8</th><th>\\u671f\\u95f4</th><th>\\u7a0e\\u79cd</th><th>\\u6536\\u5165</th><th>\\u7a0e\\u989d</th><th>\\u72b6\\u6001</th><th>\\u622a\\u6b62\\u65e5</th></tr></thead><tbody>';"
  + "d.taxFilings.forEach(function(tf){var overdue=tf.status==='pending'&&tf.due_date&&tf.due_date<today;h+='<tr style=\"'+(overdue?'background:#fef2f2':'')+'\">';"
  + "h+='<td>'+esc(tf.company_name||'')+'</td><td>'+esc(tf.period)+'</td><td>'+esc(tf.tax_type)+'</td><td>'+fmt(tf.revenue)+' \\u5143</td><td>'+fmt(tf.tax_amount)+' \\u5143</td><td>'+taxStatusBadge(tf.status)+'</td><td>'+(overdue?'<span style=\"color:var(--err);font-weight:600\">'+fmtDate(tf.due_date)+' \\u903e\\u671f</span>':fmtDate(tf.due_date))+'</td></tr>';});"
  + "h+='</tbody></table>';}else{h+='<div class=\"empty-state\"><p>\\u6682\\u65e0\\u7a0e\\u52a1\\u7533\\u62a5\\u8bb0\\u5f55</p></div>';}"
  + "h+='</div>';"
  + "el.innerHTML=h;"
  + "}).catch(function(e){el.innerHTML='<div class=\"card\"><div class=\"empty-state\"><p>\\u52a0\\u8f7d\\u5931\\u8d25</p></div></div>';});}"
  // ── loadMonitoring ──
  + "\nvar monitoringAlertPage=1;"
  + "\nfunction loadMonitoring(){"
  + "monitoringAlertPage=1;"
  + "var el=document.getElementById('monitoring-content');"
  + "el.innerHTML='<div class=\"skeleton\" style=\"height:400px\"></div>';"
  + "fetch('/opc/admin/api/monitoring').then(function(r){return r.json()}).then(function(d){"
  + "window._monitoringData=d;"
  + "renderMonitoring(d,1);"
  + "}).catch(function(e){document.getElementById('monitoring-content').innerHTML='<div class=\"card\"><div class=\"empty-state\"><p>\\u52a0\\u8f7d\\u5931\\u8d25</p></div></div>';});}"
  + "\nfunction renderMonitoring(d,alertPage){"
  + "var el=document.getElementById('monitoring-content');"
  + "var h='';"
  // severity cards
  + "h+='<div class=\"stats-grid\" style=\"grid-template-columns:repeat(3,1fr)\">';"
  + "h+='<div class=\"stat-card\" style=\"border-left:4px solid var(--err)\"><div class=\"label\">\\u4e25\\u91cd</div><div class=\"value\" style=\"color:var(--err)\">'+d.alertCounts.critical+'</div></div>';"
  + "h+='<div class=\"stat-card\" style=\"border-left:4px solid var(--warn)\"><div class=\"label\">\\u8b66\\u544a</div><div class=\"value\" style=\"color:var(--warn)\">'+d.alertCounts.warning+'</div></div>';"
  + "h+='<div class=\"stat-card\" style=\"border-left:4px solid #3b82f6\"><div class=\"label\">\\u63d0\\u793a</div><div class=\"value\" style=\"color:#3b82f6\">'+d.alertCounts.info+'</div></div>';"
  + "h+='</div>';"
  // KPI trend charts — TOP
  + "h+='<div class=\"card\"><div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:16px\"><h2 style=\"margin:0\">KPI \\u8d8b\\u52bf</h2><span style=\"font-size:12px;color:var(--tx3)\">\\u8fd130\\u5929</span></div>';"
  + "if(d.metricTrends&&d.metricTrends.length){"
  + "var trendMap={};"
  + "d.metricTrends.forEach(function(r){if(!trendMap[r.name])trendMap[r.name]={unit:r.unit,category:r.category,points:[]};trendMap[r.name].points.push({day:r.day,avg_value:r.avg_value});});"
  + "var trendColors=['#0f172a','#0ea5e9','#8b5cf6','#f59e0b','#10b981','#ef4444'];"
  + "var trendCi=0;"
  + "h+='<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:16px\">';"
  + "Object.keys(trendMap).forEach(function(tname){"
  + "var tm=trendMap[tname];"
  + "var tcol=trendColors[trendCi++%trendColors.length];"
  + "h+='<div style=\"border:1px solid var(--bd);border-radius:var(--r);padding:16px\">';"
  + "h+='<div style=\"font-size:13px;font-weight:600;margin-bottom:8px\">'+esc(tname)+' <span style=\"font-size:11px;color:var(--tx3);font-weight:400\">('+esc(tm.unit)+')</span></div>';"
  + "h+=buildLineChart(tm.points,400,160,'day','avg_value',tcol,tname);"
  + "h+='</div>';"
  + "});"
  + "h+='</div>';"
  + "}else{h+='<div class=\"empty-state\"><p>\\u6682\\u65e0\\u8d8b\\u52bf\\u6570\\u636e\\uff0c\\u8bf7\\u5148\\u901a\\u8fc7 opc_monitoring \\u5de5\\u5177\\u8bb0\\u5f55\\u6307\\u6807</p></div>';}"
  + "h+='</div>';"
  // alert list with pagination
  + "var PAGE_SIZE=10;"
  + "var alerts=d.alerts||[];"
  + "var totalPages=Math.max(1,Math.ceil(alerts.length/PAGE_SIZE));"
  + "var page=Math.min(Math.max(1,alertPage),totalPages);"
  + "var pageAlerts=alerts.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);"
  + "h+='<div class=\"card\" id=\"alert-card\"><div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px\">';"
  + "h+='<h2 style=\"margin:0\">\\u6d3b\\u8dc3\\u544a\\u8b66 <span style=\"font-size:13px;font-weight:400;color:var(--tx3)\">('+alerts.length+')</span></h2>';"
  + "h+='</div>';"
  + "if(alerts.length){"
  + "h+='<table><thead><tr><th>\\u4e25\\u91cd\\u5ea6</th><th>\\u516c\\u53f8</th><th>\\u6807\\u9898</th><th>\\u6d88\\u606f</th><th>\\u65f6\\u95f4</th><th>\\u64cd\\u4f5c</th></tr></thead><tbody>';"
  + "pageAlerts.forEach(function(a){h+='<tr><td>'+severityBadge(a.severity)+'</td><td>'+esc(a.company_name||'')+'</td><td><strong>'+esc(a.title)+'</strong></td><td style=\"font-size:13px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">'+esc(a.message)+'</td><td>'+fmtDate(a.created_at)+'</td><td><button class=\"btn btn-sm\" onclick=\"dismissAlert(\\''+esc(a.id)+'\\')\">' + '\\u6d88\\u9664' + '</button></td></tr>';});"
  + "h+='</tbody></table>';"
  + "if(totalPages>1){"
  + "h+='<div style=\"display:flex;align-items:center;gap:8px;margin-top:12px;justify-content:flex-end\">';"
  + "h+='<button class=\"btn btn-sm\" '+(page<=1?'disabled':'')+' onclick=\"renderMonitoring(window._monitoringData,'+(page-1)+')\">&laquo; \\u4e0a\\u4e00\\u9875</button>';"
  + "h+='<span style=\"font-size:13px;color:var(--tx2)\">'+page+' / '+totalPages+'</span>';"
  + "h+='<button class=\"btn btn-sm\" '+(page>=totalPages?'disabled':'')+' onclick=\"renderMonitoring(window._monitoringData,'+(page+1)+')\">\\u4e0b\\u4e00\\u9875 &raquo;</button>';"
  + "h+='</div>';"
  + "}"
  + "}else{h+='<div class=\"empty-state\"><div class=\"icon\">\\u2705</div><p>\\u6ca1\\u6709\\u6d3b\\u8dc3\\u544a\\u8b66</p></div>';}"
  + "h+='</div>';"
  // metrics overview
  + "h+='<div class=\"card\"><div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px\"><h2 style=\"margin:0\">\\u6307\\u6807\\u6982\\u89c8</h2><button class=\"btn btn-pri\" onclick=\"recordMetric()\">' + '+ \\u8bb0\\u5f55\\u6307\\u6807' + '</button></div>';"
  + "if(d.latestMetrics&&d.latestMetrics.length){"
  + "var cats={};d.latestMetrics.forEach(function(m){if(!cats[m.category])cats[m.category]=[];cats[m.category].push(m);});"
  + "Object.keys(cats).forEach(function(cat){h+='<h3 style=\"margin-top:12px\">'+esc(cat||'\\u672a\\u5206\\u7c7b')+'</h3><div class=\"stats-grid\" style=\"grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:8px\">';cats[cat].forEach(function(m){h+='<div class=\"stat-card\" style=\"padding:12px\"><div class=\"label\">'+esc(m.name)+'</div><div class=\"value\" style=\"font-size:20px\">'+m.value+' <span class=\"unit\">'+esc(m.unit)+'</span></div></div>';});h+='</div>';});"
  + "}else{h+='<div class=\"empty-state\"><p>\\u6682\\u65e0\\u6307\\u6807\\u6570\\u636e</p></div>';}"
  + "h+='</div>';"
  // recent metrics
  + "h+='<div class=\"card\"><h2>\\u8fd1\\u671f\\u6307\\u6807\\u8bb0\\u5f55</h2>';"
  + "if(d.recentMetrics&&d.recentMetrics.length){"
  + "h+='<table><thead><tr><th>\\u516c\\u53f8</th><th>\\u6307\\u6807</th><th>\\u503c</th><th>\\u5355\\u4f4d</th><th>\\u5206\\u7c7b</th><th>\\u65f6\\u95f4</th></tr></thead><tbody>';"
  + "d.recentMetrics.forEach(function(m){h+='<tr><td>'+esc(m.company_name||'')+'</td><td>'+esc(m.name)+'</td><td style=\"font-weight:600\">'+m.value+'</td><td>'+esc(m.unit)+'</td><td>'+esc(m.category)+'</td><td>'+fmtDate(m.recorded_at)+'</td></tr>';});"
  + "h+='</tbody></table>';}else{h+='<div class=\"empty-state\"><p>\\u6682\\u65e0\\u6307\\u6807\\u8bb0\\u5f55</p></div>';}"
  + "h+='</div>';"
  + "el.innerHTML=h;"
  + "}"
  // ── dismissAlert ──
  + "\nfunction dismissAlert(id){fetch('/opc/admin/api/alerts/'+encodeURIComponent(id)+'/dismiss',{method:'POST'}).then(function(r){return r.json()}).then(function(d){if(d.ok){showToast('\\u544a\\u8b66\\u5df2\\u6d88\\u9664');loadMonitoring();}else{showToast('\\u6d88\\u9664\\u5931\\u8d25');}}).catch(function(){showToast('\\u64cd\\u4f5c\\u5931\\u8d25');});}"
  // ── AI员工操作 ──
  + "\nfunction toggleStaff(staffId,companyId,role,enabled){"
  + "fetch('/opc/admin/api/staff/'+encodeURIComponent(staffId)+'/toggle',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:enabled?1:0})})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){showToast(enabled?'\\u5df2\\u542f\\u7528 '+role:'\\u5df2\\u505c\\u7528 '+role);}"
  + "else{showToast(d.message||d.error||'\\u64cd\\u4f5c\\u5931\\u8d25');}}).catch(function(){showToast('\\u8bf7\\u6c42\\u5931\\u8d25');});}"
  + "\nfunction editStaff(staffId,role,roleName,companyId){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "fetch('/opc/admin/api/staff/'+encodeURIComponent(staffId)).then(function(r){return r.json()}).then(function(s){"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:560px;max-width:96vw;max-height:90vh;overflow-y:auto\">';"
  + "html+='<h2 style=\"margin:0 0 4px\">\\u7f16\\u8f91 AI \\u5458\\u5de5</h2>';"
  + "html+='<p style=\"color:var(--tx3);font-size:13px;margin-bottom:20px\">\\u5c97\\u4f4d: <code>'+esc(role)+'</code></p>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u663e\\u793a\\u540d\\u79f0 <input id=\"sf-name\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" value=\"'+esc(s.role_name||roleName)+'\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u7cfb\\u7edf\\u63d0\\u793a\\u8bcd (System Prompt) <textarea id=\"sf-prompt\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px;resize:vertical;min-height:160px\">'+esc(s.system_prompt||'')+'</textarea></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u5907\\u6ce8 <input id=\"sf-notes\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" value=\"'+esc(s.notes||'')+'\"></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\\u53d6\\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveStaff(\\''+staffId+'\\',\\''+companyId+'\\')\">\\u4fdd\\u5b58</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);"
  + "}).catch(function(){showToast('\\u52a0\\u8f7d\\u5931\\u8d25');});}"
  + "\nfunction saveStaff(staffId,companyId){"
  + "var data={role_name:document.getElementById('sf-name').value,system_prompt:document.getElementById('sf-prompt').value,notes:document.getElementById('sf-notes').value};"
  + "fetch('/opc/admin/api/staff/'+encodeURIComponent(staffId)+'/edit',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\\u5df2\\u4fdd\\u5b58');showCompany(companyId);}"
  + "else{showToast(d.message||d.error||'\\u4fdd\\u5b58\\u5931\\u8d25');}}).catch(function(){showToast('\\u8bf7\\u6c42\\u5931\\u8d25');});}"
  + "\nfunction addEmployee(companyId){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var today=new Date().toISOString().slice(0,10);"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:480px;max-width:96vw\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\\u65b0\\u589e\\u5458\\u5de5</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u59d3\\u540d <input id=\"emp-name\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u5c97\\u4f4d <input id=\"emp-pos\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u6708\\u85aa (\\u5143) <input id=\"emp-salary\" type=\"number\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u7528\\u5de5\\u7c7b\\u578b <select id=\"emp-type\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\"><option value=\"full_time\">\\u5168\\u804c</option><option value=\"part_time\">\\u517c\\u804c</option><option value=\"contractor\">\\u5408\\u540c\\u5de5</option><option value=\"intern\">\\u5b9e\\u4e60</option></select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u5165\\u804c\\u65e5\\u671f <input id=\"emp-date\" type=\"date\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px\" value=\"'+today+'\"></label>';"
  + "html+='</div><div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\\u53d6\\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveEmployee(\\''+companyId+'\\')\">' + '\\u4fdd\\u5b58' + '</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);}"
  + "\nfunction saveEmployee(companyId){"
  + "var data={company_id:companyId,employee_name:document.getElementById('emp-name').value,position:document.getElementById('emp-pos').value,salary:parseFloat(document.getElementById('emp-salary').value)||0,contract_type:document.getElementById('emp-type').value,start_date:document.getElementById('emp-date').value};"
  + "fetch('/opc/admin/api/hr/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\\u5458\\u5de5\\u5df2\\u6dfb\\u52a0');showCompany(companyId);}else{showToast(d.message||d.error||'\\u4fdd\\u5b58\\u5931\\u8d25');}}).catch(function(){showToast('\\u8bf7\\u6c42\\u5931\\u8d25');});}"
  + "\nfunction createProject(companyId){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:480px;max-width:96vw\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\\u65b0\\u5efa\\u9879\\u76ee</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u9879\\u76ee\\u540d\\u79f0 <input id=\"pj-name\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u63cf\\u8ff0 <textarea id=\"pj-desc\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px;resize:vertical;min-height:72px\"></textarea></label>';"
  + "html+='<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u5f00\\u59cb\\u65e5\\u671f <input id=\"pj-start\" type=\"date\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u622a\\u6b62\\u65e5\\u671f <input id=\"pj-end\" type=\"date\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px\"></label>';"
  + "html+='</div>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u9884\\u7b97 (\\u5143) <input id=\"pj-budget\" type=\"number\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0\"></label>';"
  + "html+='</div><div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\\u53d6\\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveProject(\\''+companyId+'\\')\">' + '\\u4fdd\\u5b58' + '</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);}"
  + "\nfunction saveProject(companyId){"
  + "var data={company_id:companyId,name:document.getElementById('pj-name').value,description:document.getElementById('pj-desc').value,start_date:document.getElementById('pj-start').value,end_date:document.getElementById('pj-end').value,budget:parseFloat(document.getElementById('pj-budget').value)||0};"
  + "fetch('/opc/admin/api/projects/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\\u9879\\u76ee\\u5df2\\u521b\\u5efa');showCompany(companyId);}else{showToast(d.message||d.error||'\\u4fdd\\u5b58\\u5931\\u8d25');}}).catch(function(){showToast('\\u8bf7\\u6c42\\u5931\\u8d25');});}"
  + "\nfunction initDefaultStaff(companyId){"
  + "fetch('/opc/admin/api/staff/'+encodeURIComponent(companyId)+'/init',{method:'POST'})"
  + ".then(function(r){return r.json()}).then(function(d){"
  + "if(d.ok){showToast('\\u5df2\\u521d\\u59cb\\u5316 '+d.created+' \\u4e2a\\u5c97\\u4f4d');showCompany(companyId);}"
  + "else{showToast(d.message||d.error||'\\u521d\\u59cb\\u5316\\u5931\\u8d25');}}).catch(function(){showToast('\\u8bf7\\u6c42\\u5931\\u8d25');});}"
  // ── 合同编辑 ──
  + "\nfunction editContract(id,title,counterparty,amount,status,startDate,endDate,keyTerms,riskNotes){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var statusOpts=[['draft','\\u8349\\u7a3f'],['active','\\u751f\\u6548\\u4e2d'],['expired','\\u5df2\\u8fc7\\u671f'],['terminated','\\u5df2\\u7ec8\\u6b62'],['disputed','\\u4e89\\u8bae\\u4e2d']];"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:520px;max-width:96vw;max-height:90vh;overflow-y:auto\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\\u7f16\\u8f91\\u5408\\u540c</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u6807\\u9898 <input id=\"ct-title\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" value=\"'+esc(title)+'\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u5bf9\\u65b9 <input id=\"ct-party\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" value=\"'+esc(counterparty)+'\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u91d1\\u989d (\\u5143) <input id=\"ct-amount\" type=\"number\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" value=\"'+amount+'\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u72b6\\u6001 <select id=\"ct-status\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\">';"
  + "statusOpts.forEach(function(o){html+='<option value=\"'+o[0]+'\"'+(status===o[0]?' selected':'')+'>'+o[1]+'</option>';});"
  + "html+='</select></label>';"
  + "html+='<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u5f00\\u59cb\\u65e5\\u671f <input id=\"ct-start\" type=\"date\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px\" value=\"'+esc(startDate)+'\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u7ed3\\u675f\\u65e5\\u671f <input id=\"ct-end\" type=\"date\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px\" value=\"'+esc(endDate)+'\"></label>';"
  + "html+='</div>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u6838\\u5fc3\\u6761\\u6b3e <textarea id=\"ct-terms\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px;resize:vertical;min-height:64px\">'+esc(keyTerms)+'</textarea></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u98ce\\u9669\\u5907\\u6ce8 <textarea id=\"ct-risk\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px;resize:vertical;min-height:48px\">'+esc(riskNotes)+'</textarea></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\\u53d6\\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveContract(\\''+id+'\\')\">' + '\\u4fdd\\u5b58' + '</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);}"
  + "\nfunction saveContract(id){"
  + "var data={title:document.getElementById('ct-title').value,counterparty:document.getElementById('ct-party').value,"
  + "amount:parseFloat(document.getElementById('ct-amount').value)||0,status:document.getElementById('ct-status').value,"
  + "start_date:document.getElementById('ct-start').value,end_date:document.getElementById('ct-end').value,"
  + "key_terms:document.getElementById('ct-terms').value,notes:document.getElementById('ct-risk').value};"
  + "fetch('/opc/admin/api/contracts/'+encodeURIComponent(id)+'/edit',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\\u5408\\u540c\\u5df2\\u4fdd\\u5b58');showCompany(window.currentCompanyId||'');}"
  + "else{showToast(d.message||d.error||'\\u4fdd\\u5b58\\u5931\\u8d25');}}).catch(function(){showToast('\\u8bf7\\u6c42\\u5931\\u8d25');});}"
  // ── createContract ──
  + "\nfunction createContract(companyId){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var today=new Date().toISOString().slice(0,10);"
  + "var typeOpts=[['\\u670d\\u52a1\\u5408\\u540c','\\u670d\\u52a1\\u5408\\u540c'],['\\u91c7\\u8d2d\\u5408\\u540c','\\u91c7\\u8d2d\\u5408\\u540c'],['\\u52b3\\u52a8\\u5408\\u540c','\\u52b3\\u52a8\\u5408\\u540c'],['\\u79df\\u8d41\\u5408\\u540c','\\u79df\\u8d41\\u5408\\u540c'],['\\u5408\\u4f5c\\u534f\\u8bae','\\u5408\\u4f5c\\u534f\\u8bae'],['NDA','NDA'],['\\u5176\\u4ed6','\\u5176\\u4ed6']];"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:540px;max-width:96vw;max-height:90vh;overflow-y:auto\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\\u65b0\\u5efa\\u5408\\u540c</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u6807\\u9898 <input id=\"nc-title\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u5bf9\\u65b9 <input id=\"nc-counterparty\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u5408\\u540c\\u7c7b\\u578b <select id=\"nc-type\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\">';"
  + "typeOpts.forEach(function(o){html+='<option value=\"'+o[0]+'\">'+o[1]+'</option>';});"
  + "html+='</select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u91d1\\u989d (\\u5143, \\u53ef\\u4e3a0) <input id=\"nc-amount\" type=\"number\" min=\"0\" step=\"0.01\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" value=\"0\"></label>';"
  + "html+='<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u5f00\\u59cb\\u65e5\\u671f <input id=\"nc-start\" type=\"date\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px\" value=\"'+today+'\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u7ed3\\u675f\\u65e5\\u671f <input id=\"nc-end\" type=\"date\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px\"></label>';"
  + "html+='</div>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u6838\\u5fc3\\u6761\\u6b3e <textarea id=\"nc-terms\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px;resize:vertical;min-height:64px\"></textarea></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u98ce\\u9669\\u5907\\u6ce8 <textarea id=\"nc-risk\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px;resize:vertical;min-height:48px\"></textarea></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\\u53d6\\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveNewContract(\\''+companyId+'\\')\">' + '\\u4fdd\\u5b58' + '</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);}"
  + "\nfunction saveNewContract(companyId){"
  + "var data={company_id:companyId,title:document.getElementById('nc-title').value,counterparty:document.getElementById('nc-counterparty').value,contract_type:document.getElementById('nc-type').value,amount:parseFloat(document.getElementById('nc-amount').value)||0,start_date:document.getElementById('nc-start').value,end_date:document.getElementById('nc-end').value,key_terms:document.getElementById('nc-terms').value,risk_notes:document.getElementById('nc-risk').value};"
  + "fetch('/opc/admin/api/contracts/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\\u5408\\u540c\\u5df2\\u65b0\\u5efa');showCompany(companyId);}"
  + "else{showToast(d.message||d.error||'\\u65b0\\u5efa\\u5931\\u8d25');}}).catch(function(){showToast('\\u8bf7\\u6c42\\u5931\\u8d25');});}"
  // ── addTransaction ──
  + "\nfunction addTransaction(companyId){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var today=new Date().toISOString().slice(0,10);"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:480px;max-width:96vw;max-height:90vh;overflow-y:auto\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\\u65b0\\u589e\\u4ea4\\u6613</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u7c7b\\u578b <select id=\"tx-type\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\"><option value=\"income\">\\u6536\\u5165</option><option value=\"expense\">\\u652f\\u51fa</option></select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u5206\\u7c7b <input id=\"tx-category\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"\\u5982: \\u670d\\u52a1\\u8d39\\u3001\\u529e\\u516c\\u8d39...\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u91d1\\u989d (\\u5143) <input id=\"tx-amount\" type=\"number\" min=\"0\" step=\"0.01\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" value=\"0\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u63cf\\u8ff0 <input id=\"tx-desc\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u5bf9\\u65b9 <input id=\"tx-counterparty\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u4ea4\\u6613\\u65e5\\u671f <input id=\"tx-date\" type=\"date\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px\" value=\"'+today+'\"></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\\u53d6\\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveTransaction(\\''+companyId+'\\')\">' + '\\u4fdd\\u5b58' + '</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);}"
  + "\nfunction saveTransaction(companyId){"
  + "var data={company_id:companyId,type:document.getElementById('tx-type').value,category:document.getElementById('tx-category').value,amount:parseFloat(document.getElementById('tx-amount').value)||0,description:document.getElementById('tx-desc').value,counterparty:document.getElementById('tx-counterparty').value,transaction_date:document.getElementById('tx-date').value};"
  + "fetch('/opc/admin/api/transactions/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\\u4ea4\\u6613\\u5df2\\u65b0\\u589e');showCompany(companyId);}"
  + "else{showToast(d.message||d.error||'\\u65b0\\u589e\\u5931\\u8d25');}}).catch(function(){showToast('\\u8bf7\\u6c42\\u5931\\u8d25');});}"
  // ── editCompany (内联编辑) ──
  + "\nfunction editCompany(id,name,industry,ownerName,ownerContact,desc,capital,status){"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:480px;max-width:96vw;max-height:90vh;overflow-y:auto\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\\u7f16\\u8f91\\u516c\\u53f8\\u4fe1\\u606f</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u516c\\u53f8\\u540d\\u79f0 <input id=\"ef-name\" class=\"search-bar\" style=\"width:100%;padding:8px 12px;margin-top:4px\" value=\"'+esc(name)+'\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u884c\\u4e1a <input id=\"ef-industry\" class=\"search-bar\" style=\"width:100%;padding:8px 12px;margin-top:4px\" value=\"'+esc(industry)+'\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u8d1f\\u8d23\\u4eba <input id=\"ef-owner\" class=\"search-bar\" style=\"width:100%;padding:8px 12px;margin-top:4px\" value=\"'+esc(ownerName)+'\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u8054\\u7cfb\\u65b9\\u5f0f <input id=\"ef-contact\" class=\"search-bar\" style=\"width:100%;padding:8px 12px;margin-top:4px\" value=\"'+esc(ownerContact)+'\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u6ce8\\u518c\\u8d44\\u672c (\\u5143) <input id=\"ef-capital\" class=\"search-bar\" style=\"width:100%;padding:8px 12px;margin-top:4px\" type=\"number\" value=\"'+esc(capital)+'\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u516c\\u53f8\\u72b6\\u6001';"
  + "html+='<select id=\"ef-status\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\">';"
  + "var statusOpts=[['pending','\\u5f85\\u6ce8\\u518c'],['active','\\u8fd0\\u8425\\u4e2d'],['suspended','\\u5df2\\u6682\\u505c'],['terminated','\\u5df2\\u6ce8\\u9500'],['acquired','\\u5df2\\u6536\\u8d2d']];"
  + "statusOpts.forEach(function(o){html+='<option value=\"'+o[0]+'\"'+(status===o[0]?' selected':'')+'>'+o[1]+'</option>';});"
  + "html+='</select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u516c\\u53f8\\u7b80\\u4ecb <textarea id=\"ef-desc\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px;resize:vertical;min-height:72px\">'+esc(desc)+'</textarea></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\\u53d6\\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveCompany(\\''+id+'\\')\">' + '\\u4fdd\\u5b58' + '</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);}"
  + "\nfunction saveCompany(id){"
  + "var data={name:document.getElementById('ef-name').value,industry:document.getElementById('ef-industry').value,"
  + "owner_name:document.getElementById('ef-owner').value,owner_contact:document.getElementById('ef-contact').value,"
  + "description:document.getElementById('ef-desc').value,registered_capital:parseFloat(document.getElementById('ef-capital').value)||0,"
  + "status:document.getElementById('ef-status').value};"
  + "fetch('/opc/admin/api/companies/'+encodeURIComponent(id)+'/edit',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){"
  + "if(d.ok){document.getElementById('edit-modal').remove();showToast('\\u4fdd\\u5b58\\u6210\\u529f');loadCompanyDetail(id);}"
  + "else{showToast(d.message||d.error||'\\u4fdd\\u5b58\\u5931\\u8d25');}}).catch(function(){showToast('\\u64cd\\u4f5c\\u5931\\u8d25');});}"
  // ── loadGuide (SOP) ──
  + "\nfunction loadGuide(){var el=document.getElementById('guide-content');if(!el)return;el.innerHTML=renderSopGuide();}"
  + getGuideJs()
  // ── loadConfig (tools) ──
  + "\nfunction loadConfig(){fetch('/opc/admin/api/config').then(function(r){return r.json()}).then(function(data){toolConfig=data;renderTools();}).catch(function(){toolConfig={};renderTools();});}"
  + "\nfunction renderTools(){"
  + "var list=document.getElementById('tool-list');"
  + "var h='<div class=\"tool-grid\">';"
  + "TOOLS.forEach(function(t){"
  + "var enabled=toolConfig[t.key]!=='disabled';"
  + "var prompt_=toolConfig[t.key+'_prompt']||'';"
  + "var pri=toolConfig[t.key+'_priority']||'normal';"
  + "var notes=toolConfig[t.key+'_notes']||'';"
  + "h+='<div class=\"tool-card'+(enabled?'':' disabled')+'\" id=\"tcard-'+esc(t.key)+'\">';"
  // header
  + "h+='<div class=\"tool-card-header\"><div><div class=\"name\">'+esc(t.label)+'</div><div class=\"key\">'+esc(t.key)+'</div></div><label class=\"toggle\"><input type=\"checkbox\" '+(enabled?'checked':'')+' onchange=\"toggleTool(\\''+esc(t.key)+'\\',this.checked)\"><span class=\"slider\"></span></label></div>';"
  // body
  + "h+='<div class=\"tool-card-body\"><div class=\"desc\">'+esc(t.desc)+'</div>';"
  + "h+='<div class=\"field\"><label>\\u4f18\\u5148\\u7ea7</label><select id=\"pri-'+esc(t.key)+'\" onchange=\"saveToolField(\\''+esc(t.key)+'\\',\\'priority\\',this.value)\"><option value=\"high\"'+(pri==='high'?' selected':'')+'>\\u9ad8 - \\u4f18\\u5148\\u8c03\\u7528</option><option value=\"normal\"'+(pri==='normal'?' selected':'')+'>\\u6b63\\u5e38</option><option value=\"low\"'+(pri==='low'?' selected':'')+'>\\u4f4e - \\u6309\\u9700\\u8c03\\u7528</option></select></div>';"
  + "h+='<button class=\"tool-expand-btn\" onclick=\"toggleToolSettings(\\''+esc(t.key)+'\\')\">' + '\\u2699 \\u9ad8\\u7ea7\\u914d\\u7f6e' + '</button>';"
  + "h+='</div>';"
  // expandable settings
  + "h+='<div class=\"tool-settings\" id=\"tsettings-'+esc(t.key)+'\">';"
  + "h+='<div class=\"field\"><label>\\u81ea\\u5b9a\\u4e49\\u63d0\\u793a\\u8bcd (System Prompt)</label><textarea id=\"prompt-'+esc(t.key)+'\" placeholder=\"\\u8f93\\u5165\\u81ea\\u5b9a\\u4e49\\u6307\\u4ee4\\uff0c\\u5f71\\u54cd\\u8be5\\u5de5\\u5177\\u7684\\u884c\\u4e3a\\u65b9\\u5f0f...\" onblur=\"saveToolField(\\''+esc(t.key)+'\\',\\'prompt\\',this.value)\">'+esc(prompt_)+'</textarea></div>';"
  + "h+='<div class=\"field\"><label>\\u5907\\u6ce8</label><input type=\"text\" id=\"notes-'+esc(t.key)+'\" placeholder=\"\\u5185\\u90e8\\u5907\\u6ce8\\uff0c\\u4ec5\\u7ba1\\u7406\\u5458\\u53ef\\u89c1...\" value=\"'+esc(notes)+'\" onblur=\"saveToolField(\\''+esc(t.key)+'\\',\\'notes\\',this.value)\"/></div>';"
  + "h+='</div>';"
  // footer
  + "h+='<div class=\"tool-card-footer\"><span style=\"font-size:12px;color:var(--tx2)\">\\u4f18\\u5148\\u7ea7: '+(pri==='high'?'\\u9ad8':pri==='low'?'\\u4f4e':'\\u6b63\\u5e38')+'</span><span class=\"badge '+(enabled?'badge-active':'badge-other')+'\">'+(enabled?'\\u5df2\\u542f\\u7528':'\\u5df2\\u7981\\u7528')+'</span></div>';"
  + "h+='</div>';});"
  + "h+='</div>';"
  + "list.innerHTML=h;"
  + "}"
  + "\nfunction toggleTool(key,enabled){toolConfig[key]=enabled?'enabled':'disabled';saveConfig(function(){showToast((enabled?'\\u5df2\\u542f\\u7528':'\\u5df2\\u7981\\u7528')+' '+key);renderTools();});}"
  + "\nfunction saveToolField(key,field,value){toolConfig[key+'_'+field]=value;saveConfig(function(){showToast('\\u5df2\\u4fdd\\u5b58 '+key+' '+field);});}"
  + "\nfunction toggleToolSettings(key){var el=document.getElementById('tsettings-'+key);if(el)el.classList.toggle('open');}"
  + "\nfunction saveConfig(cb){fetch('/opc/admin/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(toolConfig)}).then(function(){if(cb)cb();}).catch(function(){showToast('\\u4fdd\\u5b58\\u5931\\u8d25');});}"
  + getSkillsJs();
}

function getSkillsJs(): string {
  return ""
  // ── Skills 管理 ──
  + "\nvar _installedSkillsCache={builtin:[],custom:[]};"
  + "\nvar skillCreateTab='wizard';"
  + "\nfunction loadSkills(){"
  + "var el=document.getElementById('skills-content');if(!el)return;"
  + "el.innerHTML='<div class=\"skeleton\" style=\"height:200px\"></div>';"
  + "Promise.all(["
  + "fetch('/opc/admin/api/skills/installed').then(function(r){return r.json()}).catch(function(){return {builtin:[],custom:[]}}),"
  + "fetch('/opc/admin/api/companies').then(function(r){return r.json()}).catch(function(){return []}),"
  + "]).then(function(results){"
  + "var installed=results[0];var companies=results[1];"
  + "_installedSkillsCache=installed;"
  + "renderSkillsView(el,installed,companies);"
  + "});}"
  + "\nfunction renderSkillsView(el,installed,companies){"
  + "var h='';"
  // Card 1: installed skills
  + "h+='<div class=\"card\" style=\"margin-bottom:16px\">';"
  + "h+='<div class=\"card-header\" style=\"display:flex;justify-content:space-between;align-items:center\"><h3 style=\"margin:0\">\u5df2\u5b89\u88c5 Skills</h3><button class=\"btn\" onclick=\"loadSkills()\">\u5237\u65b0</button></div>';"
  + "h+='<div class=\"card-body\">';"
  + "if(installed.builtin&&installed.builtin.length){"
  + "h+='<p style=\"font-size:12px;font-weight:600;color:var(--tx2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em\">\u5185\u7f6e Skills</p>';"
  + "h+='<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;margin-bottom:16px\">';"
  + "installed.builtin.forEach(function(sk){"
  + "var shortDesc=sk.desc?sk.desc.substring(0,55)+(sk.desc.length>55?'...':''):'';var emoji=sk.emoji||'\ud83d\udccc';"
  + "h+='<div class=\"skill-card\"><div class=\"skill-card-emoji\">'+emoji+'</div><div class=\"skill-card-info\"><div class=\"skill-card-name\">'+esc(sk.name)+'</div>'+(shortDesc?'<div class=\"skill-card-desc\" title=\"'+esc(sk.desc||'')+'\">'+esc(shortDesc)+'</div>':'')+'</div><span class=\"skill-badge badge-builtin\">\u5185\u7f6e</span></div>';"
  + "});"
  + "h+='</div>';}"
  + "if(installed.custom&&installed.custom.length){"
  + "h+='<p style=\"font-size:12px;font-weight:600;color:var(--tx2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em\">\u81ea\u5b9a\u4e49 Skills</p>';"
  + "h+='<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;margin-bottom:16px\">';"
  + "installed.custom.forEach(function(sk){"
  + "var shortDesc=sk.desc?sk.desc.substring(0,55)+(sk.desc.length>55?'...':''):'';var emoji=sk.emoji||'\u2728';"
  + "h+='<div class=\"skill-card\"><div class=\"skill-card-emoji\">'+emoji+'</div><div class=\"skill-card-info\"><div class=\"skill-card-name\">'+esc(sk.name)+'</div>'+(shortDesc?'<div class=\"skill-card-desc\" title=\"'+esc(sk.desc||'')+'\">'+esc(shortDesc)+'</div>':'')+'</div><span class=\"skill-badge badge-custom\">\u81ea\u5b9a\u4e49</span><button class=\"btn\" style=\"margin-left:8px;padding:2px 8px;color:#dc2626;border-color:#fca5a5;font-size:12px;flex-shrink:0\" onclick=\"deleteCustomSkill(\\''+esc(sk.name)+'\\')\">&#10005;</button></div>';"
  + "});"
  + "h+='</div>';}"
  + "if((!installed.builtin||!installed.builtin.length)&&(!installed.custom||!installed.custom.length)){"
  + "h+='<p style=\"color:var(--tx2);font-size:13px\">\u6682\u65e0\u5df2\u5b89\u88c5 Skills</p>';}"
  + "h+='</div></div>';"
  // Card 2: company skills config
  + "h+='<div class=\"card\" style=\"margin-bottom:16px\">';"
  + "h+='<div class=\"card-header\"><h3 style=\"margin:0\">\u516c\u53f8 Skills \u914d\u7f6e</h3></div>';"
  + "h+='<div class=\"card-body\">';"
  + "h+='<p style=\"color:var(--tx2);font-size:13px;margin-bottom:16px\">\u4e3a\u6bcf\u5bb6\u516c\u53f8\u914d\u7f6e\u5176 Agent \u53ef\u7528\u7684 Skills\uff0c\u5f71\u54cd Agent \u53ef\u7528\u5de5\u5177\u548c\u4e0a\u4e0b\u6587\u3002</p>';"
  + "h+='<div style=\"display:flex;gap:8px;align-items:center;margin-bottom:12px\"><select id=\"skills-company-select\" style=\"flex:1;padding:8px 12px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\" onchange=\"loadCompanySkills()\"><option value=\"\">\u8bf7\u9009\u62e9\u516c\u53f8...</option>';"
  + "companies.forEach(function(c){h+='<option value=\"'+esc(c.id)+'\">'+esc(c.name)+' ('+esc(c.status)+')</option>';});"
  + "h+='</select></div>';"
  + "h+='<div id=\"skills-checkboxes\" style=\"display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px\"></div>';"
  + "h+='<div style=\"display:flex;gap:8px\"><button class=\"btn btn-pri\" onclick=\"saveCompanySkills()\">\u4fdd\u5b58 Skills</button><span id=\"skills-status\" style=\"font-size:12px;color:var(--tx2);align-self:center\"></span></div>';"
  + "h+='</div></div>';"
  // Card 3: GitHub install
  + "h+='<div class=\"card\" style=\"margin-bottom:16px\">';"
  + "h+='<div class=\"card-header\"><h3 style=\"margin:0\">\u4ece GitHub \u5b89\u88c5</h3></div>';"
  + "h+='<div class=\"card-body\">';"
  + "h+='<p style=\"color:var(--tx2);font-size:13px;margin-bottom:16px\">\u8f93\u5165 GitHub \u4ed3\u5e93\u5730\u5740\uff08\u683c\u5f0f\uff1auser/repo\uff09\uff0c\u5c06 Skill \u5b89\u88c5\u5230 ~/.openclaw/custom-skills/\u3002</p>';"
  + "h+='<div style=\"display:flex;gap:8px;margin-bottom:12px\"><input id=\"github-repo-input\" type=\"text\" class=\"form-input\" placeholder=\"user/repo \u6216 https://github.com/user/repo\" style=\"flex:1\"><button class=\"btn btn-pri\" onclick=\"installGithubSkill()\">\u5b89\u88c5</button></div>';"
  + "h+='<div id=\"github-install-status\" style=\"font-size:13px;color:var(--tx2)\"></div>';"
  + "h+='</div></div>';"
  // Card 4: create custom skill
  + "h+='<div class=\"card\">';"
  + "h+='<div class=\"card-header\"><h3 style=\"margin:0\">\u521b\u5efa\u81ea\u5b9a\u4e49 Skill</h3></div>';"
  + "h+='<div class=\"card-body\">';"
  + "h+='<div class=\"tab-bar\"><button id=\"tab-wizard\" class=\"active\" onclick=\"switchSkillTab(\\'wizard\\')\"> \u5411\u5bfc\u6a21\u5f0f</button><button id=\"tab-markdown\" onclick=\"switchSkillTab(\\'markdown\\')\"> Markdown \u7f16\u8f91</button></div>';"
  // Wizard form
  + "h+='<div id=\"skill-form-wizard\">';"
  + "h+='<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px\">';"
  + "h+='<div><label style=\"font-size:12px;font-weight:600;color:var(--tx2);display:block;margin-bottom:4px\">Skill \u540d\u79f0 (a-z0-9-)</label><input id=\"skill-name-input\" class=\"form-input\" placeholder=\"my-skill\" type=\"text\" style=\"width:100%\"></div>';"
  + "h+='<div><label style=\"font-size:12px;font-weight:600;color:var(--tx2);display:block;margin-bottom:4px\">Emoji \u56fe\u6807</label><input id=\"skill-emoji-input\" class=\"form-input\" placeholder=\"\u2728\" type=\"text\" style=\"width:100%\"></div>';"
  + "h+='</div>';"
  + "h+='<div style=\"margin-bottom:12px\"><label style=\"font-size:12px;font-weight:600;color:var(--tx2);display:block;margin-bottom:4px\">\u63cf\u8ff0</label><input id=\"skill-desc-input\" class=\"form-input\" placeholder=\"\u8be5 Skill \u7684\u529f\u80fd\u63cf\u8ff0\" type=\"text\" style=\"width:100%\"></div>';"
  + "h+='<div style=\"margin-bottom:16px\"><label style=\"font-size:12px;font-weight:600;color:var(--tx2);display:block;margin-bottom:4px\">Skill \u5185\u5bb9\uff08\u63d0\u793a\u8bcd / \u6307\u5bfc\u8bed\uff09</label><textarea id=\"skill-content-input\" class=\"form-input\" rows=\"5\" placeholder=\"\u5199\u51fa\u8be5 Skill \u7684\u5177\u4f53\u6307\u5bfc\u5185\u5bb9...\" style=\"width:100%;resize:vertical\"></textarea></div>';"
  + "h+='</div>';"
  // Markdown editor
  + "h+='<div id=\"skill-form-markdown\" style=\"display:none\">';"
  + "h+='<p style=\"color:var(--tx2);font-size:13px;margin-bottom:8px\">\u76f4\u63a5\u8f93\u5165\u5b8c\u6574\u7684 SKILL.md \u5185\u5bb9\uff0c\u9996\u884c\u5fc5\u987b\u4e3a <code>name: your-skill-name</code>\u3002</p>';"
  + "h+='<textarea id=\"skill-raw-input\" class=\"form-input\" rows=\"10\" placeholder=\"name: my-skill\\ndescription: \\u63cf\\u8ff0\\n\\n# \\u6307\\u5bfc\\u5185\\u5bb9...\" style=\"width:100%;resize:vertical;font-family:monospace;font-size:13px\"></textarea>';"
  + "h+='</div>';"
  + "h+='<div style=\"display:flex;gap:8px;align-items:center\"><button class=\"btn btn-pri\" onclick=\"createSkill()\">\u521b\u5efa Skill</button><span id=\"skill-create-status\" style=\"font-size:12px;color:var(--tx2)\"></span></div>';"
  + "h+='</div></div>';"
  + "el.innerHTML=h;}"
  + "\nfunction switchSkillTab(tab){"
  + "skillCreateTab=tab;"
  + "document.getElementById('tab-wizard').className=tab==='wizard'?'active':'';"
  + "document.getElementById('tab-markdown').className=tab==='markdown'?'active':'';"
  + "document.getElementById('skill-form-wizard').style.display=tab==='wizard'?'block':'none';"
  + "document.getElementById('skill-form-markdown').style.display=tab==='markdown'?'block':'none';}"
  + "\nfunction loadCompanySkills(){"
  + "var sel=document.getElementById('skills-company-select');if(!sel)return;"
  + "var companyId=sel.value;if(!companyId){document.getElementById('skills-checkboxes').innerHTML='';return;}"
  + "fetch('/opc/admin/api/company-skills?company_id='+encodeURIComponent(companyId)).then(function(r){return r.json()}).then(function(d){"
  + "var enabled=d.skills||[];"
  + "var allSkills=(_installedSkillsCache.builtin||[]).concat(_installedSkillsCache.custom||[]).map(function(m){return m.name;});"
  + "if(!allSkills.length)allSkills=enabled.length?enabled:[];"
  + "var box=document.getElementById('skills-checkboxes');if(!box)return;"
  + "box.innerHTML='';"
  + "allSkills.forEach(function(sk){"
  + "var checked=enabled.indexOf(sk)>-1;"
  + "var label=document.createElement('label');"
  + "label.style.cssText='display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid var(--bd);border-radius:6px;font-size:13px;cursor:pointer;background:'+(checked?'#f0fdf4':'var(--card)')+';border-color:'+(checked?'#86efac':'var(--bd)')+';';"
  + "label.innerHTML='<input type=\"checkbox\" value=\"'+esc(sk)+'\"'+(checked?' checked':'')+' style=\"margin:0\" onchange=\"updateSkillLabel(this)\"> '+esc(sk);"
  + "box.appendChild(label);"
  + "});"
  + "document.getElementById('skills-status').textContent='\u5df2\u52a0\u8f7d '+enabled.length+' \u4e2a skills';"
  + "}).catch(function(e){document.getElementById('skills-status').textContent='\u52a0\u8f7d\u5931\u8d25: '+String(e);});}"
  + "\nfunction updateSkillLabel(input){"
  + "var label=input.closest('label');if(!label)return;"
  + "if(input.checked){label.style.background='#f0fdf4';label.style.borderColor='#86efac';}"
  + "else{label.style.background='var(--card)';label.style.borderColor='var(--bd)';}}"
  + "\nfunction saveCompanySkills(){"
  + "var sel=document.getElementById('skills-company-select');if(!sel)return;"
  + "var companyId=sel.value;if(!companyId){showToast('\u8bf7\u5148\u9009\u62e9\u516c\u53f8');return;}"
  + "var checks=document.querySelectorAll('#skills-checkboxes input[type=checkbox]');"
  + "var skills=[];checks.forEach(function(cb){if(cb.checked)skills.push(cb.value);});"
  + "fetch('/opc/admin/api/company-skills',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({company_id:companyId,skills:skills})})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){showToast('Skills \u5df2\u4fdd\u5b58 ('+skills.length+' \u4e2a)');document.getElementById('skills-status').textContent='\u5df2\u4fdd\u5b58 '+skills.length+' \u4e2a skills';}"
  + "else{showToast(d.error||'\u4fdd\u5b58\u5931\u8d25');}}).catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});}"
  + "\nfunction installGithubSkill(){"
  + "var repo=document.getElementById('github-repo-input').value.trim();"
  + "if(!repo){showToast('\u8bf7\u8f93\u5165\u4ed3\u5e93\u5730\u5740');return;}"
  + "var statusEl=document.getElementById('github-install-status');"
  + "statusEl.textContent='\u5b89\u88c5\u4e2d...';"
  + "fetch('/opc/admin/api/skills/github-install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repo:repo})})"
  + ".then(function(r){return r.json()}).then(function(d){"
  + "if(d.ok){statusEl.style.color='#166534';statusEl.textContent=d.message||'\u5b89\u88c5\u6210\u529f\uff01';document.getElementById('github-repo-input').value='';loadSkills();}"
  + "else{statusEl.style.color='#dc2626';statusEl.textContent='\u5b89\u88c5\u5931\u8d25: '+(d.error||'\u672a\u77e5\u9519\u8bef');}}"
  + ").catch(function(e){statusEl.style.color='#dc2626';statusEl.textContent='\u8bf7\u6c42\u5f02\u5e38: '+String(e);});}"
  + "\nfunction createSkill(){"
  + "var statusEl=document.getElementById('skill-create-status');"
  + "var body;"
  + "if(skillCreateTab==='wizard'){"
  + "var name=document.getElementById('skill-name-input').value.trim();"
  + "var emoji=document.getElementById('skill-emoji-input').value.trim();"
  + "var desc=document.getElementById('skill-desc-input').value.trim();"
  + "var content=document.getElementById('skill-content-input').value.trim();"
  + "if(!name){showToast('\u8bf7\u8f93\u5165 Skill \u540d\u79f0');return;}"
  + "body={name:name,description:desc,emoji:emoji,content:content};"
  + "}else{"
  + "var raw=document.getElementById('skill-raw-input').value.trim();"
  + "if(!raw){showToast('\u8bf7\u8f93\u5165 Skill \u5185\u5bb9');return;}"
  + "var nameMatch=raw.match(/^name:\\s*([\\w-]+)/m);"
  + "if(!nameMatch){showToast('\u5185\u5bb9\u5fc5\u987b\u5305\u542b name: \u5b57\u6bb5');return;}"
  + "body={name:nameMatch[1],raw:raw};"
  + "}"
  + "statusEl.textContent='\u521b\u5efa\u4e2d...';"
  + "fetch('/opc/admin/api/skills/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})"
  + ".then(function(r){return r.json()}).then(function(d){"
  + "if(d.ok){statusEl.style.color='#166534';statusEl.textContent='\u521b\u5efa\u6210\u529f\uff01';loadSkills();}"
  + "else{statusEl.style.color='#dc2626';statusEl.textContent='\u5931\u8d25: '+(d.error||'\u672a\u77e5\u9519\u8bef');}}"
  + ").catch(function(e){statusEl.style.color='#dc2626';statusEl.textContent='\u8bf7\u6c42\u5f02\u5e38: '+String(e);});}"
  + "\nfunction deleteCustomSkill(name){"
  + "if(!confirm('\u786e\u5b9a\u8981\u5220\u9664 Skill \"'+name+'\" \u5417\uff1f\u6b64\u64cd\u4f5c\u4e0d\u53ef\u8fd8\u539f\u3002'))return;"
  + "fetch('/opc/admin/api/skills/custom/'+encodeURIComponent(name),{method:'DELETE'})"
  + ".then(function(r){return r.json()}).then(function(d){"
  + "if(d.ok){showToast('Skill \u5df2\u5220\u9664');loadSkills();}"
  + "else{showToast('\u5220\u9664\u5931\u8d25: '+(d.error||'\u672a\u77e5\u9519\u8bef'));}})"
  + ".catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});}"
  // ── hash routing ──
  + "\nfunction handleHash(){var hash=window.location.hash.replace('#','');if(!hash||hash==='dashboard'){showView('dashboard');return;}if(hash==='companies'){showView('companies');return;}if(hash==='finance'){showView('finance');return;}if(hash==='monitoring'){showView('monitoring');return;}if(hash==='tools'){showView('tools');return;}if(hash==='closure'){showView('closure');loadClosure();return;}if(hash==='guide'){showView('guide');return;}if(hash==='canvas'){showView('canvas');return;}if(hash==='feishu'){showView('feishu');return;}if(hash.indexOf('company/')===0){var cid=hash.slice(8);showCompany(cid);return;}showView('dashboard');}"
  + getFeishuJs()
  + getClosureJs();
}

function getFeishuJs(): string {
  return ""
  + "\nfunction loadFeishu(){"
  + "var el=document.getElementById('feishu-content');"
  + "el.innerHTML='<div class=\"skeleton\" style=\"height:200px\"></div>';"
  + "Promise.all(["
  + "  fetch('/opc/admin/api/feishu/status').then(function(r){return r.json()}),"
  + "  fetch('/opc/admin/api/feishu/pairing').then(function(r){return r.json()})"
  + "]).then(function(results){"
  + "var status=results[0];var pairing=results[1];"
  + "renderFeishuPage(status,pairing);"
  + "}).catch(function(err){el.innerHTML='<div class=\"card\"><div class=\"card-body\"><p style=\"color:var(--err)\">\\u52a0\\u8f7d\\u5931\\u8d25: '+err.message+'</p></div></div>';});}"

  // renderFeishuPage
  + "\nfunction renderFeishuPage(status,pairing){"
  + "var el=document.getElementById('feishu-content');"
  + "var h='';"
  + "var dmLabels={'pairing':'\\u9700\\u8981\\u914d\\u5bf9\\u624d\\u80fd\\u79c1\\u804a','open':'\\u4efb\\u4f55\\u4eba\\u90fd\\u53ef\\u4ee5\\u79c1\\u804a'};"

  // 1. Feishu section header
  + "h+='<h2 class=\"ch-section-title\">';"
  + "h+='<svg width=\"20\" height=\"20\" viewBox=\"0 0 20 20\" fill=\"none\"><path d=\"M3 10.5C5 6 8 3.5 11 3c-1.2 2.5-1.5 5-.5 8L14.5 16l-5-2C6.5 15.5 3.5 14 3 10.5z\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\"/></svg>';"
  + "h+='\\u98de\\u4e66</h2>';"

  // 2. Connection status card
  + "h+='<div class=\"card\">';"
  + "h+='<h3>\\u8fde\\u63a5\\u72b6\\u6001</h3>';"
  + "if(status.configured){"
  + "h+='<div class=\"ch-status-row\">';"
  + "h+='<span class=\"ch-status-dot\" style=\"background:'+(status.enabled?'var(--ok)':'var(--err)') +'\"></span>';"
  + "h+='<strong>'+(status.enabled?'\\u5df2\\u8fde\\u63a5':'\\u5df2\\u914d\\u7f6e\\uff0c\\u7b49\\u5f85\\u91cd\\u542f\\u540e\\u751f\\u6548')+'</strong></div>';"
  + "h+='<div class=\"ch-info-grid\">';"
  + "h+='<div class=\"ch-info-item\"><div class=\"ch-info-label\">\\u5e94\\u7528 ID</div><div class=\"ch-info-value\"><code>'+esc(status.appId)+'</code></div></div>';"
  + "h+='<div class=\"ch-info-item\"><div class=\"ch-info-label\">\\u673a\\u5668\\u4eba\\u540d\\u79f0</div><div class=\"ch-info-value\">'+esc(status.botName)+'</div></div>';"
  + "h+='<div class=\"ch-info-item\"><div class=\"ch-info-label\">\\u79c1\\u804a\\u6743\\u9650</div><div class=\"ch-info-value\">'+(dmLabels[status.dmPolicy]||esc(status.dmPolicy))+'</div></div>';"
  + "h+='<div class=\"ch-info-item\"><div class=\"ch-info-label\">\\u6d41\\u5f0f\\u56de\\u590d</div><div class=\"ch-info-value\">'+(status.streaming?'\\u5df2\\u5f00\\u542f':'\\u5df2\\u5173\\u95ed')+'</div></div>';"
  + "h+='</div>';"
  + "}else{"
  + "h+='<div class=\"ch-status-row\">';"
  + "h+='<span class=\"ch-status-dot\" style=\"background:var(--tx3)\"></span>';"
  + "h+='<strong>\\u672a\\u914d\\u7f6e</strong></div>';"

  // ── Detailed step-by-step guide for non-technical users ──
  + "h+='<div class=\"ch-guide-box\">';"
  + "h+='<p style=\"font-weight:600;font-size:14px;margin-bottom:14px\">\\u6309\\u4ee5\\u4e0b\\u6b65\\u9aa4\\u914d\\u7f6e\\u98de\\u4e66\\u673a\\u5668\\u4eba\\uff0c\\u5b8c\\u6210\\u540e\\u4f60\\u5c31\\u53ef\\u4ee5\\u5728\\u98de\\u4e66\\u4e2d\\u76f4\\u63a5\\u548c AI \\u52a9\\u624b\\u5bf9\\u8bdd\\u3001\\u7ba1\\u7406\\u516c\\u53f8\\uff1a</p>';"
  + "h+='<ol>';"

  // Step 1
  + "h+='<li><strong>\\u6253\\u5f00\\u98de\\u4e66\\u5f00\\u653e\\u5e73\\u53f0</strong><br>';"
  + "h+='\\u7528\\u6d4f\\u89c8\\u5668\\u8bbf\\u95ee <a href=\"https://open.feishu.cn\" target=\"_blank\" style=\"color:var(--pri);font-weight:500\">open.feishu.cn</a>\\uff0c\\u767b\\u5f55\\u4f60\\u7684\\u98de\\u4e66\\u8d26\\u53f7\\u3002';"
  + "h+='<span class=\"step-hint\">\\u63d0\\u793a\\uff1a\\u5982\\u679c\\u4f60\\u7684\\u98de\\u4e66\\u662f\\u4e2a\\u4eba\\u7248\\uff0c\\u53ef\\u4ee5\\u76f4\\u63a5\\u4f7f\\u7528\\uff1b\\u4f01\\u4e1a\\u7248\\u9700\\u8981\\u7ba1\\u7406\\u5458\\u6743\\u9650\\u3002</span></li>';"

  // Step 2
  + "h+='<li><strong>\\u521b\\u5efa\\u5e94\\u7528</strong><br>';"
  + "h+='\\u767b\\u5f55\\u540e\\u70b9\\u51fb\\u9875\\u9762\\u4e2d\\u95f4\\u7684\\u300c<strong>\\u521b\\u5efa\\u81ea\\u5efa\\u5e94\\u7528</strong>\\u300d\\u6309\\u94ae\\u3002';"
  + "h+='<br>\\u586b\\u5199\\u5e94\\u7528\\u540d\\u79f0\\uff08\\u6bd4\\u5982\\u300c\\u661f\\u73afOPC\\u52a9\\u624b\\u300d\\uff09\\uff0c\\u63cf\\u8ff0\\u53ef\\u4ee5\\u968f\\u4fbf\\u586b\\uff0c\\u7136\\u540e\\u70b9\\u300c\\u521b\\u5efa\\u300d\\u3002</li>';"

  // Step 3
  + "h+='<li><strong>\\u590d\\u5236 App ID \\u548c App Secret</strong><br>';"
  + "h+='\\u521b\\u5efa\\u5b8c\\u6210\\u540e\\u4f1a\\u8fdb\\u5165\\u5e94\\u7528\\u7684\\u7ba1\\u7406\\u9875\\u9762\\u3002';"
  + "h+='<br>\\u5728\\u5de6\\u4fa7\\u83dc\\u5355\\u627e\\u5230\\u300c<strong>\\u51ed\\u8bc1\\u4e0e\\u57fa\\u7840\\u4fe1\\u606f</strong>\\u300d\\uff0c\\u4f60\\u4f1a\\u770b\\u5230 <strong>App ID</strong> \\u548c <strong>App Secret</strong>\\u3002';"
  + "h+='<br>\\u70b9\\u51fb\\u590d\\u5236\\u6309\\u94ae\\uff0c\\u628a\\u5b83\\u4eec\\u7c98\\u8d34\\u5230\\u4e0b\\u65b9\\u7684\\u8868\\u5355\\u4e2d\\u3002';"
  + "h+='<span class=\"step-hint\">App Secret \\u70b9\\u51fb\\u300c\\u663e\\u793a\\u300d\\u540e\\u624d\\u80fd\\u590d\\u5236\\uff0c\\u5982\\u679c\\u770b\\u4e0d\\u5230\\u8bf7\\u70b9\\u300c\\u91cd\\u7f6e\\u300d\\u751f\\u6210\\u65b0\\u7684\\u3002</span></li>';"

  // Step 4
  + "h+='<li><strong>\\u5f00\\u542f\\u673a\\u5668\\u4eba\\u80fd\\u529b</strong><br>';"
  + "h+='\\u5728\\u5de6\\u4fa7\\u83dc\\u5355\\u627e\\u5230\\u300c<strong>\\u6dfb\\u52a0\\u5e94\\u7528\\u80fd\\u529b</strong>\\u300d\\uff0c\\u627e\\u5230\\u300c<strong>\\u673a\\u5668\\u4eba</strong>\\u300d\\uff0c\\u70b9\\u51fb\\u300c\\u5f00\\u542f\\u300d\\u3002';"
  + "h+='<span class=\"step-hint\">\\u8fd9\\u6837\\u4f60\\u7684\\u5e94\\u7528\\u624d\\u80fd\\u5728\\u98de\\u4e66\\u4e2d\\u63a5\\u6536\\u548c\\u53d1\\u9001\\u6d88\\u606f\\u3002</span></li>';"

  // Step 5
  + "h+='<li><strong>\\u914d\\u7f6e\\u4e8b\\u4ef6\\u8ba2\\u9605\\uff08\\u63a5\\u6536\\u7528\\u6237\\u6d88\\u606f\\uff09</strong><br>';"
  + "h+='\\u5728\\u5de6\\u4fa7\\u83dc\\u5355\\u627e\\u5230\\u300c<strong>\\u4e8b\\u4ef6\\u4e0e\\u56de\\u8c03</strong>\\u300d\\u3002';"
  + "h+='<br>\\u5728\\u300c\\u4e8b\\u4ef6\\u8ba2\\u9605\\u300d\\u680f\\u70b9\\u300c<strong>\\u6dfb\\u52a0\\u4e8b\\u4ef6</strong>\\u300d\\uff0c\\u641c\\u7d22\\u5e76\\u6dfb\\u52a0\\uff1a<code>im.message.receive_v1</code>';"
  + "h+='<br>\\u5728\\u4e0a\\u65b9\\u7684\\u300c\\u8bf7\\u6c42\\u5730\\u5740\\u300d\\u586b\\u5165\\u4e8b\\u4ef6\\u56de\\u8c03\\u5730\\u5740\\uff08\\u542f\\u52a8 OpenClaw \\u65f6\\u63a7\\u5236\\u53f0\\u4f1a\\u6253\\u5370\\u8fd9\\u4e2a\\u5730\\u5740\\uff0c\\u683c\\u5f0f\\u7c7b\\u4f3c\\uff1a<code>https://xxx.xxx/feishu/event</code>\\uff09\\u3002';"
  + "h+='<span class=\"step-hint\">\\u5982\\u679c\\u8fd8\\u6ca1\\u542f\\u52a8 OpenClaw\\uff0c\\u53ef\\u4ee5\\u5148\\u8df3\\u8fc7\\u8fd9\\u6b65\\uff0c\\u5148\\u586b\\u5199\\u4e0b\\u65b9\\u8868\\u5355\\u4fdd\\u5b58\\uff0c\\u4e0b\\u6b21\\u542f\\u52a8\\u65f6\\u4f1a\\u663e\\u793a\\u5730\\u5740\\u3002</span></li>';"

  // Step 6
  + "h+='<li><strong>\\u914d\\u7f6e\\u6743\\u9650</strong><br>';"
  + "h+='\\u5728\\u5de6\\u4fa7\\u83dc\\u5355\\u627e\\u5230\\u300c<strong>\\u6743\\u9650\\u7ba1\\u7406</strong>\\u300d\\uff0c\\u70b9\\u300c<strong>\\u5f00\\u901a\\u6743\\u9650</strong>\\u300d\\uff0c\\u641c\\u7d22\\u5e76\\u6dfb\\u52a0\\u4ee5\\u4e0b\\u6743\\u9650\\uff1a';"
  + "h+='<br><code>im:message</code>\\uff08\\u83b7\\u53d6\\u4e0e\\u53d1\\u9001\\u6d88\\u606f\\uff09';"
  + "h+='<br><code>im:message:send_as_bot</code>\\uff08\\u4ee5\\u673a\\u5668\\u4eba\\u8eab\\u4efd\\u53d1\\u6d88\\u606f\\uff09';"
  + "h+='<span class=\"step-hint\">\\u6dfb\\u52a0\\u540e\\u70b9\\u300c\\u6279\\u91cf\\u5f00\\u901a\\u300d\\uff0c\\u4f01\\u4e1a\\u7248\\u53ef\\u80fd\\u9700\\u7ba1\\u7406\\u5458\\u5ba1\\u6279\\u3002</span></li>';"

  // Step 7
  + "h+='<li><strong>\\u53d1\\u5e03\\u5e94\\u7528</strong><br>';"
  + "h+='\\u5728\\u5de6\\u4fa7\\u83dc\\u5355\\u627e\\u5230\\u300c<strong>\\u5e94\\u7528\\u53d1\\u5e03</strong>\\u300d\\uff0c\\u70b9\\u300c<strong>\\u521b\\u5efa\\u7248\\u672c</strong>\\u300d\\uff0c\\u586b\\u5199\\u7248\\u672c\\u53f7\\uff08\\u5982 1.0.0\\uff09\\u548c\\u66f4\\u65b0\\u8bf4\\u660e\\uff0c\\u70b9\\u300c\\u4fdd\\u5b58\\u300d\\u3002';"
  + "h+='<br>\\u7136\\u540e\\u70b9\\u300c\\u7533\\u8bf7\\u53d1\\u5e03\\u300d\\u3002\\u4e2a\\u4eba\\u7248\\u76f4\\u63a5\\u751f\\u6548\\uff0c\\u4f01\\u4e1a\\u7248\\u9700\\u7ba1\\u7406\\u5458\\u5ba1\\u6838\\u3002';"
  + "h+='<span class=\"step-hint\">\\u53d1\\u5e03\\u540e\\uff0c\\u5728\\u98de\\u4e66\\u641c\\u7d22\\u4f60\\u7684\\u673a\\u5668\\u4eba\\u540d\\u79f0\\u5c31\\u80fd\\u627e\\u5230\\u5b83\\uff0c\\u53d1\\u6d88\\u606f\\u5c31\\u80fd\\u548c AI \\u52a9\\u624b\\u5bf9\\u8bdd\\u4e86\\u3002</span></li>';"

  // Step 8
  + "h+='<li><strong>\\u586b\\u5199\\u4e0b\\u65b9\\u8868\\u5355\\u5e76\\u4fdd\\u5b58</strong><br>';"
  + "h+='\\u628a\\u590d\\u5236\\u7684 App ID \\u548c App Secret \\u586b\\u5165\\u4e0b\\u65b9\\u7684\\u300c\\u98de\\u4e66\\u5e94\\u7528\\u914d\\u7f6e\\u300d\\u8868\\u5355\\uff0c\\u70b9\\u300c\\u4fdd\\u5b58\\u914d\\u7f6e\\u300d\\u5373\\u53ef\\u3002</li>';"

  + "h+='</ol></div>';"
  + "}"
  + "h+='</div>';"

  // 3. Configuration form card
  + "h+='<div class=\"card\">';"
  + "h+='<h3>\\u98de\\u4e66\\u5e94\\u7528\\u914d\\u7f6e</h3>';"
  + "h+='<div class=\"ch-form\">';"
  + "h+='<div class=\"ch-field\"><label>App ID <span class=\"hint\">\\u5728\\u98de\\u4e66\\u5f00\\u653e\\u5e73\\u53f0\\u300c\\u51ed\\u8bc1\\u4e0e\\u57fa\\u7840\\u4fe1\\u606f\\u300d\\u4e2d\\u590d\\u5236</span></label><input id=\"feishu-app-id\" type=\"text\" placeholder=\"cli_xxxxxxxxxx\"></div>';"
  + "h+='<div class=\"ch-field\"><label>App Secret <span class=\"hint\">\\u540c\\u4e0a\\uff0c\\u70b9\\u300c\\u663e\\u793a\\u300d\\u540e\\u590d\\u5236</span></label><input id=\"feishu-app-secret\" type=\"password\" placeholder=\"\\u70b9\\u51fb\\u8f93\\u5165\"></div>';"
  + "h+='<div class=\"ch-field\"><label>\\u673a\\u5668\\u4eba\\u540d\\u79f0 <span class=\"hint\">\\u663e\\u793a\\u5728\\u98de\\u4e66\\u804a\\u5929\\u4e2d\\u7684\\u540d\\u5b57</span></label><input id=\"feishu-bot-name\" type=\"text\" value=\"\\u661f\\u73afOPC\\u52a9\\u624b\"></div>';"
  + "h+='<div class=\"ch-field\"><label>\\u79c1\\u804a\\u6743\\u9650 <span class=\"hint\">\\u8c01\\u53ef\\u4ee5\\u548c\\u673a\\u5668\\u4eba\\u79c1\\u804a</span></label><select id=\"feishu-dm-policy\"><option value=\"pairing\">\\u9700\\u8981\\u914d\\u5bf9\\uff08\\u4ec5\\u5141\\u8bb8\\u7ecf\\u8fc7\\u5ba1\\u6279\\u7684\\u7528\\u6237\\u79c1\\u804a\\uff0c\\u66f4\\u5b89\\u5168\\uff09</option><option value=\"open\">\\u5f00\\u653e\\uff08\\u4efb\\u4f55\\u4eba\\u90fd\\u53ef\\u4ee5\\u76f4\\u63a5\\u548c\\u673a\\u5668\\u4eba\\u5bf9\\u8bdd\\uff09</option></select></div>';"
  + "h+='<div><button class=\"btn btn-pri\" onclick=\"saveFeishuConfig()\" style=\"padding:10px 28px;font-size:14px;border-radius:8px\">\\u4fdd\\u5b58\\u914d\\u7f6e</button></div>';"
  + "h+='</div></div>';"

  // 4. Pairing management card (only for dmPolicy=pairing)
  + "if(status.dmPolicy==='pairing'){"
  + "h+='<div class=\"card\">';"
  + "h+='<h3>\\u914d\\u5bf9\\u7ba1\\u7406</h3>';"
  + "h+='<p style=\"color:var(--tx2);font-size:12px;margin-bottom:16px\">\\u79c1\\u804a\\u6743\\u9650\\u4e3a\\u300c\\u9700\\u8981\\u914d\\u5bf9\\u300d\\u65f6\\uff0c\\u7528\\u6237\\u9996\\u6b21\\u7ed9\\u673a\\u5668\\u4eba\\u53d1\\u6d88\\u606f\\u4f1a\\u8fdb\\u5165\\u5f85\\u5ba1\\u6279\\u5217\\u8868\\uff0c\\u4f60\\u5728\\u6b64\\u5904\\u6279\\u51c6\\u540e\\u624d\\u80fd\\u5bf9\\u8bdd\\u3002</p>';"
  + "if(pairing&&(pairing.approved&&pairing.approved.length>0||pairing.pending&&pairing.pending.length>0)){"
  + "if(pairing.approved&&pairing.approved.length>0){"
  + "h+='<p style=\"font-weight:600;margin-bottom:8px\">\\u5df2\\u6279\\u51c6\\u7684\\u7528\\u6237</p>';"
  + "h+='<table style=\"margin-bottom:16px\"><thead><tr><th>\\u7528\\u6237 ID</th><th>\\u5907\\u6ce8</th></tr></thead><tbody>';"
  + "pairing.approved.forEach(function(u){h+='<tr><td><code>'+esc(u.openId)+'</code></td><td>'+esc(u.note||'--')+'</td></tr>';});"
  + "h+='</tbody></table>';}"
  + "if(pairing.pending&&pairing.pending.length>0){"
  + "h+='<p style=\"font-weight:600;margin-bottom:8px\">\\u5f85\\u5ba1\\u6279</p>';"
  + "h+='<table><thead><tr><th>\\u7528\\u6237 ID</th><th>\\u64cd\\u4f5c</th></tr></thead><tbody>';"
  + "pairing.pending.forEach(function(u){h+='<tr><td><code>'+esc(u.openId)+'</code></td><td><button class=\"btn btn-pri btn-sm\" onclick=\"approveFeishuPairing(\\''+esc(u.openId)+'\\',true)\">\\u6279\\u51c6</button> <button class=\"btn btn-sm\" onclick=\"approveFeishuPairing(\\''+esc(u.openId)+'\\',false)\">\\u62d2\\u7edd</button></td></tr>';});"
  + "h+='</tbody></table>';}"
  + "}else{"
  + "h+='<p style=\"color:var(--tx2)\">\\u6682\\u65e0\\u914d\\u5bf9\\u8bb0\\u5f55\\u3002\\u7528\\u6237\\u7ed9\\u673a\\u5668\\u4eba\\u53d1\\u6d88\\u606f\\u540e\\u4f1a\\u81ea\\u52a8\\u51fa\\u73b0\\u5728\\u6b64\\u5904\\u3002</p>';"
  + "}"
  + "h+='</div>';}"

  // 5. Future channels placeholder
  + "h+='<div class=\"ch-future\">';"
  + "h+='<h2>\\u66f4\\u591a\\u9891\\u9053</h2>';"
  + "h+='<p>\\u5fae\\u4fe1\\u3001\\u9489\\u9489\\u3001Telegram \\u7b49\\u9891\\u9053\\u5373\\u5c06\\u652f\\u6301\\uff0c\\u656c\\u8bf7\\u671f\\u5f85\\u3002</p>';"
  + "h+='</div>';"

  // Populate form with existing values
  + "if(status.configured){"
  + "var appIdInput=document.getElementById('feishu-app-id');"
  + "if(appIdInput)appIdInput.placeholder='\\u5df2\\u914d\\u7f6e ('+status.appId+')';"
  + "var botInput=document.getElementById('feishu-bot-name');"
  + "if(botInput&&status.botName)botInput.value=status.botName;"
  + "var policySelect=document.getElementById('feishu-dm-policy');"
  + "if(policySelect)policySelect.value=status.dmPolicy||'pairing';"
  + "}"

  + "el.innerHTML=h;}"

  // saveFeishuConfig
  + "\nfunction saveFeishuConfig(){"
  + "var appId=document.getElementById('feishu-app-id').value.trim();"
  + "var appSecret=document.getElementById('feishu-app-secret').value.trim();"
  + "var botName=document.getElementById('feishu-bot-name').value.trim();"
  + "var dmPolicy=document.getElementById('feishu-dm-policy').value;"
  + "if(!appId&&!appSecret){showToast('\\u8bf7\\u586b\\u5199 App ID \\u548c App Secret');return;}"
  + "fetch('/opc/admin/api/feishu/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appId:appId,appSecret:appSecret,botName:botName,dmPolicy:dmPolicy})})"
  + ".then(function(r){return r.json()}).then(function(d){"
  + "if(d.ok){showToast(d.message||'\\u914d\\u7f6e\\u5df2\\u4fdd\\u5b58');setTimeout(function(){loadFeishu();},1000);}"
  + "else{showToast('\\u4fdd\\u5b58\\u5931\\u8d25: '+(d.error||''));}"
  + "}).catch(function(){showToast('\\u8bf7\\u6c42\\u5931\\u8d25');});}"

  // approveFeishuPairing
  + "\nfunction approveFeishuPairing(openId,approve){"
  + "fetch('/opc/admin/api/feishu/pairing/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({openId:openId,approve:approve})})"
  + ".then(function(r){return r.json()}).then(function(d){"
  + "if(d.ok){showToast(approve?'\\u5df2\\u6279\\u51c6':'\\u5df2\\u62d2\\u7edd');loadFeishu();}"
  + "else{showToast('\\u64cd\\u4f5c\\u5931\\u8d25: '+(d.error||''));}"
  + "}).catch(function(){showToast('\\u8bf7\\u6c42\\u5931\\u8d25');});}";
}

function getClosureJs(): string {
  return ""
  + "\nfunction loadClosure(){"
  + "var el=document.getElementById('closure-content');"
  + "el.innerHTML='<div class=\"skeleton\" style=\"height:200px\"></div>';"
  + "Promise.all(["
  + "  fetch('/opc/admin/api/closure/summary').then(function(r){return r.json()}),"
  + "  fetch('/opc/admin/api/closure/acquisitions').then(function(r){return r.json()}),"
  + "  fetch('/opc/admin/api/closure/packages').then(function(r){return r.json()}),"
  + "  fetch('/opc/admin/api/closure/transfers').then(function(r){return r.json()})"
  + "]).then(function(results){"
  + "var summary=results[0];var acqs=results[1];var pkgs=results[2];var transfers=results[3];"
  + "var h='';"
  // 资金闭环模型图（顶部）
  + "h+='<div class=\"card\" style=\"margin-bottom:20px;background:linear-gradient(135deg,#f0f7ff 0%,#f5f3ff 100%);border-color:#c7d2fe\">';"
  + "h+='<div class=\"card-body\">';"
  + "h+='<div style=\"font-size:12px;font-weight:700;color:#4338ca;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:14px\">\\u661f\\u73af OPC \\u8d44\\u91d1\\u95ed\\u73af\\u6a21\\u578b</div>';"
  + "var loopSteps=['\\u6295\\u8d44\\u53c2\\u80a1|\\u57ce\\u6295\\u516c\\u53f8\\u53c2\\u8d44\\u5b54\\u5316\\u4f01\\u4e1a|\\u5165\\u8d44','\\u670d\\u52a1\\u91c7\\u8d2d|\\u4f01\\u4e1a\\u5411\\u5e73\\u53f0\\u91c7\\u8d2d\\u63d0\\u5347\\u670d\\u52a1|\\u91c7\\u8d2d','\\u8d44\\u91d1\\u56de\\u6d41|\\u670d\\u52a1\\u8d39\\u6536\\u5165\\u56de\\u6d41\\u5e73\\u53f0|\\u56de\\u6d41','\\u8d44\\u4ea7\\u8f6c\\u8ba9|\\u6253\\u5305\\u4f18\\u8d28\\u8d44\\u4ea7\\u8f6c\\u8ba9\\u57ce\\u6295|\\u8f6c\\u8ba9','\\u878d\\u8d44\\u670d\\u52a1\\u8d39|\\u57ce\\u6295\\u878d\\u8d44\\u6536\\u53d6\\u670d\\u52a1\\u8d39\\u7528|\\u8d39\\u7528'];"
  + "var loopColors=['#2563eb','#7c3aed','#0891b2','#059669','#d97706'];"
  + "var loopBg=['#eff6ff','#f5f3ff','#ecfeff','#ecfdf5','#fffbeb'];"
  + "var loopBd=['#bfdbfe','#ddd6fe','#a5f3fc','#6ee7b7','#fde68a'];"
  + "function mkLoopCard(i){var s=loopSteps[i];var parts=s.split('|');return '<div style=\"background:'+loopBg[i]+';border:1px solid '+loopBd[i]+';border-radius:10px;padding:14px 12px;box-sizing:border-box;height:120px;display:flex;flex-direction:column;gap:3px\"><div style=\"font-size:11px;font-weight:800;color:'+loopColors[i]+';opacity:0.4\">'+(i+1)+'</div><div style=\"font-size:13px;font-weight:700;color:'+loopColors[i]+'\">'+parts[0]+'</div><div style=\"font-size:11px;color:#475569;line-height:1.5;flex:1\">'+parts[1]+'</div><div style=\"font-size:10px;font-weight:700;color:'+loopColors[i]+';background:white;padding:2px 6px;border-radius:4px;width:fit-content\">'+parts[2]+'</div></div>';}"
  + "var loopArrow='<div style=\"display:flex;align-items:center;justify-content:center;padding:0 8px;color:#94a3b8\"><svg width=\"18\" height=\"18\" viewBox=\"0 0 18 18\" fill=\"none\"><path d=\"M5 9h8M10 6l3 3-3 3\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg></div>';"
  // Single row: all 5 steps
  + "h+='<div style=\"display:flex;align-items:center;gap:0\">';"
  + "for(var li=0;li<loopSteps.length;li++){h+=mkLoopCard(li);if(li<loopSteps.length-1)h+=loopArrow;}"
  + "h+='</div>';"
  + "h+='</div></div>';"
  // 汇总卡片
  + "h+='<div class=\"stats-grid\" style=\"grid-template-columns:repeat(4,1fr);margin-bottom:24px\">';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\u6536\u5e76\u8d2d\u6848\u4f8b</div><div class=\"value\">'+summary.total_acquisitions+'</div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\u8d44\u4ea7\u5305\u6570\u91cf</div><div class=\"value\">'+summary.total_packages+'</div></div>';"
  + "h+='<div class=\"stat-card\"><div class=\"label\">\u57ce\u6295\u8f6c\u8ba9\u603b\u989d</div><div class=\"value\">\xA5'+fmt(summary.total_transfer_price)+'</div></div>';"
  + "h+='<div class=\"stat-card\" style=\"border-left:4px solid var(--accent,#0ea5e9)\"><div class=\"label\">\u878d\u8d44\u670d\u52a1\u8d39\u6536\u5165</div><div class=\"value\" style=\"color:var(--accent,#0ea5e9)\">\xA5'+fmt(summary.total_financing_fee)+'</div></div>';"
  + "h+='</div>';"
  // 收并购列表
  + "h+='<div class=\"card\"><div class=\"card-header\" style=\"display:flex;justify-content:space-between;align-items:center\"><h3 style=\"margin:0\">\u6536\u5e76\u8d2d\u6848\u4f8b</h3><button class=\"btn btn-pri\" onclick=\"createAcquisition()\">' + '+ \u65b0\u5efa\u6536\u5e76\u8d2d' + '</button></div><div class=\"card-body\">';"
  + "if(acqs.length===0){h+='<p style=\"color:var(--tx2)\">\u6682\u65e0\u6536\u5e76\u8d2d\u8bb0\u5f55</p>';}"
  + "else{"
  + "h+='<table class=\"data-table\"><thead><tr><th>\u516c\u53f8</th><th>\u89e6\u53d1\u539f\u56e0</th><th>\u6536\u8d2d\u4ef7\u683c</th><th>\u4e8f\u635f\u91d1\u989d</th><th>\u7a0e\u52a1\u6293\u9664</th><th>\u72b6\u6001</th></tr></thead><tbody>';"
  + "acqs.forEach(function(a){"
  + "var statusMap={'evaluating':'\u8bc4\u4f30\u4e2d','in_progress':'\u8fdb\u884c\u4e2d','completed':'\u5df2\u5b8c\u6210','cancelled':'\u5df2\u53d6\u6d88'};"
  + "h+='<tr><td>'+esc(a.company_name||a.company_id)+'</td><td>'+esc(a.trigger_reason)+'</td><td>\xA5'+fmt(a.acquisition_price)+'</td><td>\xA5'+fmt(a.loss_amount)+'</td><td>\xA5'+fmt(a.tax_deduction)+'</td><td>'+esc(statusMap[a.status]||a.status)+'</td></tr>';"
  + "});"
  + "h+='</tbody></table>';}"
  + "h+='</div></div>';"
  // 资产包列表
  + "h+='<div class=\"card\" style=\"margin-top:16px\"><div class=\"card-header\" style=\"display:flex;justify-content:space-between;align-items:center\"><h3 style=\"margin:0\">\u8d44\u4ea7\u5305</h3><button class=\"btn btn-pri\" onclick=\"createAssetPackage()\">' + '+ \u65b0\u5efa\u8d44\u4ea7\u5305' + '</button></div><div class=\"card-body\">';"
  + "if(pkgs.length===0){h+='<p style=\"color:var(--tx2)\">\u6682\u65e0\u8d44\u4ea7\u5305</p>';}"
  + "else{"
  + "h+='<table class=\"data-table\"><thead><tr><th>\u540d\u79f0</th><th>\u5305\u542b\u516c\u53f8\u6570</th><th>\u79d1\u521b\u8ba4\u5b9a\u6570</th><th>\u603b\u4f30\u503c</th><th>\u72b6\u6001</th></tr></thead><tbody>';"
  + "pkgs.forEach(function(p){"
  + "var statusMap={'assembling':'\u6253\u5305\u4e2d','ready':'\u5df2\u5c31\u7eea','transferred':'\u5df2\u8f6c\u8ba9','closed':'\u5df2\u5173\u95ed'};"
  + "h+='<tr><td>'+esc(p.name)+'</td><td>'+p.company_count+'</td><td>'+p.sci_tech_certified+'</td><td>\xA5'+fmt(p.total_valuation)+'</td><td>'+esc(statusMap[p.status]||p.status)+'</td></tr>';"
  + "});"
  + "h+='</tbody></table>';}"
  + "h+='</div></div>';"
  // 城投转让列表
  + "h+='<div class=\"card\" style=\"margin-top:16px\"><div class=\"card-header\" style=\"display:flex;justify-content:space-between;align-items:center\"><h3 style=\"margin:0\">\u57ce\u6295\u8f6c\u8ba9\u4e0e\u79d1\u521b\u8d37</h3><button class=\"btn btn-pri\" onclick=\"createCtTransfer()\">' + '+ \u65b0\u5efa\u8f6c\u8ba9' + '</button></div><div class=\"card-body\">';"
  + "if(transfers.length===0){h+='<p style=\"color:var(--tx2)\">\u6682\u65e0\u8f6c\u8ba9\u8bb0\u5f55</p>';}"
  + "else{"
  + "h+='<table class=\"data-table\"><thead><tr><th>\u8d44\u4ea7\u5305</th><th>\u57ce\u6295\u516c\u53f8</th><th>\u8f6c\u8ba9\u4ef7\u683c</th><th>\u76ee\u6807\u79d1\u521b\u8d37</th><th>\u5b9e\u9645\u79d1\u521b\u8d37</th><th>\u72b6\u6001</th></tr></thead><tbody>';"
  + "transfers.forEach(function(t){"
  + "var statusMap={'negotiating':'\u6d3d\u8c08\u4e2d','signed':'\u5df2\u7b7e\u7ea6','completed':'\u5df2\u5b8c\u6210','cancelled':'\u5df2\u53d6\u6d88'};"
  + "h+='<tr><td>'+esc(t.package_name||t.package_id)+'</td><td>'+esc(t.ct_company)+'</td><td>\xA5'+fmt(t.transfer_price)+'</td><td>\xA5'+fmt(t.sci_loan_target)+'</td><td>\xA5'+fmt(t.sci_loan_actual)+'</td><td>'+esc(statusMap[t.status]||t.status)+'</td></tr>';"
  + "});"
  + "h+='</tbody></table>';}"
  + "h+='</div></div>';"
  + "el.innerHTML=h;"
  + "}).catch(function(){el.innerHTML='<p style=\"color:var(--err)\">\u52a0\u8f7d\u5931\u8d25</p>';});}"
  // ── 资金闭环 CREATE 函数 ──
  + "\nfunction createAcquisition(){"
  + "fetch('/opc/admin/api/companies?limit=200').then(function(r){return r.json()}).then(function(companies){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var opts=companies.map(function(c){return '<option value=\"'+esc(c.id)+'\">'+esc(c.name)+'</option>';}).join('');"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:520px;max-width:96vw;max-height:90vh;overflow-y:auto\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\u65b0\u5efa\u6536\u5e76\u8d2d</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u76ee\u6807\u516c\u53f8 <select id=\"acq-cid\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\"><option value=\"\">\u8bf7\u9009\u62e9...</option>'+opts+'</select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u89e6\u53d1\u539f\u56e0 <input id=\"acq-reason\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"\u5982\uff1a\u8fde\u7eed\u4e8f\u635f\u3001\u5e02\u573a\u8d4f\u7f29\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u6536\u8d2d\u4ef7\u683c (\u5143) <input id=\"acq-price\" type=\"number\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u7d2f\u8ba1\u4e8f\u635f (\u5143) <input id=\"acq-loss\" type=\"number\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5907\u6ce8 <input id=\"acq-notes\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\u53d6\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveAcquisition()\">\u521b\u5efa</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);"
  + "}).catch(function(){showToast('\u52a0\u8f7d\u5931\u8d25');});}"
  + "\nfunction saveAcquisition(){"
  + "var data={company_id:document.getElementById('acq-cid').value,trigger_reason:document.getElementById('acq-reason').value,acquisition_price:Number(document.getElementById('acq-price').value)||0,loss_amount:Number(document.getElementById('acq-loss').value)||0,notes:document.getElementById('acq-notes').value};"
  + "if(!data.company_id){showToast('\u8bf7\u9009\u62e9\u76ee\u6807\u516c\u53f8');return;}"
  + "if(!data.trigger_reason){showToast('\u8bf7\u586b\u5199\u89e6\u53d1\u539f\u56e0');return;}"
  + "fetch('/opc/admin/api/closure/acquisitions/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\u6536\u5e76\u8d2d\u5df2\u521b\u5efa');loadClosure();}"
  + "else{showToast(d.error||'\u521b\u5efa\u5931\u8d25');}}).catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});}"
  // createAssetPackage
  + "\nfunction createAssetPackage(){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:480px;max-width:96vw\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\u65b0\u5efa\u8d44\u4ea7\u5305</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u8d44\u4ea7\u5305\u540d\u79f0 <input id=\"pkg-name\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"\u5982\uff1a\u4ed1\u548c\u533a2026Q1\u79d1\u521b\u8d44\u4ea7\u5305\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u8d44\u4ea7\u5305\u63cf\u8ff0 <textarea id=\"pkg-desc\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px;resize:vertical;min-height:80px\"></textarea></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5907\u6ce8 <input id=\"pkg-notes\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\u53d6\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveAssetPackage()\">\u521b\u5efa</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);}"
  + "\nfunction saveAssetPackage(){"
  + "var data={name:document.getElementById('pkg-name').value,description:document.getElementById('pkg-desc').value,notes:document.getElementById('pkg-notes').value};"
  + "if(!data.name){showToast('\u8bf7\u586b\u5199\u8d44\u4ea7\u5305\u540d\u79f0');return;}"
  + "fetch('/opc/admin/api/closure/packages/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\u8d44\u4ea7\u5305\u5df2\u521b\u5efa');loadClosure();}"
  + "else{showToast(d.error||'\u521b\u5efa\u5931\u8d25');}}).catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});}"
  // createCtTransfer
  + "\nfunction createCtTransfer(){"
  + "fetch('/opc/admin/api/closure/packages').then(function(r){return r.json()}).then(function(pkgs){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var opts=pkgs.filter(function(p){return p.status!=='closed';}).map(function(p){return '<option value=\"'+esc(p.id)+'\">'+esc(p.name)+'</option>';}).join('');"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:520px;max-width:96vw;max-height:90vh;overflow-y:auto\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\u65b0\u5efa\u57ce\u6295\u8f6c\u8ba9</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u8d44\u4ea7\u5305 <select id=\"ctt-pkg\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\"><option value=\"\">\u8bf7\u9009\u62e9...</option>'+opts+'</select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u57ce\u6295\u516c\u53f8\u540d\u79f0 <input id=\"ctt-name\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"\u5982\uff1a\u4ed1\u548c\u5de5\u53d1\u96c6\u56e2\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u8f6c\u8ba9\u4ef7\u683c (\u5143) <input id=\"ctt-price\" type=\"number\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u76ee\u6807\u79d1\u521b\u8d37 (\u5143) <input id=\"ctt-loan\" type=\"number\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u8f6c\u8ba9\u65e5\u671f <input id=\"ctt-date\" type=\"date\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5907\u6ce8 <input id=\"ctt-notes\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\u53d6\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveCtTransfer()\">\u521b\u5efa</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);"
  + "}).catch(function(){showToast('\u52a0\u8f7d\u5931\u8d25');});}"
  + "\nfunction saveCtTransfer(){"
  + "var data={package_id:document.getElementById('ctt-pkg').value,ct_company:document.getElementById('ctt-name').value,transfer_price:Number(document.getElementById('ctt-price').value)||0,sci_loan_target:Number(document.getElementById('ctt-loan').value)||0,transfer_date:document.getElementById('ctt-date').value,notes:document.getElementById('ctt-notes').value};"
  + "if(!data.package_id){showToast('\u8bf7\u9009\u62e9\u8d44\u4ea7\u5305');return;}"
  + "if(!data.ct_company){showToast('\u8bf7\u586b\u5199\u57ce\u6295\u516c\u53f8\u540d\u79f0');return;}"
  + "fetch('/opc/admin/api/closure/transfers/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\u57ce\u6295\u8f6c\u8ba9\u5df2\u521b\u5efa');loadClosure();}"
  + "else{showToast(d.error||'\u521b\u5efa\u5931\u8d25');}}).catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});}"
  // ── 融资 CREATE 函数 ──
  + "\nfunction createInvestRound(companyId){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:520px;max-width:96vw;max-height:90vh;overflow-y:auto\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\u65b0\u5efa\u878d\u8d44\u8f6e\u6b21</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u8f6e\u6b21\u540d\u79f0 <input id=\"ir-name\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"\u5982\uff1a\u5929\u4f7f\u8f6e\u3001A\u8f6e\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u878d\u8d44\u91d1\u989d (\u5143) <input id=\"ir-amount\" type=\"number\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u6295\u524d\u4f30\u503c (\u5143) <input id=\"ir-pre\" type=\"number\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u6295\u540e\u4f30\u503c (\u5143) <input id=\"ir-post\" type=\"number\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u9886\u6295\u65b9 <input id=\"ir-lead\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5173\u95ed\u65e5\u671f <input id=\"ir-date\" type=\"date\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5907\u6ce8 <input id=\"ir-notes\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\u53d6\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveInvestRound(\\''+companyId+'\\')\">\u521b\u5efa</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);}"
  + "\nfunction saveInvestRound(companyId){"
  + "var data={company_id:companyId,round_name:document.getElementById('ir-name').value,amount:Number(document.getElementById('ir-amount').value)||0,valuation_pre:Number(document.getElementById('ir-pre').value)||0,valuation_post:Number(document.getElementById('ir-post').value)||0,lead_investor:document.getElementById('ir-lead').value,close_date:document.getElementById('ir-date').value,notes:document.getElementById('ir-notes').value};"
  + "if(!data.round_name){showToast('\u8bf7\u586b\u5199\u8f6e\u6b21\u540d\u79f0');return;}"
  + "fetch('/opc/admin/api/investment/rounds/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\u878d\u8d44\u8f6e\u6b21\u5df2\u521b\u5efa');showCompany(companyId);}"
  + "else{showToast(d.error||'\u521b\u5efa\u5931\u8d25');}}).catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});}"
  + "\nfunction addInvestor(companyId){"
  + "fetch('/opc/admin/api/investment/rounds?company_id='+encodeURIComponent(companyId)).then(function(r){return r.json()}).then(function(rounds){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var opts=rounds.map(function(r){return '<option value=\"'+esc(r.id)+'\">'+esc(r.round_name)+'</option>';}).join('');"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:520px;max-width:96vw;max-height:90vh;overflow-y:auto\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\u65b0\u589e\u6295\u8d44\u4eba</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5173\u8054\u878d\u8d44\u8f6e\u6b21 <select id=\"inv-round\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\"><option value=\"\">\u8bf7\u9009\u62e9...</option>'+opts+'</select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u6295\u8d44\u4eba\u540d\u79f0 <input id=\"inv-name\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u7c7b\u578b <select id=\"inv-type\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\"><option value=\"individual\">\u4e2a\u4eba</option><option value=\"institution\">\u673a\u6784</option><option value=\"government\">\u653f\u5e9c</option><option value=\"other\">\u5176\u4ed6</option></select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u6295\u8d44\u91d1\u989d (\u5143) <input id=\"inv-amount\" type=\"number\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u80a1\u6743\u5360\u6bd4 (%) <input id=\"inv-equity\" type=\"number\" step=\"0.01\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0.00\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u8054\u7cfb\u65b9\u5f0f <input id=\"inv-contact\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\u53d6\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveInvestor(\\''+companyId+'\\')\">\u6dfb\u52a0</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);"
  + "}).catch(function(){showToast('\u52a0\u8f7d\u5931\u8d25');});}"
  + "\nfunction saveInvestor(companyId){"
  + "var data={company_id:companyId,round_id:document.getElementById('inv-round').value,name:document.getElementById('inv-name').value,type:document.getElementById('inv-type').value,amount:Number(document.getElementById('inv-amount').value)||0,equity_percent:Number(document.getElementById('inv-equity').value)||0,contact:document.getElementById('inv-contact').value};"
  + "if(!data.name){showToast('\u8bf7\u586b\u5199\u6295\u8d44\u4eba\u540d\u79f0');return;}"
  + "fetch('/opc/admin/api/investment/investors/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\u6295\u8d44\u4eba\u5df2\u6dfb\u52a0');showCompany(companyId);}"
  + "else{showToast(d.error||'\u6dfb\u52a0\u5931\u8d25');}}).catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});}"
  // ── 生命周期 CREATE 函数 ──
  + "\nfunction addMilestone(companyId){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var today=new Date().toISOString().slice(0,10);"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:480px;max-width:96vw\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\u6dfb\u52a0\u91cc\u7a0b\u7891</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u6807\u9898 <input id=\"ms-title\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5206\u7c7b <select id=\"ms-cat\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\"><option value=\"business\">\u5546\u4e1a</option><option value=\"legal\">\u6cd5\u52a1</option><option value=\"technical\">\u6280\u672f</option><option value=\"financial\">\u8d22\u52a1</option><option value=\"hr\">\u4eba\u529b</option><option value=\"other\">\u5176\u4ed6</option></select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u76ee\u6807\u65e5\u671f <input id=\"ms-date\" type=\"date\" value=\"'+today+'\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u63cf\u8ff0 <textarea id=\"ms-desc\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px;resize:vertical;min-height:60px\"></textarea></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\u53d6\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveMilestone(\\''+companyId+'\\')\">\u6dfb\u52a0</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);}"
  + "\nfunction saveMilestone(companyId){"
  + "var data={company_id:companyId,title:document.getElementById('ms-title').value,category:document.getElementById('ms-cat').value,target_date:document.getElementById('ms-date').value,description:document.getElementById('ms-desc').value};"
  + "if(!data.title){showToast('\u8bf7\u586b\u5199\u6807\u9898');return;}"
  + "fetch('/opc/admin/api/lifecycle/milestones/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\u91cc\u7a0b\u7891\u5df2\u6dfb\u52a0');showCompany(companyId);}"
  + "else{showToast(d.error||'\u6dfb\u52a0\u5931\u8d25');}}).catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});}"
  + "\nfunction addLifecycleEvent(companyId){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var today=new Date().toISOString().slice(0,10);"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:480px;max-width:96vw\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\u6dfb\u52a0\u4e8b\u4ef6</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u6807\u9898 <input id=\"ev-title\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u4e8b\u4ef6\u7c7b\u578b <select id=\"ev-type\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\"><option value=\"founding\">\u521b\u7acb</option><option value=\"product\">\u4ea7\u54c1</option><option value=\"partnership\">\u5408\u4f5c</option><option value=\"legal\">\u6cd5\u52a1</option><option value=\"financial\">\u8d22\u52a1</option><option value=\"team\">\u56e2\u961f</option><option value=\"market\">\u5e02\u573a</option><option value=\"other\">\u5176\u4ed6</option></select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u4e8b\u4ef6\u65e5\u671f <input id=\"ev-date\" type=\"date\" value=\"'+today+'\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5f71\u54cd\u8bc4\u4f30 <input id=\"ev-impact\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"\u5982\uff1a\u6d88\u6781/\u79ef\u6781\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u63cf\u8ff0 <textarea id=\"ev-desc\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px;resize:vertical;min-height:60px\"></textarea></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\u53d6\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveLifecycleEvent(\\''+companyId+'\\')\">\u6dfb\u52a0</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);}"
  + "\nfunction saveLifecycleEvent(companyId){"
  + "var data={company_id:companyId,title:document.getElementById('ev-title').value,event_type:document.getElementById('ev-type').value,event_date:document.getElementById('ev-date').value,impact:document.getElementById('ev-impact').value,description:document.getElementById('ev-desc').value};"
  + "if(!data.title){showToast('\u8bf7\u586b\u5199\u6807\u9898');return;}"
  + "fetch('/opc/admin/api/lifecycle/events/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\u4e8b\u4ef6\u5df2\u6dfb\u52a0');showCompany(companyId);}"
  + "else{showToast(d.error||'\u6dfb\u52a0\u5931\u8d25');}}).catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});}"
  // ── 监控 recordMetric ──
  + "\nfunction recordMetric(){"
  + "fetch('/opc/admin/api/companies?limit=200').then(function(r){return r.json()}).then(function(companies){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var opts=companies.map(function(c){return '<option value=\"'+esc(c.id)+'\">'+esc(c.name)+'</option>';}).join('');"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:480px;max-width:96vw\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\u8bb0\u5f55\u6307\u6807</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u516c\u53f8 <select id=\"mt-cid\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\"><option value=\"\">\u8bf7\u9009\u62e9...</option>'+opts+'</select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u6307\u6807\u540d\u79f0 <input id=\"mt-name\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"\u5982\uff1a\u6708\u6d3b\u8dc3\u7528\u6237MAU\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u6307\u6807\u503c <input id=\"mt-value\" type=\"number\" step=\"any\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5355\u4f4d <input id=\"mt-unit\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"\u4eba/\u5143/\u4ef6...\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5206\u7c7b <input id=\"mt-cat\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"\u5982\uff1a\u7528\u6237\u589e\u957f/\u8d22\u52a1\u6307\u6807\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5907\u6ce8 <input id=\"mt-notes\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\u53d6\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveMetric()\">\u8bb0\u5f55</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);"
  + "}).catch(function(){showToast('\u52a0\u8f7d\u5931\u8d25');});}"
  + "\nfunction saveMetric(){"
  + "var data={company_id:document.getElementById('mt-cid').value,name:document.getElementById('mt-name').value,value:Number(document.getElementById('mt-value').value)||0,unit:document.getElementById('mt-unit').value,category:document.getElementById('mt-cat').value,notes:document.getElementById('mt-notes').value};"
  + "if(!data.company_id){showToast('\u8bf7\u9009\u62e9\u516c\u53f8');return;}"
  + "if(!data.name){showToast('\u8bf7\u586b\u5199\u6307\u6807\u540d\u79f0');return;}"
  + "fetch('/opc/admin/api/monitoring/metrics/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\u6307\u6807\u5df2\u8bb0\u5f55');loadMonitoring();}"
  + "else{showToast(d.error||'\u8bb0\u5f55\u5931\u8d25');}}).catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});}"
  // ── 采购订单 createOrder ──
  + "\nfunction createOrder(companyId){"
  + "fetch('/opc/admin/api/services?company_id='+encodeURIComponent(companyId)).then(function(r){return r.json()}).then(function(services){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var opts='<option value=\"\">\u65e0\u5173\u8054\u670d\u52a1</option>'+services.map(function(s){return '<option value=\"'+esc(s.id)+'\">'+esc(s.name)+'</option>';}).join('');"
  + "var today=new Date().toISOString().slice(0,10);"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:480px;max-width:96vw;max-height:90vh;overflow-y:auto\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\u65b0\u5efa\u91c7\u8d2d\u8ba2\u5355</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u8ba2\u5355\u6807\u9898 <input id=\"ord-title\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5173\u8054\u670d\u52a1 <select id=\"ord-svc\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\">'+opts+'</select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u91d1\u989d (\u5143) <input id=\"ord-amount\" type=\"number\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u4e0b\u5355\u65e5\u671f <input id=\"ord-date\" type=\"date\" value=\"'+today+'\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5907\u6ce8 <input id=\"ord-notes\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\u53d6\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveOrder(\\''+companyId+'\\')\">\u521b\u5efa</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);"
  + "}).catch(function(){"
  // fallback without services
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var today=new Date().toISOString().slice(0,10);"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:480px;max-width:96vw\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\u65b0\u5efa\u91c7\u8d2d\u8ba2\u5355</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u8ba2\u5355\u6807\u9898 <input id=\"ord-title\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u91d1\u989d (\u5143) <input id=\"ord-amount\" type=\"number\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"0\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u4e0b\u5355\u65e5\u671f <input id=\"ord-date\" type=\"date\" value=\"'+today+'\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\u5907\u6ce8 <input id=\"ord-notes\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\"></label>';"
  + "html+='</div>';"
  + "html+='<div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\u53d6\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveOrder(\\''+companyId+'\\')\">\u521b\u5efa</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);"
  + "});}"
  + "\nfunction saveOrder(companyId){"
  + "var svcEl=document.getElementById('ord-svc');"
  + "var data={company_id:companyId,title:document.getElementById('ord-title').value,service_id:svcEl?svcEl.value:'',amount:Number(document.getElementById('ord-amount').value)||0,order_date:document.getElementById('ord-date').value,notes:document.getElementById('ord-notes').value};"
  + "if(!data.title){showToast('\u8bf7\u586b\u5199\u8ba2\u5355\u6807\u9898');return;}"
  + "fetch('/opc/admin/api/procurement/orders/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\u8ba2\u5355\u5df2\u521b\u5efa');showCompany(companyId);}"
  + "else{showToast(d.error||'\u521b\u5efa\u5931\u8d25');}}).catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});}"
  + "\nfunction createMedia(companyId){"
  + "var existing=document.getElementById('edit-modal');if(existing)existing.remove();"
  + "var today=new Date().toISOString().slice(0,10);"
  + "var html='<div id=\"edit-modal\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center\">';"
  + "html+='<div style=\"background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:32px;width:560px;max-width:96vw;max-height:90vh;overflow-y:auto\">';"
  + "html+='<h2 style=\"margin:0 0 20px\">\\u65b0\\u5efa\\u5185\\u5bb9</h2>';"
  + "html+='<div style=\"display:grid;gap:12px\">';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u6807\\u9898 <input id=\"mc-title\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px\" placeholder=\"\\u5185\\u5bb9\\u6807\\u9898\"></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u5e73\\u53f0 <select id=\"mc-platform\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\"><option value=\"\\u5fae\\u4fe1\">\\u5fae\\u4fe1</option><option value=\"\\u6296\\u97f3\">\\u6296\\u97f3</option><option value=\"\\u5c0f\\u7ea2\\u4e66\">\\u5c0f\\u7ea2\\u4e66</option><option value=\"\\u5fae\\u535a\">\\u5fae\\u535a</option><option value=\"B\\u7ad9\">B\\u7ad9</option><option value=\"\\u5c0f\\u7ea2\\u4e66\">\\u5c0f\\u7ea2\\u4e66</option><option value=\"\\u5176\\u4ed6\">\\u5176\\u4ed6</option></select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u7c7b\\u578b <select id=\"mc-type\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\"><option value=\"\\u56fe\\u6587\">\\u56fe\\u6587</option><option value=\"\\u77ed\\u89c6\\u9891\">\\u77ed\\u89c6\\u9891</option><option value=\"\\u957f\\u89c6\\u9891\">\\u957f\\u89c6\\u9891</option><option value=\"\\u76f4\\u64ad\">\\u76f4\\u64ad</option><option value=\"\\u5386\\u60f3\\u52a8\\u6001\">\\u5386\\u60f3\\u52a8\\u6001</option></select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u5185\\u5bb9\\u6b63\\u6587 <textarea id=\"mc-body\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-family:var(--font);font-size:13px;resize:vertical;min-height:120px\" placeholder=\"\\u5185\\u5bb9\\u6b63\\u6587/\\u811a\\u672c\\u63cf\\u8ff0\\u2026\"></textarea></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u72b6\\u6001 <select id=\"mc-status\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--card)\"><option value=\"draft\">\\u8349\\u7a3f</option><option value=\"scheduled\">\\u5df2\\u5b89\\u6392</option><option value=\"published\">\\u5df2\\u53d1\\u5e03</option></select></label>';"
  + "html+='<label style=\"font-size:12px;font-weight:600;color:var(--tx2)\">\\u9884\\u7ea6\\u53d1\\u5e03\\u65e5\\u671f <input id=\"mc-date\" type=\"date\" style=\"width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--bd);border-radius:var(--r);font-size:13px\"></label>';"
  + "html+='</div><div style=\"display:flex;gap:8px;justify-content:flex-end;margin-top:20px\">';"
  + "html+='<button class=\"btn\" onclick=\"document.getElementById(\\'edit-modal\\').remove()\">\\u53d6\\u6d88</button>';"
  + "html+='<button class=\"btn btn-pri\" onclick=\"saveMedia(\\''+companyId+'\\')\" >\\u4fdd\\u5b58</button>';"
  + "html+='</div></div></div>';"
  + "document.body.insertAdjacentHTML('beforeend',html);}"
  + "\nfunction saveMedia(companyId){"
  + "var data={company_id:companyId,title:document.getElementById('mc-title').value,platform:document.getElementById('mc-platform').value,content_type:document.getElementById('mc-type').value,body:document.getElementById('mc-body').value,status:document.getElementById('mc-status').value,scheduled_date:document.getElementById('mc-date').value||null};"
  + "if(!data.title){showToast('\\u8bf7\\u586b\\u5199\\u5185\\u5bb9\\u6807\\u9898');return;}"
  + "fetch('/opc/admin/api/media/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){document.getElementById('edit-modal').remove();showToast('\\u5185\\u5bb9\\u5df2\\u521b\\u5efa');showCompany(companyId);}else{showToast(d.error||'\\u521b\\u5efa\\u5931\\u8d25');}}).catch(function(){showToast('\\u8bf7\\u6c42\\u5931\\u8d25');});}"
  // ── printView ──
  + "\nfunction printView(viewId){"
  + "document.querySelectorAll('.view').forEach(function(v){v.classList.remove('print-target');});"
  + "var el=document.getElementById('view-'+viewId);if(el)el.classList.add('print-target');"
  + "window.print();"
  + "if(el)el.classList.remove('print-target');}"
  + "\nfunction printContracts(){"
  + "document.querySelectorAll('.view').forEach(function(v){v.classList.remove('print-target');});"
  + "var el=document.getElementById('view-company-detail');if(el)el.classList.add('print-target');"
  + "window.print();"
  + "if(el)el.classList.remove('print-target');}"
  + "\ndocument.querySelectorAll('.sidebar-nav a').forEach(function(a){a.addEventListener('click',function(e){var v=a.getAttribute('data-view');if(v){window.location.hash=v;}});});"
  + "\nwindow.onhashchange=handleHash;"
  // init
  + "\nhandleHash();"
  + getCanvasJs();
}

function getGuideJs(): string {
  // Professional docs-style guide page with left TOC + right content
  // All Chinese text uses \uXXXX Unicode escapes
  return ""
  + "\nfunction renderSopGuide(){"
  + "var h='';"
  // ── Docs layout wrapper ──
  + "h+='<div style=\"display:flex;gap:0;min-height:100vh;position:relative\">';"
  // ── Left sticky TOC ──
  + "h+='<div id=\"guide-toc\" style=\"width:220px;flex-shrink:0;position:sticky;top:0;height:calc(100vh - 80px);overflow-y:auto;padding:24px 0 24px 0;border-right:1px solid var(--bd)\">';"
  + "h+='<div style=\"padding:0 20px 12px;font-size:11px;font-weight:700;color:var(--tx3);letter-spacing:0.08em;text-transform:uppercase\">\\u76ee\\u5f55</div>';"
  + "var tocItems=["
  + "{id:'g-bg',n:'\\u9879\\u76ee\\u80cc\\u666f'},"
  + "{id:'g-opb',n:'\\u4ec0\\u4e48\\u662f\\u4e00\\u4eba\\u4f01\\u4e1a'},"
  + "{id:'g-logic',n:'\\u4e09\\u5927\\u5e95\\u5c42\\u903b\\u8f91'},"
  + "{id:'g-track',n:'\\u8d5b\\u9053\\u9009\\u62e9'},"
  + "{id:'g-canvas',n:'OPB \\u753b\\u5e03 16 \\u6a21\\u5757'},"
  + "{id:'g-flow',n:'\\u5e73\\u53f0\\u4f7f\\u7528\\u6d41\\u7a0b'},"
  + "{id:'g-tools',n:'AI \\u5de5\\u5177\\u8bf4\\u660e'},"
  + "{id:'g-cmds',n:'\\u5e38\\u7528\\u5bf9\\u8bdd\\u6307\\u4ee4'},"
  + "{id:'g-hb',n:'Heartbeat \\u6a21\\u5f0f'}"
  + "];"
  + "tocItems.forEach(function(t){"
  + "h+='<a href=\"#'+t.id+'\" onclick=\"guideTocClick(event,\\''+t.id+'\\')\" style=\"display:block;padding:7px 20px;font-size:13px;color:var(--tx2);text-decoration:none;border-left:2px solid transparent;transition:all 0.15s;cursor:pointer\" data-toc=\"'+t.id+'\">'+t.n+'</a>';"
  + "});"
  + "h+='</div>';" // end toc
  // ── Right content area ──
  + "h+='<div style=\"flex:1;min-width:0;padding:0 48px 48px 40px;max-width:860px\">';"

  // ── Page title ──
  + "h+='<div style=\"padding:32px 0 28px;border-bottom:1px solid var(--bd);margin-bottom:36px\">';"
  + "h+='<div style=\"display:inline-flex;align-items:center;gap:8px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;margin-bottom:14px;letter-spacing:0.02em\">\\u2b50 \\u661f\\u73af OPC \\u4e2d\\u5fc3</div>';"
  + "h+='<h1 style=\"font-size:28px;font-weight:800;letter-spacing:-0.03em;color:var(--tx);margin:0 0 10px\">\\u5b8c\\u6574\\u4f7f\\u7528\\u6307\\u5357</h1>';"
  + "h+='<p style=\"font-size:15px;color:var(--tx2);line-height:1.6;max-width:600px;margin:0\">\\u57fa\\u4e8e\\u300a\\u4e00\\u4eba\\u4f01\\u4e1a\\u65b9\\u6cd5\\u8bba 2.0\\u300b\\u7684 AI \\u8d4b\\u80fd\\u4e00\\u4eba\\u516c\\u53f8\\u5b8c\\u6574\\u64cd\\u4f5c\\u6307\\u5357\\uff0c\\u5305\\u542b\\u5e73\\u53f0\\u80cc\\u666f\\u3001OPB \\u65b9\\u6cd5\\u8bba\\u548c\\u5b8c\\u6574\\u5de5\\u4f5c\\u6d41\\u7a0b</p>';"
  + "h+='<div style=\"display:flex;gap:24px;margin-top:20px\">';"
  + "h+='<div style=\"text-align:center\"><div style=\"font-size:22px;font-weight:800;color:#1d4ed8\">7</div><div style=\"font-size:12px;color:var(--tx2);margin-top:2px\">AI \\u5de5\\u5177</div></div>';"
  + "h+='<div style=\"width:1px;background:var(--bd)\"></div>';"
  + "h+='<div style=\"text-align:center\"><div style=\"font-size:22px;font-weight:800;color:#1d4ed8\">16</div><div style=\"font-size:12px;color:var(--tx2);margin-top:2px\">OPB \\u6a21\\u5757</div></div>';"
  + "h+='<div style=\"width:1px;background:var(--bd)\"></div>';"
  + "h+='<div style=\"text-align:center\"><div style=\"font-size:22px;font-weight:800;color:#1d4ed8\">6</div><div style=\"font-size:12px;color:var(--tx2);margin-top:2px\">\\u5de5\\u4f5c\\u6d41\\u7a0b</div></div>';"
  + "h+='<div style=\"width:1px;background:var(--bd)\"></div>';"
  + "h+='<div style=\"text-align:center\"><div style=\"font-size:22px;font-weight:800;color:#1d4ed8\">1</div><div style=\"font-size:12px;color:var(--tx2);margin-top:2px\">\\u4eba\\u8fd0\\u8425</div></div>';"
  + "h+='</div>';"
  + "h+='</div>';"
  // ── Section 1: 项目背景与意义 ──
  + "h+='<section id=\"g-bg\" style=\"margin-bottom:48px\">';"
  + "h+='<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:20px\">';"
  + "h+='<div style=\"width:3px;height:20px;background:#2563eb;border-radius:2px\"></div>';"
  + "h+='<h2 style=\"font-size:18px;font-weight:700;margin:0;color:var(--tx)\">\\u9879\\u76ee\\u80cc\\u666f\\u4e0e\\u610f\\u4e49</h2>';"
  + "h+='</div>';"
  + "h+='<p style=\"font-size:14px;line-height:1.8;color:var(--tx2);margin-bottom:16px\">\\u661f\\u73af OPC \\u4e2d\\u5fc3\\uff08One Person Company Center\\uff09\\u662f\\u4e00\\u4e2a\\u57fa\\u4e8e AI \\u7684\\u4e00\\u4eba\\u516c\\u53f8\\u7efc\\u5408\\u8fd0\\u8425\\u5e73\\u53f0\\uff0c\\u4e13\\u4e3a\\u72ec\\u7acb\\u521b\\u4e1a\\u8005\\u3001\\u81ea\\u5a92\\u4f53\\u3001\\u6570\\u5b57\\u4e2a\\u4f53\\u8bbe\\u8ba1\\u3002\\u5b83\\u5c06\\u590d\\u6742\\u7684\\u4f01\\u4e1a\\u8fd0\\u8425\\u5de5\\u4f5c\\u4ea4\\u7ed9 AI \\u56e2\\u961f\\uff0c\\u8ba9\\u521b\\u529e\\u4eba\\u4e13\\u6ce8\\u4e8e\\u6838\\u5fc3\\u4ef7\\u503c\\u521b\\u9020\\u3002</p>';"
  + "h+='<p style=\"font-size:14px;line-height:1.8;color:var(--tx2);margin-bottom:24px\">\\u672c\\u5e73\\u53f0\\u7406\\u5ff5\\u6765\\u81ea Easy Chen \\u6240\\u8457\\u300a\\u4e00\\u4eba\\u4f01\\u4e1a\\u65b9\\u6cd5\\u8bba 2.0\\u300b\\uff1a\\u5728 AI \\u65f6\\u4ee3\\uff0c\\u4e00\\u4e2a\\u4eba\\u5b8c\\u5168\\u53ef\\u4ee5\\u8fd0\\u8425\\u4e00\\u5bb6\\u5177\\u5907\\u5b8c\\u6574\\u529f\\u80fd\\u7684\\u516c\\u53f8\\uff0c\\u5b9e\\u73b0\\u8d44\\u4ea7\\u5f0f\\u6536\\u5165\\u548c\\u590d\\u5229\\u589e\\u957f\\u3002</p>';"
  + "h+='<div style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:12px\">';"
  + "h+='<div style=\"padding:16px 20px;background:var(--card);border:1px solid var(--bd);border-radius:10px;border-top:3px solid #2563eb\">';"
  + "h+='<div style=\"font-size:12px;color:var(--tx3);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em\">\\u5e73\\u53f0\\u5b9a\\u4f4d</div>';"
  + "h+='<div style=\"font-size:16px;font-weight:700;color:var(--tx)\">AI \\u8d4b\\u80fd</div>';"
  + "h+='<div style=\"font-size:12px;color:var(--tx2);margin-top:4px\">\\u4e00\\u4eba\\u516c\\u53f8</div>';"
  + "h+='</div>';"
  + "h+='<div style=\"padding:16px 20px;background:var(--card);border:1px solid var(--bd);border-radius:10px;border-top:3px solid #6366f1\">';"
  + "h+='<div style=\"font-size:12px;color:var(--tx3);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em\">\\u7406\\u8bba\\u57fa\\u7840</div>';"
  + "h+='<div style=\"font-size:16px;font-weight:700;color:var(--tx)\">OPB \\u65b9\\u6cd5\\u8bba</div>';"
  + "h+='<div style=\"font-size:12px;color:var(--tx2);margin-top:4px\">Easy Chen \\u8457</div>';"
  + "h+='</div>';"
  + "h+='<div style=\"padding:16px 20px;background:var(--card);border:1px solid var(--bd);border-radius:10px;border-top:3px solid #10b981\">';"
  + "h+='<div style=\"font-size:12px;color:var(--tx3);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em\">\\u6838\\u5fc3\\u80fd\\u529b</div>';"
  + "h+='<div style=\"font-size:16px;font-weight:700;color:var(--tx)\">7 \\u5de5\\u5177</div>';"
  + "h+='<div style=\"font-size:12px;color:var(--tx2);margin-top:4px\">\\u5168\\u80fd AI \\u56e2\\u961f</div>';"
  + "h+='</div>';"
  + "h+='</div>';"
  + "h+='</section>';"

  // ── Section 2: 什么是一人企业 ──
  + "h+='<section id=\"g-opb\" style=\"margin-bottom:48px\">';"
  + "h+='<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:20px\">';"
  + "h+='<div style=\"width:3px;height:20px;background:#2563eb;border-radius:2px\"></div>';"
  + "h+='<h2 style=\"font-size:18px;font-weight:700;margin:0;color:var(--tx)\">\\u4ec0\\u4e48\\u662f\\u4e00\\u4eba\\u4f01\\u4e1a</h2>';"
  + "h+='</div>';"
  + "h+='<p style=\"font-size:14px;line-height:1.8;color:var(--tx2);margin-bottom:20px\">\\u4e00\\u4eba\\u4f01\\u4e1a\\u662f\\u201c\\u4ee5\\u4e2a\\u4f53\\u6216\\u4e2a\\u4eba\\u54c1\\u724c\\u4e3a\\u4e3b\\u5bfc\\u7684\\u4e1a\\u52a1\\u4f53\\u201d\\u3002\\u5b83\\u4e0d\\u7b49\\u4e8e\\u4e2a\\u4f53\\u6237\\uff0c\\u4e5f\\u4e0d\\u540c\\u4e8e\\u4f20\\u7edf\\u521b\\u4e1a\\u516c\\u53f8\\uff0c\\u800c\\u662f\\u4e00\\u79cd\\u5168\\u65b0\\u7684\\u5546\\u4e1a\\u6a21\\u5f0f\\u3002</p>';"
  + "h+='<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px\">';"
  + "h+='<div style=\"padding:16px 20px;background:var(--bg);border-radius:10px;border:1px solid var(--bd)\">';"
  + "h+='<div style=\"font-size:12px;font-weight:700;color:#ef4444;margin-bottom:8px;display:flex;align-items:center;gap:6px\">';"
  + "h+='<svg width=\"14\" height=\"14\" viewBox=\"0 0 14 14\" fill=\"none\"><circle cx=\"7\" cy=\"7\" r=\"6.5\" stroke=\"#ef4444\"/><path d=\"M4.5 4.5l5 5M9.5 4.5l-5 5\" stroke=\"#ef4444\" stroke-width=\"1.5\" stroke-linecap=\"round\"/></svg>';"
  + "h+='\\u4e0d\\u662f\\u4e2a\\u4f53\\u6237</div>';"
  + "h+='<p style=\"font-size:13px;line-height:1.7;color:var(--tx2);margin:0\">\\u4e2a\\u4f53\\u6237\\u662f\\u6cd5\\u5f8b\\u767b\\u8bb0\\u5f62\\u5f0f\\uff0c\\u4e00\\u4eba\\u4f01\\u4e1a\\u662f\\u5546\\u4e1a\\u6a21\\u5f0f\\u3002\\u4e00\\u4eba\\u4f01\\u4e1a\\u53ef\\u4ee5\\u662f\\u516c\\u53f8\\u3001\\u4e2a\\u4f53\\u6237\\u6216\\u65e0\\u6ce8\\u518c\\u7684\\u4e2a\\u4eba\\u54c1\\u724c\\u3002</p>';"
  + "h+='</div>';"
  + "h+='<div style=\"padding:16px 20px;background:var(--bg);border-radius:10px;border:1px solid var(--bd)\">';"
  + "h+='<div style=\"font-size:12px;font-weight:700;color:#ef4444;margin-bottom:8px;display:flex;align-items:center;gap:6px\">';"
  + "h+='<svg width=\"14\" height=\"14\" viewBox=\"0 0 14 14\" fill=\"none\"><circle cx=\"7\" cy=\"7\" r=\"6.5\" stroke=\"#ef4444\"/><path d=\"M4.5 4.5l5 5M9.5 4.5l-5 5\" stroke=\"#ef4444\" stroke-width=\"1.5\" stroke-linecap=\"round\"/></svg>';"
  + "h+='\\u4e0d\\u540c\\u4e8e\\u521d\\u521b\\u516c\\u53f8</div>';"
  + "h+='<p style=\"font-size:13px;line-height:1.7;color:var(--tx2);margin:0\">\\u521d\\u521b\\u516c\\u53f8\\u76ee\\u6807\\u662f\\u878d\\u8d44\\u548c\\u4e0a\\u5e02\\uff0c\\u4e00\\u4eba\\u4f01\\u4e1a\\u76ee\\u6807\\u662f\\u6301\\u7eed\\u6027\\u73b0\\u91d1\\u6d41\\u548c\\u8d44\\u4ea7\\u7d2f\\u79ef\\u3002</p>';"
  + "h+='</div>';"
  + "h+='</div>';"
  + "h+='<div style=\"background:linear-gradient(135deg,#1d4ed8 0%,#6366f1 100%);border-radius:10px;padding:20px 24px;color:#fff\">';"
  + "h+='<div style=\"font-weight:700;font-size:13px;margin-bottom:12px;opacity:0.85;text-transform:uppercase;letter-spacing:0.05em\">\\u4e00\\u4eba\\u4f01\\u4e1a\\u4e09\\u5927\\u6838\\u5fc3\\u7279\\u5f81</div>';"
  + "h+='<div style=\"display:flex;gap:10px;flex-wrap:wrap\">';"
  + "h+='<span style=\"background:rgba(255,255,255,0.15);padding:6px 14px;border-radius:6px;font-size:13px;font-weight:600\">\\u8d44\\u4ea7\\u5f0f\\u6536\\u5165</span>';"
  + "h+='<span style=\"background:rgba(255,255,255,0.15);padding:6px 14px;border-radius:6px;font-size:13px;font-weight:600\">\\u6760\\u6746\\u6548\\u5e94</span>';"
  + "h+='<span style=\"background:rgba(255,255,255,0.15);padding:6px 14px;border-radius:6px;font-size:13px;font-weight:600\">\\u65e0\\u9700\\u5927\\u91cf\\u96c7\\u4eba\\u53ef\\u6269\\u5c55</span>';"
  + "h+='</div>';"
  + "h+='</div>';"
  + "h+='</section>';"

  // ── Section 3: 三大底层逻辑 ──
  + "h+='<section id=\"g-logic\" style=\"margin-bottom:48px\">';"
  + "h+='<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:20px\">';"
  + "h+='<div style=\"width:3px;height:20px;background:#2563eb;border-radius:2px\"></div>';"
  + "h+='<h2 style=\"font-size:18px;font-weight:700;margin:0;color:var(--tx)\">\\u4e09\\u5927\\u5e95\\u5c42\\u903b\\u8f91</h2>';"
  + "h+='</div>';"
  + "h+='<div style=\"display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px\">';"
  + "h+='<div style=\"padding:20px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff\">';"
  + "h+='<div style=\"width:32px;height:32px;background:#2563eb;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:12px\">';"
  + "h+='<svg width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" fill=\"none\"><path d=\"M8 2L14 6V10L8 14L2 10V6L8 2Z\" stroke=\"white\" stroke-width=\"1.5\" stroke-linejoin=\"round\"/></svg>';"
  + "h+='</div>';"
  + "h+='<div style=\"font-weight:700;font-size:14px;margin-bottom:8px;color:#1d4ed8\">\\u4ee5\\u5c0f\\u535a\\u5927</div>';"
  + "h+='<p style=\"font-size:13px;line-height:1.7;color:#1e40af;margin-bottom:10px\">\\u96f6\\u8fb9\\u9645\\u6210\\u672c\\u4ea7\\u54c1\\u53ef\\u65e0\\u9650\\u590d\\u523b\\uff0c\\u65e0\\u9700\\u8bb8\\u53ef\\u5c31\\u53ef\\u5168\\u7403\\u63a8\\u5e7f\\u3002</p>';"
  + "h+='<ul style=\"font-size:12px;color:#1e40af;padding-left:14px;margin:0;line-height:1.8\">';"
  + "h+='<li>\\u8f6f\\u4ef6 / \\u5de5\\u5177</li><li>\\u5185\\u5bb9 / \\u5a92\\u4f53</li><li>\\u8bfe\\u7a0b / \\u77e5\\u8bc6\\u4ea7\\u54c1</li>';"
  + "h+='</ul>';"
  + "h+='</div>';"
  + "h+='<div style=\"padding:20px;border:1px solid #ddd6fe;border-radius:10px;background:#f5f3ff\">';"
  + "h+='<div style=\"width:32px;height:32px;background:#6366f1;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:12px\">';"
  + "h+='<svg width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" fill=\"none\"><rect x=\"2\" y=\"2\" width=\"5\" height=\"5\" rx=\"1\" fill=\"white\"/><rect x=\"9\" y=\"2\" width=\"5\" height=\"5\" rx=\"1\" fill=\"white\" opacity=\"0.7\"/><rect x=\"2\" y=\"9\" width=\"5\" height=\"5\" rx=\"1\" fill=\"white\" opacity=\"0.7\"/><rect x=\"9\" y=\"9\" width=\"5\" height=\"5\" rx=\"1\" fill=\"white\" opacity=\"0.5\"/></svg>';"
  + "h+='</div>';"
  + "h+='<div style=\"font-weight:700;font-size:14px;margin-bottom:8px;color:#4338ca\">\\u8d44\\u4ea7\\u4e0e\\u88ab\\u52a8\\u6536\\u5165</div>';"
  + "h+='<p style=\"font-size:13px;line-height:1.7;color:#3730a3;margin-bottom:10px\">\\u8d44\\u4ea7\\u5728\\u4f60\\u4e0d\\u5de5\\u4f5c\\u65f6\\u8fd8\\u5728\\u5c06\\u94b1\\u6253\\u5165\\u53e3\\u888b\\u3002\\u4e09\\u5927\\u8d44\\u4ea7\\u6c60\\uff1a</p>';"
  + "h+='<ul style=\"font-size:12px;color:#3730a3;padding-left:14px;margin:0;line-height:1.8\">';"
  + "h+='<li>\\u5185\\u5bb9\\u8d44\\u4ea7\\u6c60</li><li>\\u4ea7\\u54c1\\u8d44\\u4ea7\\u6c60</li><li>\\u5ba2\\u6237\\u8d44\\u4ea7\\u6c60</li>';"
  + "h+='</ul>';"
  + "h+='</div>';"
  + "h+='<div style=\"padding:20px;border:1px solid #a7f3d0;border-radius:10px;background:#ecfdf5\">';"
  + "h+='<div style=\"width:32px;height:32px;background:#10b981;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:12px\">';"
  + "h+='<svg width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" fill=\"none\"><path d=\"M2 12C2 12 4 8 8 8C12 8 14 4 14 4\" stroke=\"white\" stroke-width=\"1.5\" stroke-linecap=\"round\"/><path d=\"M10 4L14 4L14 8\" stroke=\"white\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>';"
  + "h+='</div>';"
  + "h+='<div style=\"font-weight:700;font-size:14px;margin-bottom:8px;color:#065f46\">\\u6eda\\u96ea\\u7403\\u6548\\u5e94</div>';"
  + "h+='<p style=\"font-size:13px;line-height:1.7;color:#047857;margin-bottom:10px\">\\u5185\\u5bb9\\u8d44\\u4ea7\\u968f\\u65f6\\u95f4\\u590d\\u5229\\uff0c\\u5c71\\u5934\\u8d8a\\u6eda\\u8d8a\\u5927\\u3002\\u957f\\u671f\\u4e3b\\u4e49\\u52dd\\u8fc7\\u77ed\\u671f\\u88ab\\u52a8\\u3002</p>';"
  + "h+='<ul style=\"font-size:12px;color:#047857;padding-left:14px;margin:0;line-height:1.8\">';"
  + "h+='<li>\\u5185\\u5bb9\\u8d44\\u4ea7\\u590d\\u5229\\u589e\\u957f</li><li>\\u54c1\\u724c\\u548c\\u4fe1\\u4efb\\u7d2f\\u79ef</li><li>\\u641c\\u7d22\\u6d41\\u91cf\\u590d\\u5229</li>';"
  + "h+='</ul>';"
  + "h+='</div>';"
  + "h+='</div>';"
  + "h+='</section>';"

  // ── Section 4: 赛道选择框架 ──
  + "h+='<section id=\"g-track\" style=\"margin-bottom:48px\">';"
  + "h+='<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:20px\">';"
  + "h+='<div style=\"width:3px;height:20px;background:#2563eb;border-radius:2px\"></div>';"
  + "h+='<h2 style=\"font-size:18px;font-weight:700;margin:0;color:var(--tx)\">\\u8d5b\\u9053\\u9009\\u62e9\\u6846\\u67b6</h2>';"
  + "h+='</div>';"
  + "h+='<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px\">';"
  + "h+='<div style=\"padding:16px 20px;border:1px dashed #fca5a5;border-radius:10px;background:#fef2f2\">';"
  + "h+='<div style=\"font-weight:700;color:#dc2626;margin-bottom:8px;font-size:13px;display:flex;align-items:center;gap:6px\">';"
  + "h+='<svg width=\"14\" height=\"14\" viewBox=\"0 0 14 14\" fill=\"none\"><circle cx=\"7\" cy=\"7\" r=\"6.5\" stroke=\"#dc2626\"/><path d=\"M4.5 4.5l5 5M9.5 4.5l-5 5\" stroke=\"#dc2626\" stroke-width=\"1.5\" stroke-linecap=\"round\"/></svg>';"
  + "h+='\\u907f\\u5f00\\uff1a\\u5927\\u4f17\\u521a\\u9700</div>';"
  + "h+='<p style=\"font-size:13px;line-height:1.7;color:#991b1b;margin:0\">\\u5927\\u4f17\\u5e02\\u573a\\u7ade\\u4e89\\u6fc0\\u70c8\\uff0c\\u8d44\\u672c\\u548c\\u56e2\\u961f\\u89c4\\u6a21\\u8981\\u6c42\\u9ad8\\uff0c\\u4e00\\u4eba\\u4f01\\u4e1a\\u96be\\u4ee5\\u5b58\\u6d3b\\u3002</p>';"
  + "h+='</div>';"
  + "h+='<div style=\"padding:16px 20px;border:1px solid #6ee7b7;border-radius:10px;background:#ecfdf5\">';"
  + "h+='<div style=\"font-weight:700;color:#065f46;margin-bottom:8px;font-size:13px;display:flex;align-items:center;gap:6px\">';"
  + "h+='<svg width=\"14\" height=\"14\" viewBox=\"0 0 14 14\" fill=\"none\"><circle cx=\"7\" cy=\"7\" r=\"6.5\" stroke=\"#10b981\"/><path d=\"M4 7l2 2 4-4\" stroke=\"#10b981\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>';"
  + "h+='\\u76ee\\u6807\\uff1a\\u5c0f\\u4f17\\u5f3a\\u9700</div>';"
  + "h+='<p style=\"font-size:13px;line-height:1.7;color:#065f46;margin:0\">\\u5c0f\\u4f17\\u5e02\\u573a\\u7ade\\u4e89\\u5c11\\uff0c\\u7528\\u6237\\u613f\\u610f\\u4ed8\\u8d39\\uff0c\\u4e00\\u4eba\\u4f01\\u4e1a\\u5bb9\\u6613\\u5360\\u636e\\u4f18\\u52bf\\u5730\\u4f4d\\u3002</p>';"
  + "h+='</div>';"
  + "h+='</div>';"
  + "h+='<div style=\"font-size:13px;font-weight:700;color:var(--tx);margin-bottom:10px\">\\u975e\\u7ade\\u4e89\\u7b56\\u7565\\uff08\\u4e09\\u79cd\\u8def\\u5f84\\uff09</div>';"
  + "h+='<div style=\"display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px\">';"
  + "h+='<div style=\"padding:14px 16px;background:var(--bg);border-radius:8px;border:1px solid var(--bd)\">';"
  + "h+='<div style=\"font-size:12px;font-weight:700;color:#2563eb;margin-bottom:6px\">\\u6210\\u4e3a\\u751f\\u6001\\u7684\\u4e00\\u90e8\\u5206</div>';"
  + "h+='<p style=\"font-size:12px;color:var(--tx2);margin:0;line-height:1.6\">\\u5728\\u5df2\\u6709\\u5e73\\u53f0\\u4e0a\\u8865\\u5145\\u7f3a\\u5c11\\u7684\\u4e1c\\u897f</p>';"
  + "h+='</div>';"
  + "h+='<div style=\"padding:14px 16px;background:var(--bg);border-radius:8px;border:1px solid var(--bd)\">';"
  + "h+='<div style=\"font-size:12px;font-weight:700;color:#6366f1;margin-bottom:6px\">\\u5dee\\u5f02\\u5316\\u5b9a\\u4f4d</div>';"
  + "h+='<p style=\"font-size:12px;color:var(--tx2);margin:0;line-height:1.6\">\\u5728\\u540c\\u7c7b\\u8d5b\\u9053\\u4e2d\\u627e\\u5230\\u72ec\\u7279\\u89d2\\u5ea6</p>';"
  + "h+='</div>';"
  + "h+='<div style=\"padding:14px 16px;background:var(--bg);border-radius:8px;border:1px solid var(--bd)\">';"
  + "h+='<div style=\"font-size:12px;font-weight:700;color:#10b981;margin-bottom:6px\">\\u521b\\u5efa\\u65b0\\u7c7b\\u76ee</div>';"
  + "h+='<p style=\"font-size:12px;color:var(--tx2);margin:0;line-height:1.6\">\\u5b9a\\u4e49\\u5168\\u65b0\\u7c7b\\u76ee\\uff0c\\u6210\\u4e3a\\u7b2c\\u4e00</p>';"
  + "h+='</div>';"
  + "h+='</div>';"
  + "h+='<div style=\"font-size:13px;font-weight:700;color:var(--tx);margin-bottom:10px\">\\u7ed3\\u6784\\u6027\\u4f18\\u52bf</div>';"
  + "h+='<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:10px\">';"
  + "h+='<div style=\"padding:14px 16px;background:var(--bg);border-radius:8px;border:1px solid var(--bd)\">';"
  + "h+='<div style=\"font-size:13px;font-weight:600;margin-bottom:4px;color:var(--tx)\">\\u526f\\u4ea7\\u54c1\\u4f18\\u52bf</div>';"
  + "h+='<p style=\"font-size:12px;color:var(--tx2);margin:0;line-height:1.6\">\\u5229\\u7528\\u5df2\\u6709\\u5de5\\u4f5c\\u7684\\u526f\\u4ea7\\u54c1\\u521b\\u4e1a\\uff0c\\u8fb9\\u969b\\u6210\\u672c\\u8d8b\\u8fd1\\u4e8e\\u96f6</p>';"
  + "h+='</div>';"
  + "h+='<div style=\"padding:14px 16px;background:var(--bg);border-radius:8px;border:1px solid var(--bd)\">';"
  + "h+='<div style=\"font-size:13px;font-weight:600;margin-bottom:4px;color:var(--tx)\">\\u4fe1\\u606f\\u5dee\\u4f18\\u52bf</div>';"
  + "h+='<p style=\"font-size:12px;color:var(--tx2);margin:0;line-height:1.6\">\\u6301\\u6709\\u72ec\\u7279\\u4fe1\\u606f\\u3001\\u8d44\\u6e90\\u6216\\u6280\\u80fd\\uff0c\\u5efa\\u7acb\\u96be\\u4ee5\\u590d\\u5236\\u7684\\u58c1\\u5792</p>';"
  + "h+='</div>';"
  + "h+='</div>';"
  + "h+='</section>';"

  // ── Section 5: OPB画布 16模块 ──
  + "h+='<section id=\"g-canvas\" style=\"margin-bottom:48px\">';"
  + "h+='<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:20px\">';"
  + "h+='<div style=\"width:3px;height:20px;background:#2563eb;border-radius:2px\"></div>';"
  + "h+='<h2 style=\"font-size:18px;font-weight:700;margin:0;color:var(--tx)\">OPB \\u753b\\u5e03 16 \\u6a21\\u5757</h2>';"
  + "h+='</div>';"
  + "h+='<p style=\"font-size:14px;color:var(--tx2);margin-bottom:16px;line-height:1.7\">OPB\\uff08One Person Business\\uff09\\u753b\\u5e03\\u662f\\u4e00\\u4eba\\u4f01\\u4e1a\\u7684\\u6218\\u7565\\u89c4\\u5212\\u5de5\\u5177\\uff0c\\u5305\\u542b 16 \\u4e2a\\u6a21\\u5757\\uff0c\\u5168\\u9762\\u63cf\\u8ff0\\u4e1a\\u52a1\\u6a21\\u5f0f\\u3002</p>';"
  + "h+='<div style=\"display:grid;grid-template-columns:repeat(4,1fr);gap:8px\">';"
  + "var canvas16=["
  + "{k:'track',l:'\\u8d5b\\u9053',d:'\\u4e1a\\u52a1\\u6240\\u5728\\u7684\\u9886\\u57df\\u548c\\u5e02\\u573a\\u5206\\u7c7b'},"
  + "{k:'target_customer',l:'\\u76ee\\u6807\\u5ba2\\u6237',d:'\\u5177\\u4f53\\u7528\\u6237\\u753b\\u50cf\\uff1a\\u4eba\\u7fa4\\u3001\\u75db\\u70b9\\u3001\\u573a\\u666f'},"
  + "{k:'pain_point',l:'\\u75db\\u70b9',d:'\\u5ba2\\u6237\\u6838\\u5fc3\\u75db\\u70b9\\u548c\\u672a\\u6ee1\\u8db3\\u9700\\u6c42'},"
  + "{k:'solution',l:'\\u89e3\\u51b3\\u65b9\\u6848',d:'\\u4ea7\\u54c1/\\u670d\\u52a1\\u5982\\u4f55\\u89e3\\u51b3\\u75db\\u70b9'},"
  + "{k:'unique_value',l:'\\u72ec\\u7279\\u4ef7\\u503c',d:'\\u4e0e\\u7ade\\u4e89\\u5bf9\\u624b\\u7684\\u5dee\\u5f02\\u5316\\u4f18\\u52bf'},"
  + "{k:'channels',l:'\\u6e20\\u9053',d:'\\u83b7\\u5ba2\\u6e20\\u9053\\uff1a\\u5185\\u5bb9/\\u793e\\u7fa4/\\u53e3\\u7891/\\u5e7f\\u544a'},"
  + "{k:'revenue_model',l:'\\u6536\\u5165\\u6a21\\u5f0f',d:'\\u5982\\u4f55\\u53d8\\u73b0\\uff1a\\u8ba2\\u9605/\\u4e00\\u6b21\\u6027/\\u4f63\\u4f63/\\u53d6\\u6210'},"
  + "{k:'cost_structure',l:'\\u6210\\u672c\\u7ed3\\u6784',d:'\\u4e3b\\u8981\\u6210\\u672c\\u9879\\u76ee\\u548c\\u56fa\\u53d8\\u6bd4\\u4f8b'},"
  + "{k:'key_resources',l:'\\u5173\\u952e\\u8d44\\u6e90',d:'\\u6280\\u80fd\\u3001\\u5185\\u5bb9\\u3001\\u793e\\u7fa4\\u3001\\u54c1\\u724c\\u3001\\u5de5\\u5177'},"
  + "{k:'key_activities',l:'\\u5173\\u952e\\u6d3b\\u52a8',d:'\\u6bcf\\u5929\\u5fc5\\u987b\\u505a\\u7684\\u6838\\u5fc3\\u4e8b\\u9879'},"
  + "{k:'key_partners',l:'\\u5173\\u952e\\u5408\\u4f5c',d:'\\u521b\\u4f5c\\u8054\\u8054\\u3001\\u5de5\\u5177\\u4f9b\\u5e94\\u5546\\u3001\\u5206\\u53d1\\u5e73\\u53f0'},"
  + "{k:'unfair_advantage',l:'\\u4e0d\\u516c\\u5e73\\u4f18\\u52bf',d:'\\u96be\\u4ee5\\u590d\\u5236\\u7684\\u72ec\\u7279\\u4f18\\u52bf\\u548c\\u58c1\\u5792'},"
  + "{k:'metrics',l:'\\u5173\\u952e\\u6307\\u6807',d:'\\u8861\\u91cf\\u4e1a\\u52a1\\u5065\\u5eb7\\u7684\\u6838\\u5fc3\\u6307\\u6807'},"
  + "{k:'non_compete',l:'\\u975e\\u7ade\\u4e89\\u7b56\\u7565',d:'\\u5982\\u4f55\\u907f\\u514d\\u6b63\\u9762\\u7ade\\u4e89\\u7684\\u7b56\\u7565'},"
  + "{k:'scaling_strategy',l:'\\u6269\\u5c55\\u7b56\\u7565',d:'\\u4e0d\\u96c7\\u4eba\\u60c5\\u51b5\\u4e0b\\u5982\\u4f55\\u6269\\u5927\\u6536\\u5165'},"
  + "{k:'notes',l:'\\u5907\\u6ce8',d:'\\u5176\\u4ed6\\u91cd\\u8981\\u4e8b\\u9879\\u548c\\u8865\\u5145\\u8bf4\\u660e'}"
  + "];"
  + "canvas16.forEach(function(m,i){"
  + "h+='<div style=\"padding:12px;border:1px solid var(--bd);border-radius:8px;background:var(--card);transition:box-shadow 0.15s;cursor:default\" onmouseenter=\"this.style.boxShadow=\\'0 2px 8px rgba(0,0,0,0.08)\\'\" onmouseleave=\"this.style.boxShadow=\\'none\\'\">';"
  + "h+='<div style=\"font-size:10px;color:var(--tx3);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em\">#'+(i+1)+'</div>';"
  + "h+='<div style=\"font-size:13px;font-weight:700;margin-bottom:4px;color:var(--tx)\">'+esc(m.l)+'</div>';"
  + "h+='<div style=\"font-size:11px;color:var(--tx2);line-height:1.5\">'+esc(m.d)+'</div>';"
  + "h+='</div>';"
  + "});"
  + "h+='</div>';"
  + "h+='<div style=\"margin-top:14px;padding:12px 16px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;font-size:13px;color:#1d4ed8;display:flex;align-items:center;gap:8px\">';"
  + "h+='<svg width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" fill=\"none\"><circle cx=\"8\" cy=\"8\" r=\"7\" stroke=\"#2563eb\" stroke-width=\"1.5\"/><path d=\"M8 7v4M8 5v1\" stroke=\"#2563eb\" stroke-width=\"1.5\" stroke-linecap=\"round\"/></svg>';"
  + "h+='\\u5728 <b>OPB \\u753b\\u5e03</b> \\u83dc\\u5355\\u4e2d\\u5c55\\u5f00\\u753b\\u5e03\\uff0c\\u6216\\u5bf9 Agent \\u8bf4\\u201c\\u67e5\\u770b\\u516c\\u53f8 {id} \\u7684 OPB \\u753b\\u5e03\\u201d';"
  + "h+='</div>';"
  + "h+='</section>';"

  // ── Section 6: 星环OPC平台使用流程 (6步) ──
  + "h+='<section id=\"g-flow\" style=\"margin-bottom:48px\">';"
  + "h+='<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:20px\">';"
  + "h+='<div style=\"width:3px;height:20px;background:#2563eb;border-radius:2px\"></div>';"
  + "h+='<h2 style=\"font-size:18px;font-weight:700;margin:0;color:var(--tx)\">\\u5e73\\u53f0\\u4f7f\\u7528\\u6d41\\u7a0b\\uff086 \\u6b65\\uff09</h2>';"
  + "h+='</div>';"
  + "h+='<div class=\"sop-flow\">';"
  // Step 1
  + "h+='<div class=\"sop-step\"><div class=\"sop-step-num\">01</div><div class=\"sop-step-body\">';"
  + "h+='<div class=\"sop-step-title\">\\u6ce8\\u518c\\u516c\\u53f8</div>';"
  + "h+='<div class=\"sop-step-desc\">\\u767b\\u8bb0\\u4e00\\u4eba\\u516c\\u53f8\\u57fa\\u672c\\u4fe1\\u606f\\uff0c\\u81ea\\u52a8\\u521b\\u5efa\\u4e13\\u5c5e AI Agent</div>';"
  + "h+='<div class=\"sop-step-actions\"><span class=\"sop-tag\">opc_manage</span><span class=\"sop-tag\">register_company</span></div>';"
  + "h+='<div class=\"sop-step-detail\"><b>\\u64cd\\u4f5c\\u6b65\\u9aa4:</b><ol><li>\\u8f93\\u5165\\u516c\\u53f8\\u540d\\u79f0\\u3001\\u884c\\u4e1a\\u3001\\u521b\\u529e\\u4eba\\u4fe1\\u606f</li><li>AI \\u81ea\\u52a8\\u521b\\u5efa\\u516c\\u53f8\\u8bb0\\u5f55\\u548c\\u4e13\\u5c5e Agent</li><li>\\u8fd4\\u56de\\u516c\\u53f8 ID \\u7528\\u4e8e\\u540e\\u7eed\\u64cd\\u4f5c</li></ol></div>';"
  + "h+='</div></div>';"
  + "h+='<div class=\"sop-arrow\">\\u2193</div>';"
  // Step 2
  + "h+='<div class=\"sop-step\"><div class=\"sop-step-num\">02</div><div class=\"sop-step-body\">';"
  + "h+='<div class=\"sop-step-title\">\\u6fc0\\u6d3b\\u516c\\u53f8</div>';"
  + "h+='<div class=\"sop-step-desc\">\\u5c06\\u516c\\u53f8\\u72b6\\u6001\\u4ece\\u201c\\u5f85\\u6ce8\\u518c\\u201d\\u53d8\\u66f4\\u4e3a\\u201c\\u8fd0\\u8425\\u4e2d\\u201d\\uff0c\\u5f00\\u542f\\u5168\\u529f\\u80fd\\u6a21\\u5757</div>';"
  + "h+='<div class=\"sop-step-actions\"><span class=\"sop-tag\">opc_manage</span><span class=\"sop-tag\">activate_company</span></div>';"
  + "h+='<div class=\"sop-step-detail\"><b>\\u64cd\\u4f5c\\u6b65\\u9aa4:</b><ol><li>\\u786e\\u8ba4\\u516c\\u53f8\\u57fa\\u672c\\u4fe1\\u606f\\u5b8c\\u6574</li><li>\\u6267\\u884c\\u6fc0\\u6d3b\\u64cd\\u4f5c</li><li>\\u516c\\u53f8\\u72b6\\u6001\\u53d8\\u66f4\\u4e3a active</li></ol></div>';"
  + "h+='</div></div>';"
  + "h+='<div class=\"sop-arrow\">\\u2193</div>';"
  // Step 3
  + "h+='<div class=\"sop-step\"><div class=\"sop-step-num\">03</div><div class=\"sop-step-body\">';"
  + "h+='<div class=\"sop-step-title\">\\u914d\\u7f6e AI \\u56e2\\u961f</div>';"
  + "h+='<div class=\"sop-step-desc\">\\u4e00\\u952e\\u521d\\u59cb\\u5316 6 \\u4e2a AI \\u5c97\\u4f4d\\uff0c\\u8ba9\\u516c\\u53f8\\u62e5\\u6709\\u5b8c\\u6574 AI \\u56e2\\u961f</div>';"
  + "h+='<div class=\"sop-step-actions\"><span class=\"sop-tag\">opc_hr</span><span class=\"sop-tag\">init_default_staff</span></div>';"
  + "h+='<div class=\"sop-step-detail\"><b>\\u9ed8\\u8ba4\\u521d\\u59cb\\u5316 6 \\u4e2a\\u5c97\\u4f4d:</b>';"
  + "h+='<div class=\"sop-roles\"><span>\\ud83d\\udcc4 \\u884c\\u653f\\u52a9\\u7406</span><span>\\ud83d\\udc65 HR \\u4e13\\u5458</span><span>\\ud83d\\udcb0 \\u8d22\\u52a1\\u987e\\u95ee</span><span>\\u2696 \\u6cd5\\u52a1\\u52a9\\u7406</span><span>\\ud83d\\udce3 \\u5e02\\u573a\\u63a8\\u5e7f</span><span>\\ud83d\\udcca \\u8fd0\\u8425\\u7ecf\\u7406</span></div></div>';"
  + "h+='</div></div>';"
  + "h+='<div class=\"sop-arrow\">\\u2193</div>';"
  // Step 4
  + "h+='<div class=\"sop-step sop-step-wide\"><div class=\"sop-step-num\">04</div><div class=\"sop-step-body\">';"
  + "h+='<div class=\"sop-step-title\">\\u65e5\\u5e38\\u8fd0\\u8425</div>';"
  + "h+='<div class=\"sop-step-desc\">\\u901a\\u8fc7\\u5bf9\\u8bdd AI \\u5b8c\\u6210\\u65e5\\u5e38\\u4e1a\\u52a1\\u64cd\\u4f5c\\uff0c\\u7cfb\\u7edf\\u81ea\\u52a8\\u63d0\\u9192\\u91cd\\u8981\\u4e8b\\u9879</div>';"
  + "h+='<div class=\"sop-modules\">';"
  + "var mods=[{icon:'\\ud83d\\udcb0',name:'\\u8d22\\u52a1\\u8bb0\\u8d26',tool:'opc_manage',acts:'add_transaction / finance_summary'},{icon:'\\ud83d\\udcc4',name:'\\u53d1\\u7968\\u7ba1\\u7406',tool:'opc_finance',acts:'create_invoice / list_invoices'},{icon:'\\u2696',name:'\\u5408\\u540c\\u7ba1\\u7406',tool:'opc_legal',acts:'create_contract / list_contracts'},{icon:'\\ud83d\\udc65',name:'\\u5458\\u5de5\\u7ba1\\u7406',tool:'opc_hr',acts:'add_employee / payroll_summary'},{icon:'\\ud83d\\udce3',name:'\\u5185\\u5bb9\\u8fd0\\u8425',tool:'opc_media',acts:'create_content / publish'},{icon:'\\ud83d\\udcc8',name:'\\u9879\\u76ee\\u7ba1\\u7406',tool:'opc_project',acts:'create_project / update_task'}];"
  + "mods.forEach(function(m){h+='<div class=\"sop-module\"><div class=\"sop-module-icon\">'+m.icon+'</div><div class=\"sop-module-name\">'+esc(m.name)+'</div><div class=\"sop-module-tool\">'+esc(m.tool)+'</div><div class=\"sop-module-acts\">'+esc(m.acts)+'</div></div>';});"
  + "h+='</div>';"
  + "h+='<div class=\"sop-reminder-tip\">\\ud83d\\udd14 \\u81ea\\u52a8\\u63d0\\u9192\\u5df2\\u5f00\\u542f\\uff1a\\u7a0e\\u52a1\\u7533\\u62a5\\u3001\\u5408\\u540c\\u5230\\u671f\\u3001\\u73b0\\u91d1\\u6d41\\u9884\\u8b66\\u5c06\\u81ea\\u52a8\\u751f\\u6210\\u5230\\u76d1\\u63a7\\u4e2d\\u5fc3</div>';"
  + "h+='</div></div>';"
  + "h+='<div class=\"sop-arrow\">\\u2193</div>';"
  // Step 5 - capital loop
  + "h+='<div class=\"sop-step sop-step-highlight\"><div class=\"sop-step-num\">05</div><div class=\"sop-step-body\">';"
  + "h+='<div class=\"sop-step-title\">\\u8d44\\u91d1\\u95ed\\u73af</div>';"
  + "h+='<div class=\"sop-step-desc\">\\u661f\\u73af OPC \\u5e73\\u53f0\\u6838\\u5fc3\\u8d44\\u91d1\\u95ed\\u73af\\u6a21\\u578b</div>';"
  + "h+='<div class=\"sop-capital-loop\">';"
  + "var cloop=[{c:'\\u6295\\u8d44\\u53c2\\u80a1',d:'\\u57ce\\u6295\\u516c\\u53f8\\u53c2\\u8d44\\u5b54\\u5316\\u4f01\\u4e1a',t:'opc_investment'},{c:'\\u670d\\u52a1\\u91c7\\u8d2d',d:'\\u4f01\\u4e1a\\u5411\\u5e73\\u53f0\\u91c7\\u8d2d\\u63d0\\u5347\\u670d\\u52a1',t:'opc_procurement'},{c:'\\u8d44\\u91d1\\u56de\\u6d41',d:'\\u670d\\u52a1\\u8d39\\u6536\\u5165\\u56de\\u6d41\\u5e73\\u53f0',t:'opc_finance'},{c:'\\u8d44\\u4ea7\\u8f6c\\u8ba9',d:'\\u6253\\u5305\\u4f18\\u8d28\\u8d44\\u4ea7\\u8f6c\\u8ba9\\u57ce\\u6295',t:'opc_lifecycle'},{c:'\\u878d\\u8d44\\u670d\\u52a1\\u8d39',d:'\\u57ce\\u6295\\u878d\\u8d44\\u6536\\u53d6\\u670d\\u52a1\\u8d39\\u7528',t:'opc_investment'}];"
  + "var arrowSvg='<div class=\"sop-cap-arrow\"><svg width=\"20\" height=\"20\" viewBox=\"0 0 20 20\" fill=\"none\"><path d=\"M5 10h10M12 7l3 3-3 3\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg></div>';"
  + "var downArrowSvg='<div style=\"text-align:center;padding:8px 0;color:var(--tx3)\"><svg width=\"20\" height=\"20\" viewBox=\"0 0 20 20\" fill=\"none\"><path d=\"M10 5v10M7 12l3 3 3-3\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg></div>';"
  + "function makeStep(s,i){return '<div class=\"sop-capital-step\"><div class=\"sop-cap-num\">'+(i+1)+'</div><div class=\"sop-cap-title\">'+esc(s.c)+'</div><div class=\"sop-cap-desc\">'+esc(s.d)+'</div><div class=\"sop-cap-tag\">'+esc(s.t)+'</div></div>';}"
  // Single row: all 5 steps with arrows
  + "h+='<div style=\"display:flex;align-items:center;gap:0\">';"
  + "for(var si=0;si<cloop.length;si++){h+=makeStep(cloop[si],si);if(si<cloop.length-1)h+=arrowSvg;}"
  + "h+='</div>';"
  + "h+='</div></div></div>';"
  + "h+='<div class=\"sop-arrow\">\\u2193</div>';"
  // Step 6
  + "h+='<div class=\"sop-step\"><div class=\"sop-step-num\">06</div><div class=\"sop-step-body\">';"
  + "h+='<div class=\"sop-step-title\">\\u751f\\u547d\\u5468\\u671f\\u62a5\\u544a</div>';"
  + "h+='<div class=\"sop-step-desc\">\\u5b9a\\u671f\\u751f\\u6210\\u516c\\u53f8\\u8fd0\\u8425\\u62a5\\u544a\\uff0c\\u8ddf\\u8e2a\\u6210\\u957f\\u8f68\\u8ff9</div>';"
  + "h+='<div class=\"sop-step-actions\"><span class=\"sop-tag\">opc_lifecycle</span><span class=\"sop-tag\">generate_report</span></div>';"
  + "h+='<div class=\"sop-step-detail\"><b>\\u62a5\\u544a\\u5305\\u542b:</b> \\u516c\\u53f8\\u57fa\\u672c\\u4fe1\\u606f\\u3001\\u8d22\\u52a1\\u6982\\u51b5\\u3001\\u91cc\\u7a0b\\u7891\\u8fdb\\u5c55\\u3001\\u5458\\u5de5\\u4eba\\u6570\\u3001\\u5408\\u540c\\u72b6\\u6001\\u3001\\u4e0b\\u4e00\\u9636\\u6bb5\\u8ba1\\u5212</div>';"
  + "h+='</div></div>';"
  + "h+='</div>';" // end sop-flow
  + "h+='</section>';"

  // ── Section 7: AI工具说明 ──
  + "h+='<section id=\"g-tools\" style=\"margin-bottom:48px\">';"
  + "h+='<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:20px\">';"
  + "h+='<div style=\"width:3px;height:20px;background:#2563eb;border-radius:2px\"></div>';"
  + "h+='<h2 style=\"font-size:18px;font-weight:700;margin:0;color:var(--tx)\">AI \\u5de5\\u5177\\u8bf4\\u660e</h2>';"
  + "h+='</div>';"
  + "h+='<div class=\"tool-grid\">';"
  + "var tools7=["
  + "{k:'opc_manage',l:'\\u516c\\u53f8\\u7ba1\\u7406',d:'\\u6ce8\\u518c\\u516c\\u53f8\\u3001\\u6fc0\\u6d3b\\u3001\\u8d22\\u52a1\\u8bb0\\u8d26\\u3001\\u76d1\\u63a7\\u3001\\u751f\\u547d\\u5468\\u671f\\u62a5\\u544a',acts:['register_company','activate_company','add_transaction','finance_summary','list_companies']},"
  + "{k:'opc_opb',l:'OPB \\u753b\\u5e03',d:'\\u521b\\u5efa\\u548c\\u66f4\\u65b0\\u4e00\\u4eba\\u4f01\\u4e1a 16 \\u6a21\\u5757\\u753b\\u5e03\\uff0c\\u5e2e\\u52a9\\u6de8\\u5316\\u4e1a\\u52a1\\u6a21\\u5f0f',acts:['get_canvas','save_canvas','create_canvas','analyze_canvas']},"
  + "{k:'opc_finance',l:'\\u8d22\\u52a1\\u7ba1\\u7406',d:'\\u53d1\\u7968\\u521b\\u5efa\\u3001\\u67e5\\u8be2\\uff0c\\u8d22\\u52a1\\u62a5\\u544a\\u751f\\u6210',acts:['create_invoice','list_invoices','get_invoice','finance_report']},"
  + "{k:'opc_legal',l:'\\u6cd5\\u52a1\\u52a9\\u7406',d:'\\u5408\\u540c\\u7ba1\\u7406\\uff0c\\u5408\\u89c4\\u68c0\\u67e5\\uff0c\\u6cd5\\u5f8b\\u6587\\u4ef6\\u5b58\\u6863',acts:['create_contract','list_contracts','get_contract','compliance_check']},"
  + "{k:'opc_hr',l:'HR \\u4e13\\u5458',d:'\\u5458\\u5de5\\u5c55\\u5f00\\u548c\\u79bb\\u804c\\u3001\\u85aa\\u8d44\\u7ba1\\u7406\\u3001\\u9ed8\\u8ba4\\u5c97\\u4f4d\\u521d\\u59cb\\u5316',acts:['add_employee','offboard_employee','payroll_summary','init_default_staff']},"
  + "{k:'opc_media',l:'\\u5185\\u5bb9\\u8fd0\\u8425',d:'\\u5185\\u5bb9\\u521b\\u4f5c\\u3001\\u76f8\\u518c\\u7ba1\\u7406\\u3001\\u5185\\u5bb9\\u65e5\\u5386\\u89c4\\u5212',acts:['create_content','list_content','publish_content','content_calendar']},"
  + "{k:'opc_project',l:'\\u9879\\u76ee\\u7ba1\\u7406',d:'\\u9879\\u76ee\\u521b\\u5efa\\u548c\\u8ddf\\u8e2a\\u3001\\u4efb\\u52a1\\u66f4\\u65b0\\u3001\\u91cc\\u7a0b\\u7891\\u7ba1\\u7406',acts:['create_project','list_projects','update_task','milestone_report']}"
  + "];"
  + "tools7.forEach(function(t){"
  + "h+='<div class=\"tool-card\" style=\"margin-bottom:0\">';"
  + "h+='<div class=\"tool-card-header\"><div><div class=\"name\">'+esc(t.l)+'</div><div class=\"key\">'+esc(t.k)+'</div></div></div>';"
  + "h+='<div class=\"tool-card-body\"><div class=\"desc\">'+esc(t.d)+'</div>';"
  + "h+='<div style=\"display:flex;flex-wrap:wrap;gap:4px;margin-top:8px\">';"
  + "t.acts.forEach(function(a){h+='<span class=\"sop-tag\" style=\"font-size:11px\">'+esc(a)+'</span>';});"
  + "h+='</div></div>';"
  + "h+='</div>';"
  + "});"
  + "h+='</div>';"
  + "h+='</section>';"

  // ── Section 8: 常用对话指令 ──
  + "h+='<section id=\"g-cmds\" style=\"margin-bottom:48px\">';"
  + "h+='<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:20px\">';"
  + "h+='<div style=\"width:3px;height:20px;background:#2563eb;border-radius:2px\"></div>';"
  + "h+='<h2 style=\"font-size:18px;font-weight:700;margin:0;color:var(--tx)\">\\u5e38\\u7528\\u5bf9\\u8bdd\\u6307\\u4ee4</h2>';"
  + "h+='</div>';"
  + "h+='<div class=\"sop-cmd-list\">';"
  + "var cmds8=["
  + "{t:'\\u6ce8\\u518c\\u516c\\u53f8',c:'\\u5e2e\\u6211\\u6ce8\\u518c\\u4e00\\u5bb6\\u516c\\u53f8\\uff1a\\u540d\\u79f0[\\u516c\\u53f8\\u540d]\\uff0c\\u884c\\u4e1a[\\u884c\\u4e1a]\\uff0c\\u521b\\u529e\\u4eba[\\u59d3\\u540d]'},"
  + "{t:'\\u6fc0\\u6d3b\\u516c\\u53f8',c:'\\u6fc0\\u6d3b\\u516c\\u53f8 {company_id}'},"
  + "{t:'\\u5f00\\u542f AI \\u56e2\\u961f',c:'\\u4e3a\\u516c\\u53f8 {company_id} \\u521d\\u59cb\\u5316\\u9ed8\\u8ba4 AI \\u5c97\\u4f4d'},"
  + "{t:'\\u67e5\\u770b\\u516c\\u53f8\\u5217\\u8868',c:'\\u5217\\u51fa\\u6240\\u6709\\u516c\\u53f8'},"
  + "{t:'\\u8d22\\u52a1\\u8bb0\\u8d26',c:'\\u5e2e\\u6211\\u8bb0\\u5f55\\u4e00\\u7b14\\u6536\\u5165\\uff1a\\u91d1\\u989d 5000 \\u5143\\uff0c\\u6765\\u81ea\\u5ba2\\u6237 ABC'},"
  + "{t:'\\u521b\\u5efa\\u53d1\\u7968',c:'\\u4e3a {company_id} \\u521b\\u5efa\\u53d1\\u7968\\uff0c\\u91d1\\u989d 3000 \\u5143'},"
  + "{t:'\\u5408\\u540c\\u7ba1\\u7406',c:'\\u521b\\u5efa\\u4e00\\u4efd\\u670d\\u52a1\\u5408\\u540c\\uff0c\\u5ba2\\u6237 XYZ\\uff0c\\u91d1\\u989d 10000 \\u5143'},"
  + "{t:'OPB \\u753b\\u5e03',c:'\\u67e5\\u770b\\u516c\\u53f8 {company_id} \\u7684 OPB \\u753b\\u5e03'},"
  + "{t:'\\u5185\\u5bb9\\u521b\\u4f5c',c:'\\u4e3a\\u516c\\u53f8 {company_id} \\u521b\\u5efa\\u4e00\\u7bc7\\u6807\\u9898\\u4e3a[\\u6807\\u9898]\\u7684\\u516c\\u4f17\\u53f7\\u6587\\u7ae0'},"
  + "{t:'\\u9879\\u76ee\\u8ddf\\u8e2a',c:'\\u521b\\u5efa\\u9879\\u76ee\\uff1a[\\u9879\\u76ee\\u540d]\\uff0c\\u622a\\u6b62\\u65e5\\u671f [\\u65e5\\u671f]'},"
  + "{t:'\\u751f\\u547d\\u5468\\u671f\\u62a5\\u544a',c:'\\u751f\\u6210\\u516c\\u53f8 {company_id} \\u8fd0\\u8425\\u62a5\\u544a'},"
  + "{t:'\\u8d22\\u52a1\\u6458\\u8981',c:'\\u67e5\\u770b\\u516c\\u53f8 {company_id} \\u672c\\u6708\\u8d22\\u52a1\\u60c5\\u51b5'}"
  + "];"
  + "cmds8.forEach(function(c,i){h+='<div class=\"sop-cmd\"><div class=\"sop-cmd-num\">'+(i+1)+'</div><div class=\"sop-cmd-body\"><div class=\"sop-cmd-title\">'+esc(c.t)+'</div><div class=\"sop-cmd-text\">'+esc(c.c)+'</div></div></div>';});"
  + "h+='</div>';"
  + "h+='</section>';"

  // ── Section 9: Heartbeat自主工作模式 ──
  + "h+='<section id=\"g-hb\" style=\"margin-bottom:48px\">';"
  + "h+='<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:20px\">';"
  + "h+='<div style=\"width:3px;height:20px;background:#2563eb;border-radius:2px\"></div>';"
  + "h+='<h2 style=\"font-size:18px;font-weight:700;margin:0;color:var(--tx)\">Heartbeat \\u81ea\\u4e3b\\u5de5\\u4f5c\\u6a21\\u5f0f</h2>';"
  + "h+='</div>';"
  + "h+='<p style=\"font-size:15px;line-height:1.7;margin-bottom:16px\">OpenClaw \\u5177\\u5907 <b>Heartbeat</b> \\u81ea\\u4e3b Agent \\u80fd\\u529b\\uff0c\\u53ef\\u5728\\u65e0\\u4eba\\u5e72\\u9884\\u7684\\u60c5\\u51b5\\u4e0b\\u6301\\u7eed\\u8fd0\\u884c\\u81ea\\u52a8\\u5316\\u4e1a\\u52a1\\u6d41\\u7a0b\\u3002</p>';"
  + "h+='<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px\">';"
  + "h+='<div>';"
  + "h+='<div style=\"font-weight:700;margin-bottom:8px\">\\u53ef\\u81ea\\u52a8\\u5316\\u7684\\u5de5\\u4f5c</div>';"
  + "h+='<ul style=\"list-style:none;padding:0;margin:0\">';"
  + "var autoTasks=['\\u7a0e\\u52a1\\u7533\\u62a5\\u63d0\\u9192\\uff08\\u5206\\u5b63\\u5ea6\\uff09','\\u5408\\u540c\\u5230\\u671f\\u9884\\u8b66\\uff08\\u63d0\\u524d 7 \\u5929\\uff09','\\u73b0\\u91d1\\u6d41\\u9884\\u8b66\\uff08\\u4f4e\\u4e8e\\u9608\\u5024\\uff09','\\u5185\\u5bb9\\u53d1\\u5e03\\u65e5\\u5386\\u6267\\u884c','\\u5458\\u5de5\\u85aa\\u8d44\\u8ba1\\u7b97\\u63d0\\u9192','\\u9879\\u76ee\\u8fdb\\u5ea6\\u81ea\\u52a8\\u66f4\\u65b0','\\u8fd0\\u8425\\u62a5\\u544a\\u5b9a\\u671f\\u751f\\u6210'];"
  + "autoTasks.forEach(function(t){h+='<li style=\"padding:4px 0;font-size:13px;display:flex;align-items:center;gap:8px\"><span style=\"color:#10b981\">\\u2713</span>'+esc(t)+'</li>';});"
  + "h+='</ul>';"
  + "h+='</div>';"
  + "h+='<div>';"
  + "h+='<div style=\"font-weight:700;margin-bottom:8px\">\\u5f00\\u542f\\u65b9\\u5f0f</div>';"
  + "h+='<div style=\"padding:16px;background:var(--bg,#f8fafc);border-radius:8px;border:1px solid var(--bd,#e2e8f0);margin-bottom:12px\">';"
  + "h+='<div style=\"font-size:13px;line-height:1.6\">';"
  + "h+='<p style=\"margin:0 0 8px\"><b>1. \\u914d\\u7f6e Webhook</b></p>';"
  + "h+='<p style=\"font-size:12px;color:var(--tx2,#64748b);margin:0 0 12px\">\\u5728\\u300a\\u5de5\\u5177\\u914d\\u7f6e\\u300b\\u9875\\u9762\\u586b\\u5199 Webhook \\u5730\\u5740\\uff0c\\u7528\\u4e8e\\u63a5\\u6536\\u5b9a\\u65f6\\u89e6\\u53d1\\u7684\\u81ea\\u52a8\\u5316\\u6d88\\u606f</p>';"
  + "h+='<p style=\"margin:0 0 8px\"><b>2. \\u76d1\\u63a7\\u4e2d\\u5fc3</b></p>';"
  + "h+='<p style=\"font-size:12px;color:var(--tx2,#64748b);margin:0 0 12px\">\\u5728\\u300a\\u76d1\\u63a7\\u4e2d\\u5fc3\\u300b\\u67e5\\u770b\\u5df2\\u81ea\\u52a8\\u751f\\u6210\\u7684\\u63d0\\u9192\\u548c\\u544a\\u8b66\\u4e8b\\u9879</p>';"
  + "h+='<p style=\"margin:0 0 8px\"><b>3. \\u5bf9\\u8bdd\\u6fc0\\u6d3b</b></p>';"
  + "h+='<p style=\"font-size:12px;color:var(--tx2,#64748b);margin:0\">\\u5728 Agent \\u5bf9\\u8bdd\\u4e2d\\u8f93\\u5165\\u5185\\u5bb9\\u5373\\u53ef\\u89e6\\u53d1\\u76f8\\u5e94\\u81ea\\u52a8\\u5316\\u6d41\\u7a0b</p>';"
  + "h+='</div>';"
  + "h+='</div>';"
  + "h+='<div style=\"padding:12px;background:rgba(14,165,233,0.1);border-radius:8px;border:1px solid rgba(14,165,233,0.3)\">';"
  + "h+='<div style=\"font-size:12px;color:var(--tx2,#64748b);line-height:1.5\">\\ud83d\\udca1 <b>\\u63d0\\u793a</b>\\uff1a\\u5f53 Heartbeat \\u68c0\\u6d4b\\u5230\\u5f02\\u5e38\\u65f6\\uff0c\\u4f1a\\u81ea\\u52a8\\u53d1\\u9001\\u901a\\u77e5\\u5230\\u5df2\\u914d\\u7f6e\\u7684 Webhook\\uff0c\\u5b9e\\u73b0\\u771f\\u6b63\\u7684\\u516c\\u53f8\\u81ea\\u52a8\\u5316\\u8fd0\\u8425\\u3002</div>';"
  + "h+='</div>';"
  + "h+='</div>';"
  + "h+='</div>';"
  + "h+='</section>';"

  // ── Quick start card ──
  + "h+='<div style=\"background:linear-gradient(135deg,#1e293b 0%,#1e3a5f 100%);border-radius:12px;padding:28px 32px;margin-bottom:24px\">';"
  + "h+='<h3 style=\"font-size:16px;font-weight:700;color:#fff;margin:0 0 4px\">\\u5feb\\u901f\\u5f00\\u59cb</h3>';"
  + "h+='<p style=\"font-size:13px;color:rgba(255,255,255,0.6);margin:0 0 20px\">\\u5168\\u6d41\\u7a0b\\u4e00\\u952e\\u6307\\u4ee4\\uff0c\\u5c06\\u4e0b\\u9762\\u6307\\u4ee4\\u8f93\\u5165 Agent \\u5bf9\\u8bdd\\u5373\\u53ef\\u5f00\\u59cb</p>';"
  + "h+='<div style=\"display:flex;flex-direction:column;gap:8px\">';"
  + "var qcmds=[{t:'\\u6ce8\\u518c\\u516c\\u53f8',c:'\\u5e2e\\u6211\\u6ce8\\u518c\\u4e00\\u5bb6\\u516c\\u53f8\\uff1a\\u540d\\u79f0[\\u516c\\u53f8\\u540d]\\uff0c\\u884c\\u4e1a[\\u884c\\u4e1a]\\uff0c\\u521b\\u529e\\u4eba[\\u59d3\\u540d]'},{t:'\\u6fc0\\u6d3b\\u516c\\u53f8',c:'\\u6fc0\\u6d3b\\u516c\\u53f8 {company_id}'},{t:'\\u5f00\\u542f AI \\u56e2\\u961f',c:'\\u4e3a\\u516c\\u53f8 {company_id} \\u521d\\u59cb\\u5316\\u9ed8\\u8ba4 AI \\u5c97\\u4f4d'},{t:'\\u8fdb\\u5165 Agent \\u5bf9\\u8bdd',c:'\\u5728\\u516c\\u53f8\\u5217\\u8868\\u70b9\\u51fb\\u5bf9\\u8bdd\\u6309\\u94ae'},{t:'\\u65e5\\u5e38\\u8bb0\\u8d26',c:'\\u5e2e\\u6211\\u8bb0\\u5f55\\u4e00\\u7b14\\u6536\\u5165\\uff1a\\u91d1\\u989d 5000 \\u5143\\uff0c\\u6765\\u81ea\\u5ba2\\u6237 ABC'},{t:'\\u67e5\\u770b\\u63d0\\u9192',c:'\\u5728\\u76d1\\u63a7\\u4e2d\\u5fc3\\u67e5\\u770b\\u81ea\\u52a8\\u751f\\u6210\\u7684\\u63d0\\u9192\\u548c\\u544a\\u8b66'}];"
  + "qcmds.forEach(function(c,i){"
  + "h+='<div style=\"display:flex;gap:12px;align-items:flex-start;background:rgba(255,255,255,0.06);border-radius:8px;padding:12px 14px\">';"
  + "h+='<div style=\"width:22px;height:22px;background:#2563eb;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0\">'+(i+1)+'</div>';"
  + "h+='<div><div style=\"font-size:13px;font-weight:600;color:#fff;margin-bottom:2px\">'+esc(c.t)+'</div>';"
  + "h+='<div style=\"font-size:12px;color:rgba(255,255,255,0.5);font-family:monospace\">'+esc(c.c)+'</div></div>';"
  + "h+='</div>';"
  + "});"
  + "h+='</div>';"
  + "h+='</div>';"

  // close content area + docs layout wrapper
  + "h+='</div>';" // end right content area
  + "h+='</div>';" // end docs layout flex row

  + "return h;"
  + "}"
  // guideTocClick helper
  + "\nfunction guideTocClick(e,id){"
  + "e.preventDefault();"
  + "var el=document.getElementById(id);if(!el)return;"
  + "el.scrollIntoView({behavior:'smooth',block:'start'});"
  + "document.querySelectorAll('[data-toc]').forEach(function(a){a.style.borderLeftColor='transparent';a.style.color='var(--tx2)';a.style.fontWeight='400';});"
  + "var active=document.querySelector('[data-toc=\"'+id+'\"]');"
  + "if(active){active.style.borderLeftColor='#2563eb';active.style.color='#2563eb';active.style.fontWeight='600';}"
  + "}";
}

function getCanvasJs(): string {
  return "\nfunction initCanvasView(){"
  + "fetch('/opc/admin/api/companies').then(function(r){return r.json()}).then(function(companies){"
  + "var sel=document.getElementById('canvas-company-select');"
  + "var curVal=sel.value;"
  + "while(sel.options.length>1)sel.remove(1);"
  + "companies.forEach(function(c){var o=document.createElement('option');o.value=c.id;o.textContent=c.name+(c.status!=='active'?' (\u5df2\u6682\u505c)':'');sel.appendChild(o);});"
  + "if(curVal)sel.value=curVal;"
  + "if(companies.length===1)sel.value=companies[0].id;"
  + "if(sel.value)loadCanvas();"
  + "else{document.getElementById('canvas-content').innerHTML='<div class=\"empty-state\" style=\"margin-top:40px\"><p>\u8bf7\u5148\u9009\u62e9\u516c\u53f8</p></div>';}"
  + "}).catch(function(){document.getElementById('canvas-content').innerHTML='<div class=\"empty-state\"><p>\u52a0\u8f7d\u5931\u8d25</p></div>';});}"
  + "\nfunction loadCanvas(){"
  + "var companyId=document.getElementById('canvas-company-select').value;"
  + "if(!companyId){document.getElementById('canvas-content').innerHTML='<div class=\"empty-state\" style=\"margin-top:40px\"><p>\u8bf7\u9009\u62e9\u516c\u53f8</p></div>';return;}"
  + "document.getElementById('canvas-content').innerHTML='<div class=\"skeleton\" style=\"height:400px\"></div>';"
  + "fetch('/opc/admin/api/canvas?company_id='+encodeURIComponent(companyId)).then(function(r){return r.json()}).then(function(d){"
  + "renderCanvas(d,companyId);"
  + "}).catch(function(){document.getElementById('canvas-content').innerHTML='<div class=\"empty-state\"><p>\u52a0\u8f7d\u5931\u8d25</p></div>';});}"
  + "\nvar CANVAS_FIELDS=["
  + "{key:'track',label:'\u8d5b\u9053',placeholder:'\u6240\u5904\u884c\u4e1a\u6216\u7ec6\u5206\u5e02\u573a\uff0c\u5982\uff1a\u72ec\u7acb\u8bbe\u8ba1\u5e08\u670d\u52a1',group:'customer',icon:'\ud83c\udfaf'},"
  + "{key:'target_customer',label:'\u76ee\u6807\u5ba2\u6237',placeholder:'\u5177\u4f53\u7684\u4eba\u7fa4\u753b\u50cf\uff0c\u5982\uff1a30-45\u5c81\u4e2d\u5c0f\u4f01\u4e1a\u521b\u59cb\u4eba',group:'customer',icon:'\ud83d\udc65'},"
  + "{key:'pain_point',label:'\u6838\u5fc3\u75db\u70b9',placeholder:'\u5ba2\u6237\u6700\u75db\u7684\u95ee\u9898\u662f\u4ec0\u4e48\uff1f',group:'customer',icon:'\ud83d\udd25'},"
  + "{key:'solution',label:'\u89e3\u51b3\u65b9\u6848',placeholder:'\u4f60\u5982\u4f55\u89e3\u51b3\u4e0a\u8ff0\u75db\u70b9\uff1f',group:'value',icon:'\ud83d\udca1'},"
  + "{key:'unique_value',label:'\u72ec\u7279\u4ef7\u503c\u4e3b\u5f20',placeholder:'\u4e3a\u4ec0\u4e48\u5ba2\u6237\u8981\u9009\u62e9\u4f60\u800c\u4e0d\u662f\u7ade\u4e89\u5bf9\u624b\uff1f',group:'value',icon:'\u2728'},"
  + "{key:'channels',label:'\u83b7\u5ba2\u6e20\u9053',placeholder:'\u901a\u8fc7\u4ec0\u4e48\u65b9\u5f0f\u627e\u5230\u76ee\u6807\u5ba2\u6237\uff1f\u5982\uff1a\u516c\u4f17\u53f7\u3001\u8f6c\u4ecb\u3001SEO',group:'value',icon:'\ud83d\udce1'},"
  + "{key:'revenue_model',label:'\u6536\u5165\u6a21\u5f0f',placeholder:'\u5982\u4f55\u53d8\u73b0\uff1f\u9879\u76ee\u5236\u3001\u8ba2\u9605\u5236\u3001\u8bfe\u7a0b\u3001\u5e7f\u544a\u7b49',group:'ops',icon:'\ud83d\udcb0'},"
  + "{key:'cost_structure',label:'\u6210\u672c\u7ed3\u6784',placeholder:'\u4e3b\u8981\u6210\u672c\u9879\uff1a\u65f6\u95f4\u3001\u5de5\u5177\u3001\u5916\u5305\u3001\u8425\u9500',group:'ops',icon:'\ud83d\udcca'},"
  + "{key:'key_resources',label:'\u5173\u952e\u8d44\u6e90',placeholder:'\u4e09\u4e2a\u6c60\u5b50\uff1a\u5185\u5bb9\u6c60\u3001\u4ea7\u54c1\u6c60\u3001\u5ba2\u6237\u6c60',group:'ops',icon:'\ud83c\udfdb'},"
  + "{key:'key_activities',label:'\u5173\u952e\u6d3b\u52a8',placeholder:'\u6bcf\u5929/\u6bcf\u5468\u5fc5\u505a\u7684\u6838\u5fc3\u5de5\u4f5c',group:'ops',icon:'\u26a1'},"
  + "{key:'key_partners',label:'\u5173\u952e\u5408\u4f5c',placeholder:'\u54ea\u4e9b\u4eba\u6216\u673a\u6784\u53ef\u4ee5\u653e\u5927\u4f60\u7684\u80fd\u529b\uff1f',group:'ops',icon:'\ud83e\udd1d'},"
  + "{key:'unfair_advantage',label:'\u4e0d\u516c\u5e73\u4f18\u52bf',placeholder:'\u4eba\u4e0d\u8f7b\u6613\u590d\u5236\u7684\u72ec\u7279\u8d44\u6e90\uff1a\u4e13\u4e1a\u8d44\u8bc1\u3001\u72ec\u5bb6\u4fe1\u6e90\u3001\u5706\u5b50\u8d44\u6e90',group:'strategy',icon:'\ud83d\udd12'},"
  + "{key:'metrics',label:'\u5173\u952e\u6307\u6807',placeholder:'\u8861\u91cf\u4e1a\u52a1\u5065\u5eb7\u7684 KPI\uff1a\u5ba2\u5355\u6570\u3001\u6708\u6536\u5165\u3001\u5ba2\u6237\u6ee1\u610f\u5ea6',group:'strategy',icon:'\ud83d\udcc8'},"
  + "{key:'non_compete',label:'\u975e\u7ade\u4e89\u7b56\u7565',placeholder:'\u5982\u4f55\u907f\u5f00\u76f4\u63a5\u7ade\u4e89\uff1f\u7ec6\u5206\u5c0f\u4f17\u5e02\u573a\u3001\u6700\u7ec8\u5ba2\u6237\u5b9a\u4f4d\u7b49',group:'strategy',icon:'\ud83e\uddf0'},"
  + "{key:'scaling_strategy',label:'\u89c4\u6a21\u5316\u8def\u5f84',placeholder:'\u672a\u6765\u5982\u4f55\u8d85\u8d8a\u4e2a\u4eba\u65f6\u95f4\u5929\u82b1\u677f\uff1f\u8bfe\u7a0b\u5316\u3001\u5de5\u5177\u5316\u3001\u5343\u5929\u8ba1\u5212',group:'strategy',icon:'\ud83d\ude80'},"
  + "{key:'notes',label:'\u5907\u6ce8',placeholder:'\u5176\u4ed6\u8865\u5145\u8bf4\u660e',group:'notes',icon:'\ud83d\udcdd'}"
  + "];"
  + "\nvar CANVAS_GROUPS={"
  + "customer:{label:'\ud83d\udc64 \u5ba2\u6237\u5c42',color:'#3b82f6',bg:'#eff6ff',border:'#bfdbfe'},"
  + "value:{label:'\u2728 \u4ef7\u503c\u5c42',color:'#8b5cf6',bg:'#f5f3ff',border:'#ddd6fe'},"
  + "ops:{label:'\u2699\ufe0f \u8fd0\u8425\u5c42',color:'#f59e0b',bg:'#fffbeb',border:'#fde68a'},"
  + "strategy:{label:'\ud83c\udfaf \u6218\u7565\u5c42',color:'#10b981',bg:'#ecfdf5',border:'#a7f3d0'},"
  + "notes:{label:'\ud83d\udcdd \u5907\u6ce8',color:'#64748b',bg:'#f8fafc',border:'#e2e8f0'}"
  + "};"
  + "\nfunction renderCanvas(d,companyId){"
  + "var el=document.getElementById('canvas-content');"
  + "var canvas=d.canvas;"
  + "if(!canvas){"
  + "el.innerHTML='<div style=\"text-align:center;padding:80px 40px\">';"
  + "el.innerHTML+='<div style=\"font-size:48px;margin-bottom:16px\">\ud83d\uddbc\ufe0f</div>';"
  + "el.innerHTML+='<h3 style=\"margin:0 0 8px;color:var(--tx)\">\u5c1a\u672a\u521b\u5efa OPB \u753b\u5e03</h3>';"
  + "el.innerHTML+='<p style=\"color:var(--tx2);margin-bottom:24px;font-size:14px\">\u57fa\u4e8e\u300a\u4e00\u4eba\u4f01\u4e1a\u65b9\u6cd5\u8bba 2.0\u300b\u7cfb\u7edf\u5316\u8bbe\u8ba1\u4f60\u7684\u4e1a\u52a1\u6218\u7565\u84dd\u56fe</p>';"
  + "el.innerHTML+='<button class=\"btn btn-pri\" style=\"padding:10px 28px;font-size:14px\" onclick=\"initCanvas(\\''+companyId+'\\')\">\u521d\u59cb\u5316 OPB \u753b\u5e03</button></div>';"
  + "return;}"
  + "var pct=d.completion||0;"
  + "var pctColor=pct<30?'#ef4444':pct<70?'#f59e0b':'#10b981';"
  + "var h='<div class=\"card\" style=\"margin-bottom:20px;border-top:3px solid #0f172a\">';"
  + "h+='<div class=\"card-body\" style=\"display:flex;align-items:center;gap:20px;padding:16px 20px\">';"
  + "h+='<div style=\"flex:1\">';"
  + "h+='<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px\">';"
  + "h+='<span style=\"font-size:13px;font-weight:600;color:var(--tx)\">\u753b\u5e03\u5b8c\u6210\u5ea6</span>';"
  + "h+='<span style=\"font-size:22px;font-weight:700;color:'+pctColor+'\">'+pct+'%</span>';"
  + "h+='</div>';"
  + "h+='<div style=\"background:#e2e8f0;border-radius:999px;height:10px;overflow:hidden\">';"
  + "h+='<div style=\"width:'+pct+'%;background:'+pctColor+';height:100%;border-radius:999px;transition:width .4s ease\"></div></div>';"
  + "h+='<div style=\"font-size:12px;color:var(--tx2);margin-top:6px\">';"
  + "h+='\u5df2\u586b '+d.filled+' \u4e2a\u6a21\u5757\uff0c\u8fd8\u6709 '+((d.total_fields||15)-d.filled)+' \u4e2a\u6a21\u5757\u5f85\u5b8c\u5584</div></div>';"
  + "h+='<button class=\"btn btn-pri\" onclick=\"saveCanvas(\\''+companyId+'\\')\" style=\"white-space:nowrap;padding:10px 24px\">\ud83d\udcbe \u4fdd\u5b58\u753b\u5e03</button>';"
  + "h+='</div></div>';"
  + "var groupOrder=['customer','value','ops','strategy','notes'];"
  + "groupOrder.forEach(function(gk){"
  + "var gFields=CANVAS_FIELDS.filter(function(f){return f.group===gk;});"
  + "if(!gFields.length)return;"
  + "var g=CANVAS_GROUPS[gk];"
  + "h+='<div style=\"margin-bottom:8px\">';"
  + "h+='<div style=\"font-size:11px;font-weight:700;color:'+g.color+';letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:6px\">';"
  + "h+='<span style=\"display:inline-block;width:3px;height:14px;background:'+g.color+';border-radius:2px\"></span>'+esc(g.label)+'</div>';"
  + "h+='<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-bottom:20px\">';"
  + "gFields.forEach(function(f){"
  + "var val=canvas[f.key]||'';"
  + "var filled=val.trim()!=='';"
  + "h+='<div style=\"background:var(--card);border:1px solid '+(filled?g.color:'var(--bd)')+';border-left:3px solid '+g.color+';border-radius:8px;overflow:hidden;transition:border-color .2s\">';"
  + "h+='<div style=\"padding:10px 12px 6px;display:flex;align-items:center;gap:6px\">';"
  + "h+='<span style=\"font-size:14px\">'+f.icon+'</span>';"
  + "h+='<span style=\"font-size:12px;font-weight:600;color:var(--tx)\">'+esc(f.label)+'</span>';"
  + "if(filled)h+='<span style=\"margin-left:auto;font-size:10px;background:'+g.bg+';color:'+g.color+';padding:1px 6px;border-radius:20px;font-weight:600\">\u5df2\u586b</span>';"
  + "h+='</div>';"
  + "h+='<textarea id=\"canvas-'+f.key+'\" rows=\"3\" style=\"width:100%;padding:8px 12px;border:none;border-top:1px solid var(--bd);font-size:13px;font-family:var(--font);resize:vertical;background:'+(filled?g.bg:'var(--bg)')+';color:var(--tx);box-sizing:border-box;outline:none\" placeholder=\"'+esc(f.placeholder)+'\">'+esc(val)+'</textarea>';"
  + "h+='</div>';"
  + "});"
  + "h+='</div></div>';"
  + "});"
  + "el.innerHTML=h;}"
  + "\nfunction initCanvas(companyId){"
  + "fetch('/opc/admin/api/canvas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({company_id:companyId})})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok||d.canvas){loadCanvas();}else{showToast(d.error||'\u521b\u5efa\u5931\u8d25');}}).catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});}"
  + "\nfunction saveCanvas(companyId){"
  + "var data={company_id:companyId};"
  + "CANVAS_FIELDS.forEach(function(f){var el=document.getElementById('canvas-'+f.key);if(el)data[f.key]=el.value;});"
  + "fetch('/opc/admin/api/canvas',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})"
  + ".then(function(r){return r.json()}).then(function(d){if(d.ok){showToast('\u753b\u5e03\u5df2\u4fdd\u5b58');loadCanvas();}else{showToast(d.error||'\u4fdd\u5b58\u5931\u8d25');}}).catch(function(){showToast('\u8bf7\u6c42\u5931\u8d25');});}"
  + ";";
}

/* ── Route registration ───────────────────────────────────── */

export function registerConfigUi(api: OpenClawPluginApi, db: OpcDatabase, gatewayToken?: string): void {
  api.registerHttpHandler(async (req, res) => {
    const rawUrl = req.url ?? "";
    const urlObj = new URL(rawUrl, "http://localhost");
    const pathname = urlObj.pathname;
    const method = req.method?.toUpperCase() ?? "GET";

    if (!pathname.startsWith("/opc/admin")) {
      return false;
    }

    // API 端点需要认证
    if (pathname.startsWith("/opc/admin/api/") && gatewayToken) {
      if (method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return true;
      }
      const authHeader = req.headers["authorization"];
      const match = authHeader?.match(/^Bearer\s+(.+)$/i);
      const token = match?.[1];
      if (token !== gatewayToken) {
        res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "认证令牌无效", code: "AUTH_INVALID" }));
        return true;
      }
    }

    try {
      // Config API: GET
      if (pathname === "/opc/admin/api/config" && method === "GET") {
        const rows = db.query("SELECT key, value FROM opc_tool_config") as { key: string; value: string }[];
        const config: Record<string, string> = {};
        for (const row of rows) {
          config[row.key] = row.value;
        }
        sendJson(res, config);
        return true;
      }

      // Config API: POST
      if (pathname === "/opc/admin/api/config" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, string>;
        for (const [key, value] of Object.entries(data)) {
          db.execute(
            `INSERT INTO opc_tool_config (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            key, value,
          );
        }
        sendJson(res, { ok: true });
        return true;
      }

      // ── Feishu Channel APIs ──
      if (pathname === "/opc/admin/api/feishu/status" && method === "GET") {
        const cfg = api.runtime.config.loadConfig();
        const feishuCfg = (cfg as Record<string, unknown>).channels as Record<string, unknown> | undefined;
        const feishu = feishuCfg?.feishu as Record<string, unknown> | undefined;
        const accounts = feishu?.accounts as Record<string, Record<string, string>> | undefined;
        const main = accounts?.main;
        sendJson(res, {
          configured: !!(main?.appId && main.appId !== "YOUR_FEISHU_APP_ID"),
          enabled: feishu?.enabled ?? false,
          appId: main?.appId ? "***" + main.appId.slice(-4) : "",
          botName: main?.botName ?? "",
          dmPolicy: feishu?.dmPolicy ?? "pairing",
          streaming: feishu?.streaming ?? false,
        });
        return true;
      }

      if (pathname === "/opc/admin/api/feishu/config" && method === "POST") {
        const body = JSON.parse(await readBody(req)) as {
          appId?: string; appSecret?: string; botName?: string; dmPolicy?: string;
        };
        const cfg = api.runtime.config.loadConfig() as Record<string, unknown>;
        const channels = (cfg.channels ?? {}) as Record<string, unknown>;
        const existing = (channels.feishu ?? {}) as Record<string, unknown>;
        channels.feishu = {
          ...existing,
          enabled: true,
          dmPolicy: body.dmPolicy ?? "pairing",
          groupPolicy: "open",
          streaming: true,
          accounts: {
            main: {
              appId: body.appId || ((existing.accounts as Record<string, Record<string, string>> | undefined)?.main?.appId ?? ""),
              appSecret: body.appSecret || ((existing.accounts as Record<string, Record<string, string>> | undefined)?.main?.appSecret ?? ""),
              botName: body.botName || "\u661F\u73AFOPC\u52A9\u624B",
            },
          },
        };
        cfg.channels = channels;
        await api.runtime.config.writeConfigFile(cfg);
        sendJson(res, { ok: true, message: "\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u7CFB\u7EDF\u5C06\u81EA\u52A8\u91CD\u542F\u4EE5\u5E94\u7528\u65B0\u914D\u7F6E" });
        return true;
      }

      if (pathname === "/opc/admin/api/feishu/pairing" && method === "GET") {
        const pairingPath = path.join(os.homedir(), ".openclaw", "oauth", "feishu-pairing.json");
        let pairing: unknown = { approved: [], pending: [] };
        try {
          if (fs.existsSync(pairingPath)) {
            pairing = JSON.parse(fs.readFileSync(pairingPath, "utf-8"));
          }
        } catch { /* ignore */ }
        sendJson(res, pairing);
        return true;
      }

      if (pathname === "/opc/admin/api/feishu/pairing/approve" && method === "POST") {
        const body = JSON.parse(await readBody(req)) as { openId?: string; approve?: boolean };
        if (!body.openId) {
          sendJson(res, { ok: false, error: "openId required" }, 400);
          return true;
        }
        const allowPath = path.join(os.homedir(), ".openclaw", "oauth", "feishu-allowFrom.json");
        let allowList: string[] = [];
        try {
          if (fs.existsSync(allowPath)) {
            allowList = JSON.parse(fs.readFileSync(allowPath, "utf-8")) as string[];
          }
        } catch { /* ignore */ }
        if (body.approve) {
          if (!allowList.includes(body.openId)) allowList.push(body.openId);
        } else {
          allowList = allowList.filter((id) => id !== body.openId);
        }
        const dir = path.dirname(allowPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(allowPath, JSON.stringify(allowList, null, 2));
        // Also update pairing file to move from pending to approved
        const pairingPath = path.join(os.homedir(), ".openclaw", "oauth", "feishu-pairing.json");
        try {
          if (fs.existsSync(pairingPath)) {
            const pairing = JSON.parse(fs.readFileSync(pairingPath, "utf-8")) as {
              approved?: { openId: string; note?: string }[];
              pending?: { openId: string }[];
            };
            if (body.approve && pairing.pending) {
              const found = pairing.pending.find((p) => p.openId === body.openId);
              if (found) {
                pairing.pending = pairing.pending.filter((p) => p.openId !== body.openId);
                pairing.approved = pairing.approved ?? [];
                pairing.approved.push({ openId: body.openId, note: "" });
                fs.writeFileSync(pairingPath, JSON.stringify(pairing, null, 2));
              }
            } else if (!body.approve && pairing.pending) {
              pairing.pending = pairing.pending.filter((p) => p.openId !== body.openId);
              fs.writeFileSync(pairingPath, JSON.stringify(pairing, null, 2));
            }
          }
        } catch { /* ignore */ }
        sendJson(res, { ok: true });
        return true;
      }

      // Enhanced Dashboard API
      if (pathname === "/opc/admin/api/dashboard/enhanced" && method === "GET") {
        sendJson(res, handleDashboardEnhanced(db));
        return true;
      }

      // Companies List API (with search/filter/pagination)
      if (pathname === "/opc/admin/api/companies/list" && method === "GET") {
        sendJson(res, handleCompaniesList(db, urlObj));
        return true;
      }

      // Company Detail API
      const detailMatch = pathname.match(/^\/opc\/admin\/api\/companies\/([^/]+)\/detail$/);
      if (detailMatch && method === "GET") {
        const result = handleCompanyDetail(db, detailMatch[1]);
        if (!result) {
          sendJson(res, { error: "Company not found" }, 404);
        } else {
          sendJson(res, result);
        }
        return true;
      }

      // Finance Overview API
      if (pathname === "/opc/admin/api/finance/overview" && method === "GET") {
        sendJson(res, handleFinanceOverview(db));
        return true;
      }

      // Monitoring API
      if (pathname === "/opc/admin/api/monitoring" && method === "GET") {
        sendJson(res, handleMonitoring(db));
        return true;
      }

      // Alert Dismiss API
      const alertMatch = pathname.match(/^\/opc\/admin\/api\/alerts\/([^/]+)\/dismiss$/);
      if (alertMatch && method === "POST") {
        sendJson(res, handleAlertDismiss(db, alertMatch[1]));
        return true;
      }

      // ── CSV 导出 API ────────────────────────────────────────────

      // ── 内联编辑 PATCH API ──────────────────────────────────────

      const companyEditMatch = pathname.match(/^\/opc\/admin\/api\/companies\/([^/]+)\/edit$/);
      if (companyEditMatch && method === "PATCH") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const updated = db.updateCompany(companyEditMatch[1], data);
        if (!updated) { sendJson(res, { ok: false, error: "公司不存在" }, 404); return true; }
        sendJson(res, { ok: true, company: updated });
        return true;
      }

      const contactEditMatch = pathname.match(/^\/opc\/admin\/api\/contacts\/([^/]+)\/edit$/);
      if (contactEditMatch && method === "PATCH") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const updated = db.updateContact(contactEditMatch[1], data);
        if (!updated) { sendJson(res, { ok: false, error: "联系人不存在" }, 404); return true; }
        sendJson(res, { ok: true, contact: updated });
        return true;
      }

      const contractEditMatch = pathname.match(/^\/opc\/admin\/api\/contracts\/([^/]+)\/edit$/);
      if (contractEditMatch && method === "PATCH") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, string>;
        const ALLOWED = new Set(["title", "counterparty", "amount", "status",
          "start_date", "end_date", "signed_date", "key_terms", "notes"]);
        const safeData: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) {
          if (ALLOWED.has(k)) safeData[k] = v;
        }
        const now = new Date().toISOString();
        db.execute(
          `UPDATE opc_contracts SET ${Object.keys(safeData).map(k => `${k} = ?`).join(", ")}, updated_at = ?
           WHERE id = ?`,
          ...Object.values(safeData), now, contractEditMatch[1],
        );
        sendJson(res, { ok: true });
        return true;
      }
      function sendCsv(filename: string, rows: Record<string, unknown>[]): void {
        if (rows.length === 0) {
          res.writeHead(200, {
            "Content-Type": "text/csv; charset=utf-8-sig",
            "Content-Disposition": `attachment; filename="${filename}"`,
          });
          res.end("\uFEFF");
          return;
        }
        const headers = Object.keys(rows[0]);
        const escape = (v: unknown) => {
          const s = v === null || v === undefined ? "" : String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const csv = [
          headers.join(","),
          ...rows.map(r => headers.map(h => escape(r[h])).join(",")),
        ].join("\r\n");
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8-sig",
          "Content-Disposition": `attachment; filename="${filename}"`,
        });
        res.end("\uFEFF" + csv);
      }

      if (pathname === "/opc/admin/api/export/companies" && method === "GET") {
        const rows = db.query(
          `SELECT id, name, industry, status, owner_name, owner_contact,
                  registered_capital, description, created_at FROM opc_companies
           ORDER BY created_at DESC`,
        ) as Record<string, unknown>[];
        sendCsv("companies.csv", rows);
        return true;
      }

      if (pathname === "/opc/admin/api/export/contracts" && method === "GET") {
        const rows = db.query(
          `SELECT c.id, co.name as company_name, c.title, c.counterparty, c.contract_type,
                  c.amount, c.status, c.start_date, c.end_date, c.signed_date, c.created_at
           FROM opc_contracts c LEFT JOIN opc_companies co ON c.company_id = co.id
           ORDER BY c.created_at DESC`,
        ) as Record<string, unknown>[];
        sendCsv("contracts.csv", rows);
        return true;
      }

      if (pathname === "/opc/admin/api/export/transactions" && method === "GET") {
        const companyFilter = urlObj.searchParams.get("company_id");
        const rows = companyFilter
          ? db.query(
              `SELECT t.id, co.name as company_name, t.type, t.category, t.amount,
                      t.description, t.transaction_date, t.created_at
               FROM opc_transactions t LEFT JOIN opc_companies co ON t.company_id = co.id
               WHERE t.company_id = ? ORDER BY t.transaction_date DESC`,
              companyFilter,
            ) as Record<string, unknown>[]
          : db.query(
              `SELECT t.id, co.name as company_name, t.type, t.category, t.amount,
                      t.description, t.transaction_date, t.created_at
               FROM opc_transactions t LEFT JOIN opc_companies co ON t.company_id = co.id
               ORDER BY t.transaction_date DESC`,
            ) as Record<string, unknown>[];
        sendCsv("transactions.csv", rows);
        return true;
      }

      // Closure API: summary
      if (pathname === "/opc/admin/api/closure/summary" && method === "GET") {
        const acqSummary = db.queryOne(
          `SELECT COUNT(*) as total_acquisitions,
                  COALESCE(SUM(loss_amount),0) as total_loss,
                  COALESCE(SUM(tax_deduction),0) as total_tax_deduction
           FROM opc_acquisition_cases`,
        ) as Record<string, number>;
        const pkgSummary = db.queryOne(
          `SELECT COUNT(*) as total_packages FROM opc_asset_packages`,
        ) as Record<string, number>;
        const transferSummary = db.queryOne(
          `SELECT COALESCE(SUM(transfer_price),0) as total_transfer_price,
                  COALESCE(SUM(sci_loan_actual),0) as total_sci_loan
           FROM opc_ct_transfers`,
        ) as Record<string, number>;
        const feeSummary = db.queryOne(
          `SELECT COALESCE(SUM(fee_amount),0) as total_financing_fee,
                  COALESCE(SUM(CASE WHEN status='paid' THEN fee_amount ELSE 0 END),0) as collected_fee
           FROM opc_financing_fees`,
        ) as Record<string, number>;
        sendJson(res, { ...acqSummary, ...pkgSummary, ...transferSummary, ...feeSummary });
        return true;
      }

      // Closure API: acquisitions list
      if (pathname === "/opc/admin/api/closure/acquisitions" && method === "GET") {
        const rows = db.query(
          `SELECT a.*, c.name as company_name FROM opc_acquisition_cases a
           LEFT JOIN opc_companies c ON a.company_id = c.id
           ORDER BY a.created_at DESC`,
        );
        sendJson(res, rows);
        return true;
      }

      // Closure API: asset packages list
      if (pathname === "/opc/admin/api/closure/packages" && method === "GET") {
        sendJson(res, db.query("SELECT * FROM opc_asset_packages ORDER BY created_at DESC"));
        return true;
      }

      // Closure API: ct transfers list
      if (pathname === "/opc/admin/api/closure/transfers" && method === "GET") {
        const rows = db.query(
          `SELECT t.*, p.name as package_name FROM opc_ct_transfers t
           LEFT JOIN opc_asset_packages p ON t.package_id = p.id
           ORDER BY t.created_at DESC`,
        );
        sendJson(res, rows);
        return true;
      }

      // ── Staff API ───────────────────────────────────────────────

      // GET single staff record
      const staffGetMatch = pathname.match(/^\/opc\/admin\/api\/staff\/([^/]+)$/);
      if (staffGetMatch && method === "GET") {
        const row = db.queryOne("SELECT * FROM opc_staff_config WHERE id = ?", staffGetMatch[1]);
        if (!row) { sendJson(res, { error: "记录不存在" }, 404); return true; }
        sendJson(res, row);
        return true;
      }

      // PATCH toggle enabled
      const staffToggleMatch = pathname.match(/^\/opc\/admin\/api\/staff\/([^/]+)\/toggle$/);
      if (staffToggleMatch && method === "PATCH") {
        const body = await readBody(req);
        const { enabled } = JSON.parse(body) as { enabled: number };
        const now = new Date().toISOString();
        db.execute(
          "UPDATE opc_staff_config SET enabled = ?, updated_at = ? WHERE id = ?",
          enabled, now, staffToggleMatch[1],
        );
        sendJson(res, { ok: true });
        return true;
      }

      // PATCH edit staff
      const staffEditMatch = pathname.match(/^\/opc\/admin\/api\/staff\/([^/]+)\/edit$/);
      if (staffEditMatch && method === "PATCH") {
        const body = await readBody(req);
        const { role_name, system_prompt, notes } = JSON.parse(body) as { role_name?: string; system_prompt?: string; notes?: string };
        const now = new Date().toISOString();
        const sets: string[] = ["updated_at = ?"];
        const vals: unknown[] = [now];
        if (role_name !== undefined) { sets.push("role_name = ?"); vals.push(role_name); }
        if (system_prompt !== undefined) { sets.push("system_prompt = ?"); vals.push(system_prompt); }
        if (notes !== undefined) { sets.push("notes = ?"); vals.push(notes); }
        vals.push(staffEditMatch[1]);
        db.execute(`UPDATE opc_staff_config SET ${sets.join(", ")} WHERE id = ?`, ...vals);
        sendJson(res, { ok: true });
        return true;
      }

      // POST init default staff for a company
      const staffInitMatch = pathname.match(/^\/opc\/admin\/api\/staff\/([^/]+)\/init$/);
      if (staffInitMatch && method === "POST") {
        const companyId = staffInitMatch[1];
        const company = db.queryOne("SELECT id FROM opc_companies WHERE id = ?", companyId);
        if (!company) { sendJson(res, { ok: false, error: "公司不存在" }, 404); return true; }
        const BUILTIN: Record<string, { name: string; prompt: string; skills: string[] }> = {
          admin: { name: "行政助理", prompt: "你是公司行政助理，负责日程管理、文件归档、会议安排、行政事务协调。用专业、简洁的方式处理行政工作。", skills: ["schedule", "document", "meeting"] },
          hr: { name: "HR 专员", prompt: "你是公司 HR 专员，负责员工招聘、入职手续、薪酬核算、劳动合同管理、社保公积金事务。熟悉劳动法规。", skills: ["recruit", "payroll", "labor-law"] },
          finance: { name: "财务顾问", prompt: "你是公司财务顾问，负责账务记录、发票管理、税务申报、现金流分析、财务报表。熟悉中国财税法规。", skills: ["bookkeeping", "tax", "invoice", "cashflow"] },
          legal: { name: "法务助理", prompt: "你是公司法务助理，负责合同审查、风险评估、合规检查、法律文件起草。熟悉中国商业法律。", skills: ["contract-review", "compliance", "risk-assessment"] },
          marketing: { name: "市场推广", prompt: "你是公司市场推广专员，负责品牌推广、内容营销、社交媒体运营、客户获取策略。", skills: ["content", "social-media", "brand"] },
          ops: { name: "运营经理", prompt: "你是公司运营经理，负责项目管理、流程优化、供应链协调、KPI 跟踪与分析。", skills: ["project-mgmt", "process", "kpi"] },
        };
        const now = new Date().toISOString();
        let created = 0;
        for (const [role, def] of Object.entries(BUILTIN)) {
          const exists = db.queryOne("SELECT id FROM opc_staff_config WHERE company_id = ? AND role = ?", companyId, role);
          if (exists) continue;
          const id = db.genId();
          db.execute(
            `INSERT INTO opc_staff_config (id, company_id, role, role_name, enabled, system_prompt, skills, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, ?, ?, '', ?, ?)`,
            id, companyId, role, def.name, def.prompt, JSON.stringify(def.skills), now, now,
          );
          created++;
        }
        sendJson(res, { ok: true, created });
        return true;
      }

      // ── Company edit: allow status field ─────────────────────────

      // Transaction create
      if (pathname === "/opc/admin/api/transactions/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, data.company_id, data.type, data.category, Number(data.amount) || 0,
          data.description ?? "", data.counterparty ?? "",
          data.transaction_date ?? now.slice(0, 10), now,
        );
        sendJson(res, { ok: true, id });
        return true;
      }

      // HR record create
      if (pathname === "/opc/admin/api/hr/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_hr_records (id, company_id, employee_name, position, salary, social_insurance, housing_fund, start_date, end_date, contract_type, status, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?, '', ?, 'active', '', ?, ?)`,
          id, data.company_id, data.employee_name, data.position,
          Number(data.salary) || 0, data.start_date ?? "",
          data.contract_type ?? "full_time", now, now,
        );
        sendJson(res, { ok: true, id });
        return true;
      }

      // Project create
      if (pathname === "/opc/admin/api/projects/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_projects (id, company_id, name, description, status, start_date, end_date, budget, spent, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'planning', ?, ?, ?, 0, ?, ?)`,
          id, data.company_id, data.name, data.description ?? "",
          data.start_date ?? "", data.end_date ?? "",
          Number(data.budget) || 0, now, now,
        );
        sendJson(res, { ok: true, id });
        return true;
      }

      // Contract create
      if (pathname === "/opc/admin/api/contracts/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_contracts (id, company_id, title, counterparty, contract_type, amount, start_date, end_date, status, key_terms, risk_notes, reminder_date, signed_date, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, '', '', '', ?, ?)`,
          id, data.company_id, data.title, data.counterparty,
          data.contract_type ?? "其他", Number(data.amount) || 0,
          data.start_date ?? "", data.end_date ?? "",
          data.key_terms ?? "", data.risk_notes ?? "", now, now,
        );
        sendJson(res, { ok: true, id });
        return true;
      }

      // Closure API: create acquisition
      if (pathname === "/opc/admin/api/closure/acquisitions/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        const lossAmount = Number(data.loss_amount) || 0;
        const taxDeduction = lossAmount * 0.25;
        db.execute(
          `INSERT INTO opc_acquisition_cases
             (id, company_id, acquirer_id, case_type, status, trigger_reason,
              acquisition_price, loss_amount, tax_deduction, initiated_date, notes, created_at, updated_at)
           VALUES (?, ?, 'starriver', 'acquisition', 'evaluating', ?, ?, ?, ?, date('now'), ?, ?, ?)`,
          id, data.company_id, data.trigger_reason,
          Number(data.acquisition_price) || 0, lossAmount, taxDeduction,
          data.notes ?? "", now, now,
        );
        db.execute("UPDATE opc_companies SET status = 'acquired', updated_at = ? WHERE id = ?", now, data.company_id);
        sendJson(res, { ok: true, id });
        return true;
      }

      // Closure API: create asset package
      if (pathname === "/opc/admin/api/closure/packages/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_asset_packages
             (id, name, description, status, total_valuation, company_count, sci_tech_certified, notes, created_at, updated_at)
           VALUES (?, ?, ?, 'assembling', 0, 0, 0, ?, ?, ?)`,
          id, data.name, data.description ?? "", data.notes ?? "", now, now,
        );
        sendJson(res, { ok: true, id });
        return true;
      }

      // Closure API: create CT transfer
      if (pathname === "/opc/admin/api/closure/transfers/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_ct_transfers
             (id, package_id, ct_company, transfer_price, status, sci_loan_target, sci_loan_actual, transfer_date, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'negotiating', ?, 0, ?, ?, ?, ?)`,
          id, data.package_id, data.ct_company, Number(data.transfer_price) || 0,
          Number(data.sci_loan_target) || 0, data.transfer_date ?? "", data.notes ?? "", now, now,
        );
        db.execute("UPDATE opc_asset_packages SET status = 'transferred', updated_at = ? WHERE id = ?", now, data.package_id);
        sendJson(res, { ok: true, id });
        return true;
      }

      // Investment: list rounds by company
      if (pathname === "/opc/admin/api/investment/rounds" && method === "GET") {
        const companyId = urlObj.searchParams.get("company_id") ?? "";
        const rows = companyId
          ? db.query("SELECT * FROM opc_investment_rounds WHERE company_id = ? ORDER BY created_at", companyId)
          : db.query("SELECT * FROM opc_investment_rounds ORDER BY created_at DESC");
        sendJson(res, rows);
        return true;
      }

      // Investment: create round
      if (pathname === "/opc/admin/api/investment/rounds/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_investment_rounds
             (id, company_id, round_name, amount, valuation_pre, valuation_post, status, lead_investor, close_date, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'planning', ?, ?, ?, ?)`,
          id, data.company_id, data.round_name, Number(data.amount) || 0,
          Number(data.valuation_pre) || 0, Number(data.valuation_post) || 0,
          data.lead_investor ?? "", data.close_date ?? "", data.notes ?? "", now,
        );
        sendJson(res, { ok: true, id });
        return true;
      }

      // Investment: create investor
      if (pathname === "/opc/admin/api/investment/investors/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_investors
             (id, round_id, company_id, name, type, amount, equity_percent, contact, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?)`,
          id, data.round_id ?? "", data.company_id, data.name,
          data.type ?? "individual", Number(data.amount) || 0,
          Number(data.equity_percent) || 0, data.contact ?? "", now,
        );
        sendJson(res, { ok: true, id });
        return true;
      }

      // Lifecycle: create milestone
      if (pathname === "/opc/admin/api/lifecycle/milestones/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_milestones (id, company_id, title, category, target_date, status, description, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
          id, data.company_id, data.title, data.category ?? "business",
          data.target_date ?? "", data.description ?? "", now,
        );
        sendJson(res, { ok: true, id });
        return true;
      }

      // Lifecycle: create event
      if (pathname === "/opc/admin/api/lifecycle/events/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_lifecycle_events (id, company_id, event_type, title, event_date, impact, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          id, data.company_id, data.event_type ?? "", data.title,
          data.event_date ?? now.slice(0, 10), data.impact ?? "", data.description ?? "", now,
        );
        sendJson(res, { ok: true, id });
        return true;
      }

      // Monitoring: create metric
      if (pathname === "/opc/admin/api/monitoring/metrics/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_metrics (id, company_id, name, value, unit, category, recorded_at, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, data.company_id, data.name, Number(data.value) || 0,
          data.unit ?? "", data.category ?? "", now, data.notes ?? "", now,
        );
        sendJson(res, { ok: true, id });
        return true;
      }

      // Services: list by company
      if (pathname === "/opc/admin/api/services" && method === "GET") {
        const companyId = urlObj.searchParams.get("company_id") ?? "";
        const rows = companyId
          ? db.query("SELECT * FROM opc_services WHERE company_id = ? ORDER BY status, name", companyId)
          : db.query("SELECT * FROM opc_services ORDER BY created_at DESC");
        sendJson(res, rows);
        return true;
      }

      // Procurement: create order
      if (pathname === "/opc/admin/api/procurement/orders/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_procurement_orders (id, company_id, service_id, title, amount, status, order_date, notes, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
          id, data.company_id, data.service_id ?? "", data.title,
          Number(data.amount) || 0, data.order_date ?? now.slice(0, 10), data.notes ?? "", now,
        );
        sendJson(res, { ok: true, id });
        return true;
      }

      // Media: create content
      if (pathname === "/opc/admin/api/media/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = db.genId();
        const now = new Date().toISOString();
        db.execute(
          `INSERT INTO opc_media_content (id, company_id, title, platform, content_type, body, status, scheduled_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, data.company_id, data.title, data.platform ?? "",
          data.content_type ?? "", data.body ?? "",
          data.status ?? "draft", data.scheduled_date ?? null, now,
        );
        sendJson(res, { ok: true, id });
        return true;
      }

      // OPB Canvas API: GET /opc/admin/api/canvas?company_id=xxx
      if (pathname === "/opc/admin/api/canvas" && method === "GET") {
        const companyId = urlObj.searchParams.get("company_id") ?? "";
        if (!companyId) { sendJson(res, { error: "company_id required" }, 400); return true; }
        const canvas = db.queryOne("SELECT * FROM opc_opb_canvas WHERE company_id = ?", companyId) as Record<string, unknown> | null;
        if (!canvas) { sendJson(res, { canvas: null }); return true; }
        const OPB_FIELD_KEYS = ["track","target_customer","pain_point","solution","unique_value","channels","revenue_model","cost_structure","key_resources","key_activities","key_partners","unfair_advantage","metrics","non_compete","scaling_strategy"];
        const filled = OPB_FIELD_KEYS.filter(f => canvas[f] && String(canvas[f]).trim() !== "").length;
        const completion = Math.round(filled / OPB_FIELD_KEYS.length * 100);
        sendJson(res, { canvas, completion, total_fields: OPB_FIELD_KEYS.length, filled });
        return true;
      }

      // OPB Canvas API: POST /opc/admin/api/canvas (init)
      if (pathname === "/opc/admin/api/canvas" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, string>;
        const companyId = data.company_id;
        if (!companyId) { sendJson(res, { error: "company_id required" }, 400); return true; }
        const existing = db.queryOne("SELECT id FROM opc_opb_canvas WHERE company_id = ?", companyId) as { id: string } | null;
        if (existing) { sendJson(res, { ok: true, canvas: db.queryOne("SELECT * FROM opc_opb_canvas WHERE id = ?", existing.id) }); return true; }
        const id = db.genId();
        const now = new Date().toISOString();
        const OPB_FIELD_KEYS = ["track","target_customer","pain_point","solution","unique_value","channels","revenue_model","cost_structure","key_resources","key_activities","key_partners","unfair_advantage","metrics","non_compete","scaling_strategy","notes"];
        db.execute(
          `INSERT INTO opc_opb_canvas (id, company_id, ${OPB_FIELD_KEYS.join(", ")}, created_at, updated_at)
           VALUES (?, ?, ${OPB_FIELD_KEYS.map(() => "?").join(", ")}, ?, ?)`,
          id, companyId, ...OPB_FIELD_KEYS.map(f => data[f] ?? ""), now, now,
        );
        sendJson(res, { ok: true, canvas: db.queryOne("SELECT * FROM opc_opb_canvas WHERE id = ?", id) });
        return true;
      }

      // OPB Canvas API: PUT /opc/admin/api/canvas (update)
      if (pathname === "/opc/admin/api/canvas" && method === "PUT") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, string>;
        const companyId = data.company_id;
        if (!companyId) { sendJson(res, { error: "company_id required" }, 400); return true; }
        const existing = db.queryOne("SELECT id FROM opc_opb_canvas WHERE company_id = ?", companyId) as { id: string } | null;
        if (!existing) { sendJson(res, { error: "canvas not found" }, 404); return true; }
        const OPB_FIELD_KEYS = ["track","target_customer","pain_point","solution","unique_value","channels","revenue_model","cost_structure","key_resources","key_activities","key_partners","unfair_advantage","metrics","non_compete","scaling_strategy","notes"];
        const updates: string[] = [];
        const vals: unknown[] = [];
        for (const f of OPB_FIELD_KEYS) {
          if (data[f] !== undefined) { updates.push(`${f} = ?`); vals.push(data[f]); }
        }
        const now = new Date().toISOString();
        updates.push("updated_at = ?");
        vals.push(now, existing.id);
        if (updates.length > 1) {
          db.execute(`UPDATE opc_opb_canvas SET ${updates.join(", ")} WHERE id = ?`, ...vals);
        }
        sendJson(res, { ok: true, canvas: db.queryOne("SELECT * FROM opc_opb_canvas WHERE id = ?", existing.id) });
        return true;
      }

      // Skills API: GET installed skills (builtin + custom)
      if (pathname === "/opc/admin/api/skills/installed" && method === "GET") {
        // 扫描 SKILL.md 目录，解析 name/description/emoji
        function scanSkillsDir(dir: string, source: string): { name: string; desc: string; emoji: string; source: string }[] {
          const result: { name: string; desc: string; emoji: string; source: string }[] = [];
          try {
            if (!fs.existsSync(dir)) return result;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (!entry.isDirectory()) continue;
              const skillMdPath = path.join(dir, entry.name, "SKILL.md");
              if (!fs.existsSync(skillMdPath)) continue;
              const content = fs.readFileSync(skillMdPath, "utf8");
              const nameMatch = content.match(/^name:\s*(.+)$/m);
              const descSingleMatch = content.match(/^description:\s*(?!\|)(.+)$/m);
              const descBlockMatch = content.match(/^description:\s*\|\s*\n([\s\S]*?)(?=\n\S|\n---|\n$|$)/m);
              const rawDesc = descSingleMatch
                ? descSingleMatch[1].trim()
                : descBlockMatch
                  ? descBlockMatch[1].replace(/^\s+/gm, "").split("\n")[0].trim()
                  : "";
              const emojiMatch = content.match(/"emoji"\s*:\s*"([^"]+)"/);
              result.push({
                name: nameMatch ? nameMatch[1].trim() : entry.name,
                desc: rawDesc,
                emoji: emojiMatch ? emojiMatch[1].trim() : "",
                source,
              });
            }
          } catch (_) { /* ignore */ }
          return result;
        }

        // Windows 路径修复：去掉 file:/// 前缀里的前导斜杠
        const thisFile = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, "$1");
        const thisDir = path.dirname(thisFile);
        // OPC 插件自带 Skills: extensions/opc-platform/skills/
        const opcSkillsDir = path.resolve(thisDir, "../../../skills");
        // OpenClaw 内置 Skills: openclaw/skills/ (向上6级: web/config-ui.ts -> src -> opc-platform -> extensions -> openclaw)
        const builtinSkillsDir = path.resolve(thisDir, "../../../../../../skills");

        const opcSkills = scanSkillsDir(opcSkillsDir, "opc");
        const builtinSkills = scanSkillsDir(builtinSkillsDir, "openclaw");
        const custom = scanSkillsDir(CUSTOM_SKILLS_DIR, "custom");

        sendJson(res, { builtin: [...opcSkills, ...builtinSkills], custom });
        return true;
      }

      // Skills API: POST github-install { repo }
      if (pathname === "/opc/admin/api/skills/github-install" && method === "POST") {
        const body = await readBody(req);
        const { repo } = JSON.parse(body) as { repo?: string };
        if (!repo) { sendJson(res, { ok: false, error: "repo required" }, 400); return true; }
        // Parse owner/repo from URL or "owner/repo"
        const cleaned = repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").trim();
        if (!/^[\w.-]+\/[\w.-]+$/.test(cleaned)) {
          sendJson(res, { ok: false, error: "无效的仓库格式，请使用 user/repo" }, 400); return true;
        }
        const repoName = cleaned.split("/")[1];
        fs.mkdirSync(CUSTOM_SKILLS_DIR, { recursive: true });
        const targetDir = path.join(CUSTOM_SKILLS_DIR, repoName);
        const gitUrl = `https://github.com/${cleaned}.git`;
        const args = fs.existsSync(targetDir)
          ? ["-C", targetDir, "pull"]
          : ["clone", gitUrl, targetDir];
        const result = await new Promise<{ ok: boolean; output: string }>((resolve) => {
          const proc = spawn("git", args, { timeout: 60000 });
          let out = "";
          proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
          proc.stderr?.on("data", (d: Buffer) => { out += d.toString(); });
          proc.on("close", (code) => resolve({ ok: code === 0, output: out }));
          proc.on("error", (e) => resolve({ ok: false, output: e.message }));
        });
        if (result.ok) {
          sendJson(res, { ok: true, dir: targetDir, message: `已安装到 ${targetDir}` });
        } else {
          sendJson(res, { ok: false, error: result.output || "git 命令失败" });
        }
        return true;
      }

      // Skills API: POST create { name, description?, emoji?, content? } or { name, raw }
      if (pathname === "/opc/admin/api/skills/create" && method === "POST") {
        const body = await readBody(req);
        const data = JSON.parse(body) as Record<string, string>;
        const skillName = data.name?.trim();
        if (!skillName || !/^[a-z0-9-]+$/.test(skillName)) {
          sendJson(res, { ok: false, error: "name 只能包含小写字母、数字和连字符" }, 400); return true;
        }
        const skillDir = path.join(CUSTOM_SKILLS_DIR, skillName);
        fs.mkdirSync(skillDir, { recursive: true });
        const skillMdPath = path.join(skillDir, "SKILL.md");
        let mdContent: string;
        if (data.raw) {
          mdContent = data.raw;
        } else {
          const emojiStr = data.emoji?.trim() || "✨";
          const descStr = data.description?.trim() || "";
          const contentStr = data.content?.trim() || "";
          mdContent = `---\nname: ${skillName}\ndescription: ${descStr}\nmetadata: {"openclaw":{"emoji":"${emojiStr}"}}\n---\n\n${contentStr}`;
        }
        fs.writeFileSync(skillMdPath, mdContent, "utf8");
        sendJson(res, { ok: true, path: skillMdPath });
        return true;
      }

      // Skills API: DELETE /opc/admin/api/skills/custom/:name
      const skillDeleteMatch = pathname.match(/^\/opc\/admin\/api\/skills\/custom\/([^/]+)$/);
      if (skillDeleteMatch && method === "DELETE") {
        const skillName = decodeURIComponent(skillDeleteMatch[1]);
        if (!skillName || skillName.includes("..") || skillName.includes("/") || skillName.includes("\\")) {
          sendJson(res, { ok: false, error: "无效的 skill 名称" }, 400); return true;
        }
        const skillDir = path.join(CUSTOM_SKILLS_DIR, skillName);
        try {
          fs.rmSync(skillDir, { recursive: true, force: true });
          sendJson(res, { ok: true });
        } catch (e) {
          sendJson(res, { ok: false, error: e instanceof Error ? e.message : String(e) });
        }
        return true;
      }

      // Company Skills API: GET ?company_id=xxx
      if (pathname === "/opc/admin/api/company-skills" && method === "GET") {
        const companyId = urlObj.searchParams.get("company_id") ?? "";
        if (!companyId) { sendJson(res, { error: "company_id required" }, 400); return true; }
        const row = db.queryOne("SELECT value FROM opc_tool_config WHERE key = ?", `company_skills_${companyId}`) as { value: string } | null;
        const skills: string[] = row ? (JSON.parse(row.value) as string[]) : [];
        sendJson(res, { company_id: companyId, skills });
        return true;
      }

      // Company Skills API: POST { company_id, skills[] }
      if (pathname === "/opc/admin/api/company-skills" && method === "POST") {
        const body = await readBody(req);
        const { company_id, skills } = JSON.parse(body) as { company_id?: string; skills?: string[] };
        if (!company_id) { sendJson(res, { error: "company_id required" }, 400); return true; }
        const key = `company_skills_${company_id}`;
        const value = JSON.stringify(skills ?? []);
        db.execute(
          `INSERT INTO opc_tool_config (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          key, value,
        );
        sendJson(res, { ok: true, company_id, skills });
        return true;
      }

      // Companies list API (for dropdowns)
      if (pathname === "/opc/admin/api/companies" && method === "GET") {
        const rows = db.query("SELECT id, name, industry, status FROM opc_companies ORDER BY name");
        sendJson(res, rows);
        return true;
      }

      // Company delete API: DELETE /opc/admin/api/companies/:id
      const companyDeleteMatch = pathname.match(/^\/opc\/admin\/api\/companies\/([^/]+)$/);
      if (companyDeleteMatch && method === "DELETE") {
        const companyId = companyDeleteMatch[1];
        const company = db.queryOne("SELECT id, name FROM opc_companies WHERE id = ?", companyId) as { id: string; name: string } | null;
        if (!company) { sendJson(res, { ok: false, error: "公司不存在" }, 404); return true; }
        // 级联删除所有关联表数据
        const RELATED_TABLES = [
          "opc_transactions", "opc_contacts", "opc_employees", "opc_invoices",
          "opc_tax_filings", "opc_contracts", "opc_hr_records", "opc_media_content",
          "opc_tasks", "opc_projects", "opc_investment_rounds", "opc_investors",
          "opc_services", "opc_procurement_orders", "opc_milestones",
          "opc_lifecycle_events", "opc_metrics", "opc_alerts",
          "opc_acquisition_cases", "opc_asset_packages", "opc_staff_config",
          "opc_opb_canvas",
        ];
        for (const table of RELATED_TABLES) {
          try { db.execute(`DELETE FROM ${table} WHERE company_id = ?`, companyId); } catch (_) { /* 表可能不存在 */ }
        }
        // 删除资产包明细（通过 package_id 关联）
        try {
          const pkgIds = db.query("SELECT id FROM opc_asset_packages WHERE company_id = ?", companyId) as { id: string }[];
          for (const pkg of pkgIds) {
            db.execute("DELETE FROM opc_asset_package_items WHERE package_id = ?", pkg.id);
          }
        } catch (_) { /* ignore */ }
        // 删除 opc_tool_config 中 company_skills_ 前缀的记录
        try { db.execute("DELETE FROM opc_tool_config WHERE key = ?", `company_skills_${companyId}`); } catch (_) { /* ignore */ }
        // 最后删除公司本身
        db.execute("DELETE FROM opc_companies WHERE id = ?", companyId);
        api.logger.info(`opc: 已删除公司 ${company.name} (${companyId}) 及全部关联数据`);
        sendJson(res, { ok: true, name: company.name });
        return true;
      }

      // Serve HTML page for all other /opc/admin paths
      sendHtml(res, buildPageHtml(!!gatewayToken));
      return true;
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      return true;
    }
  });

  api.logger.info("opc: 已注册配置管理 UI (/opc/admin)");
}
