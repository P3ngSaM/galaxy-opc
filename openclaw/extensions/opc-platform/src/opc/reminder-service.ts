/**
 * 星环OPC中心 — 自动提醒后台服务
 *
 * 定期扫描数据库，自动生成以下类型的告警：
 * - 税务申报到期提醒（7天内）
 * - 合同到期提醒（30天内）
 * - 现金流预警（近30天净流为负且低于阈值）
 *
 * 防重复：同一公司同一类别同一周期内不重复写入。
 */

import https from "node:https";
import http from "node:http";
import type { OpcDatabase } from "../db/index.js";

type AlertRow = { id: string; company_id: string; category: string; title: string };
type TaxRow = { id: string; company_id: string; period: string; tax_type: string; due_date: string; amount: number };
type ContractRow = { id: string; company_id: string; title: string; end_date: string; counterparty: string };
type FinRow = { income: number; expense: number };
type CompanyRow = { id: string; name: string };

/** 计算今天到目标日期的天数差（负数=已过期），日期无效时返回 null */
function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** 今天的日期字符串 YYYY-MM-DD */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 30天前的日期字符串 */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** 检查近期是否已存在同类告警（防重复） */
function alertExists(db: OpcDatabase, companyId: string, category: string, titleKeyword: string): boolean {
  const cutoff = daysAgo(3); // 3天内不重复
  const rows = db.query(
    `SELECT id FROM opc_alerts WHERE company_id = ? AND category = ? AND title LIKE ? AND status = 'active' AND created_at >= ?`,
    companyId, category, `%${titleKeyword}%`, cutoff,
  ) as AlertRow[];
  return rows.length > 0;
}

/** 写入告警 */
function createAlert(db: OpcDatabase, params: {
  companyId: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  category: string;
}): void {
  const now = new Date().toISOString();
  db.execute(
    `INSERT INTO opc_alerts (id, company_id, title, severity, category, status, message, resolved_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, '', ?)`,
    db.genId(), params.companyId, params.title, params.severity, params.category, params.message, now,
  );
}

/** 向飞书/企业微信 Webhook 推送一条文本消息（fire-and-forget） */
function sendWebhook(url: string, text: string, log: (msg: string) => void): void {
  try {
    const isFeishu = url.includes("feishu.cn") || url.includes("larksuite.com");
    const body = isFeishu
      ? JSON.stringify({ msg_type: "text", content: { text } })
      : JSON.stringify({ msgtype: "text", text: { content: text } });

    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        res.resume(); // drain response
        if (res.statusCode && res.statusCode >= 400) {
          log(`opc-reminder: Webhook 响应异常 (${res.statusCode})`);
        }
      },
    );
    req.on("error", (err) => log(`opc-reminder: Webhook 请求失败: ${err.message}`));
    req.write(body);
    req.end();
  } catch (err) {
    log(`opc-reminder: Webhook 发送异常: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── 检查项 1：税务申报到期提醒 ────────────────────────────────

function checkTaxDeadlines(db: OpcDatabase, log: (msg: string) => void, webhookUrl?: string): number {
  let count = 0;
  const rows = db.query(
    `SELECT t.*, c.name as company_name FROM opc_tax_filings t
     LEFT JOIN opc_companies c ON t.company_id = c.id
     WHERE t.status = 'pending' AND t.due_date <= ?`,
    daysAgo(-7), // due within 7 days
  ) as (TaxRow & { company_name: string })[];

  for (const row of rows) {
    const days = daysUntil(row.due_date);
    if (days === null) continue; // 日期格式异常，跳过
    const keyword = `${row.tax_type}-${row.period}`;
    if (alertExists(db, row.company_id, "tax", keyword)) continue;

    const overdue = days < 0;
    const severity = overdue ? "critical" : days <= 3 ? "warning" : "info";
    const title = overdue
      ? `税务申报逾期: ${row.tax_type} (${row.period})`
      : `税务申报即将到期: ${row.tax_type} (${row.period})`;
    const message = overdue
      ? `${row.company_name} 的 ${row.tax_type} 申报已逾期 ${Math.abs(days)} 天，请立即处理！到期日: ${row.due_date}`
      : `${row.company_name} 的 ${row.tax_type} 申报将在 ${days} 天后到期 (${row.due_date})，请及时完成申报。`;

    createAlert(db, { companyId: row.company_id, title, message, severity, category: "tax" });
    count++;
    log(`opc-reminder: 税务提醒 [${row.company_name}] ${title}`);
    if (webhookUrl) sendWebhook(webhookUrl, `【税务提醒】${title}\n${message}`, log);
  }
  return count;
}

// ── 检查项 2：合同到期提醒 ─────────────────────────────────────

function checkContractExpiry(db: OpcDatabase, log: (msg: string) => void, webhookUrl?: string): number {
  let count = 0;
  const rows = db.query(
    `SELECT t.*, c.name as company_name FROM opc_contracts t
     LEFT JOIN opc_companies c ON t.company_id = c.id
     WHERE t.status = 'active' AND t.end_date != '' AND t.end_date <= ?`,
    daysAgo(-30),
  ) as (ContractRow & { company_name: string })[];

  for (const row of rows) {
    const days = daysUntil(row.end_date);
    if (days === null) continue; // 日期格式异常，跳过
    const keyword = row.title.slice(0, 20);
    if (alertExists(db, row.company_id, "contract", keyword)) continue;

    const overdue = days < 0;
    const severity = overdue ? "critical" : days <= 7 ? "warning" : "info";
    const title = overdue
      ? `合同已过期: ${row.title}`
      : `合同即将到期: ${row.title}`;
    const message = overdue
      ? `${row.company_name} 与 ${row.counterparty} 的合同《${row.title}》已于 ${row.end_date} 到期，请及时续签或终止。`
      : `${row.company_name} 与 ${row.counterparty} 的合同《${row.title}》将在 ${days} 天后到期 (${row.end_date})，请提前安排续签。`;

    createAlert(db, { companyId: row.company_id, title, message, severity, category: "contract" });
    count++;
    log(`opc-reminder: 合同提醒 [${row.company_name}] ${title}`);
    if (webhookUrl) sendWebhook(webhookUrl, `【合同提醒】${title}\n${message}`, log);
  }
  return count;
}

// ── 检查项 3：现金流预警 ──────────────────────────────────────

function checkCashFlow(db: OpcDatabase, log: (msg: string) => void, webhookUrl?: string): number {
  let count = 0;
  const start = daysAgo(30);
  const companies = db.query(
    `SELECT id, name FROM opc_companies WHERE status = 'active'`,
  ) as CompanyRow[];

  for (const company of companies) {
    const fin = db.queryOne(
      `SELECT
         COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as income,
         COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as expense
       FROM opc_transactions
       WHERE company_id = ? AND transaction_date >= ?`,
      company.id, start,
    ) as FinRow | null;

    if (!fin) continue;
    const net = fin.income - fin.expense;
    if (net >= 0) continue; // 现金流正常，不报警

    // 净流出超过 5000 元才报警
    if (Math.abs(net) < 5000) continue;

    if (alertExists(db, company.id, "cashflow", "现金流预警")) continue;

    const severity = Math.abs(net) > 50000 ? "critical" : "warning";
    createAlert(db, {
      companyId: company.id,
      title: `现金流预警: 近30天净流出 ${Math.abs(net).toLocaleString()} 元`,
      message: `${company.name} 近30天收入 ${fin.income.toLocaleString()} 元，支出 ${fin.expense.toLocaleString()} 元，净流出 ${Math.abs(net).toLocaleString()} 元。请关注资金状况，必要时调整支出计划。`,
      severity,
      category: "cashflow",
    });
    count++;
    log(`opc-reminder: 现金流预警 [${company.name}] 净流出 ${Math.abs(net).toLocaleString()} 元`);
    if (webhookUrl) sendWebhook(webhookUrl, `【现金流预警】${company.name} 近30天净流出 ${Math.abs(net).toLocaleString()} 元，请及时关注资金状况。`, log);
  }
  return count;
}

// ── 检查项 4：投资轮次跟进提醒 ──────────────────────────────────

function checkInvestmentRounds(db: OpcDatabase, log: (msg: string) => void, webhookUrl?: string): number {
  let count = 0;
  // 找出 close_date 在7天内的活跃融资轮
  const rows = db.query(
    `SELECT r.*, c.name as company_name FROM opc_investment_rounds r
     LEFT JOIN opc_companies c ON r.company_id = c.id
     WHERE r.status IN ('planning','open') AND r.close_date != '' AND r.close_date <= ?`,
    daysAgo(-7),
  ) as ({ id: string; company_id: string; round_name: string; close_date: string; company_name: string })[];

  for (const row of rows) {
    const days = daysUntil(row.close_date);
    if (days === null) continue; // 日期格式异常，跳过
    const keyword = row.round_name.slice(0, 15);
    if (alertExists(db, row.company_id, "investment", keyword)) continue;

    const severity = days < 0 ? "warning" : "info";
    const title = days < 0
      ? `融资轮次已超预期关闭日: ${row.round_name}`
      : `融资轮次即将截止: ${row.round_name}`;
    const message = days < 0
      ? `${row.company_name} 的${row.round_name}计划关闭日 (${row.close_date}) 已过，请更新融资进度或调整截止日期。`
      : `${row.company_name} 的${row.round_name}将在 ${days} 天后截止 (${row.close_date})，请跟进投资人沟通进度。`;

    createAlert(db, { companyId: row.company_id, title, message, severity, category: "investment" });
    count++;
    log(`opc-reminder: 融资提醒 [${row.company_name}] ${title}`);
    if (webhookUrl) sendWebhook(webhookUrl, `【融资提醒】${title}\n${message}`, log);
  }
  return count;
}

// ── 主扫描函数 ─────────────────────────────────────────────────

export function runReminderScan(db: OpcDatabase, log: (msg: string) => void, webhookUrl?: string): void {
  try {
    let total = 0;
    total += checkTaxDeadlines(db, log, webhookUrl);
    total += checkContractExpiry(db, log, webhookUrl);
    total += checkCashFlow(db, log, webhookUrl);
    total += checkInvestmentRounds(db, log, webhookUrl);
    if (total > 0) {
      log(`opc-reminder: 本次扫描生成 ${total} 条提醒`);
    }
  } catch (err) {
    log(`opc-reminder: 扫描异常: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** 启动定时提醒服务，返回停止函数 */
export function startReminderService(
  db: OpcDatabase,
  log: (msg: string) => void,
  webhookUrl?: string,
  intervalMs = 3600_000, // 默认每小时扫描一次
): () => void {
  // 启动时立即扫描一次（延迟30秒，等数据库稳定）
  const initTimer = setTimeout(() => {
    log("opc-reminder: 首次扫描启动");
    runReminderScan(db, log, webhookUrl);
  }, 30_000);

  // 周期性扫描
  const interval = setInterval(() => {
    runReminderScan(db, log, webhookUrl);
  }, intervalMs);

  return () => {
    clearTimeout(initTimer);
    clearInterval(interval);
    log("opc-reminder: 提醒服务已停止");
  };
}
