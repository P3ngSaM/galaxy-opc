/**
 * 星环OPC中心 — opc_monitoring 运营监控工具
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json, toolError } from "../utils/tool-helper.js";
import { computeHealthScore, computeGrowthScorecard, getLastBriefing } from "../opc/briefing-builder.js";
import { detectCompanyStage } from "../opc/stage-detector.js";
import { getActiveInsights } from "../opc/intelligence-engine.js";

const MonitoringSchema = Type.Union([
  Type.Object({
    action: Type.Literal("record_metric"),
    company_id: Type.String({ description: "公司 ID" }),
    name: Type.String({ description: "指标名称（如: 月收入/用户数/转化率）" }),
    value: Type.Number({ description: "指标值" }),
    unit: Type.Optional(Type.String({ description: "单位（如: 元/人/%）" })),
    category: Type.Optional(Type.String({ description: "分类: revenue/user/conversion/cost/other" })),
    recorded_at: Type.Optional(Type.String({ description: "记录时间 (YYYY-MM-DD 或 ISO datetime)" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("get_metrics"),
    company_id: Type.String({ description: "公司 ID" }),
    name: Type.Optional(Type.String({ description: "按指标名称筛选" })),
    category: Type.Optional(Type.String({ description: "按分类筛选" })),
    start_date: Type.Optional(Type.String({ description: "开始日期" })),
    end_date: Type.Optional(Type.String({ description: "结束日期" })),
  }),
  Type.Object({
    action: Type.Literal("create_alert"),
    company_id: Type.String({ description: "公司 ID" }),
    title: Type.String({ description: "告警标题" }),
    severity: Type.Optional(Type.String({ description: "严重度: info/warning/critical" })),
    category: Type.Optional(Type.String({ description: "分类" })),
    message: Type.Optional(Type.String({ description: "告警详情" })),
  }),
  Type.Object({
    action: Type.Literal("list_alerts"),
    company_id: Type.String({ description: "公司 ID" }),
    severity: Type.Optional(Type.String({ description: "按严重度筛选: info/warning/critical" })),
    status: Type.Optional(Type.String({ description: "按状态筛选: active/acknowledged/resolved" })),
  }),
  Type.Object({
    action: Type.Literal("dismiss_alert"),
    alert_id: Type.String({ description: "告警 ID" }),
  }),
  Type.Object({
    action: Type.Literal("kpi_summary"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("delete_metric"),
    metric_id: Type.String({ description: "指标记录 ID" }),
  }),
  Type.Object({
    action: Type.Literal("list_insights"),
    company_id: Type.String({ description: "公司 ID" }),
    insight_type: Type.Optional(Type.String({ description: "类型筛选: data_gap/trend/risk/opportunity/next_step/staff_observation" })),
  }),
  Type.Object({
    action: Type.Literal("dismiss_insight"),
    insight_id: Type.String({ description: "洞察 ID" }),
  }),
  Type.Object({
    action: Type.Literal("health_score"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("growth_scorecard"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("compare_briefing"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("strategy_report"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
]);

type MonitoringParams = Static<typeof MonitoringSchema>;

export function registerMonitoringTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerTool(
    {
      name: "opc_monitoring",
      label: "OPC 运营监控",
      description:
        "运营监控工具。操作: record_metric(记录指标), get_metrics(查询指标), " +
        "create_alert(创建告警), list_alerts(告警列表), " +
        "dismiss_alert(消除告警), kpi_summary(KPI 汇总), delete_metric(删除指标记录), " +
        "list_insights(查看洞察), dismiss_insight(标记洞察已处理), health_score(健康评分), " +
        "growth_scorecard(增长评分卡), compare_briefing(简报历史对比), strategy_report(战略分析报告)",
      parameters: MonitoringSchema,
      async execute(_toolCallId, params) {
        const p = params as MonitoringParams;
        try {
          switch (p.action) {
            case "record_metric": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_metrics (id, company_id, name, value, unit, category, recorded_at, notes, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                id, p.company_id, p.name, p.value,
                p.unit ?? "", p.category ?? "", p.recorded_at ?? now, p.notes ?? "", now,
              );
              return json(db.queryOne("SELECT * FROM opc_metrics WHERE id = ?", id));
            }

            case "get_metrics": {
              let sql = "SELECT * FROM opc_metrics WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.name) { sql += " AND name = ?"; params2.push(p.name); }
              if (p.category) { sql += " AND category = ?"; params2.push(p.category); }
              if (p.start_date) { sql += " AND recorded_at >= ?"; params2.push(p.start_date); }
              if (p.end_date) { sql += " AND recorded_at <= ?"; params2.push(p.end_date); }
              sql += " ORDER BY recorded_at DESC";
              return json(db.query(sql, ...params2));
            }

            case "create_alert": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_alerts (id, company_id, title, severity, category, status, message, resolved_at, created_at)
                 VALUES (?, ?, ?, ?, ?, 'active', ?, '', ?)`,
                id, p.company_id, p.title,
                p.severity ?? "info", p.category ?? "", p.message ?? "", now,
              );
              return json(db.queryOne("SELECT * FROM opc_alerts WHERE id = ?", id));
            }

            case "list_alerts": {
              let sql = "SELECT * FROM opc_alerts WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.severity) { sql += " AND severity = ?"; params2.push(p.severity); }
              if (p.status) { sql += " AND status = ?"; params2.push(p.status); }
              sql += " ORDER BY created_at DESC";
              return json(db.query(sql, ...params2));
            }

            case "dismiss_alert": {
              const now = new Date().toISOString();
              db.execute(
                "UPDATE opc_alerts SET status = 'resolved', resolved_at = ? WHERE id = ?",
                now, p.alert_id,
              );
              const alert = db.queryOne("SELECT * FROM opc_alerts WHERE id = ?", p.alert_id);
              if (!alert) return toolError("告警不存在", "RECORD_NOT_FOUND");
              return json(alert);
            }

            case "kpi_summary": {
              // 跨表聚合 KPI
              const revenue = db.queryOne(
                `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) as total_income,
                        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as total_expense
                 FROM opc_transactions WHERE company_id = ?`,
                p.company_id,
              ) as { total_income: number; total_expense: number };

              const employees = db.queryOne(
                "SELECT COUNT(*) as count FROM opc_hr_records WHERE company_id = ? AND status = 'active'",
                p.company_id,
              ) as { count: number };

              const projects = db.queryOne(
                `SELECT COUNT(*) as total,
                        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
                        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
                 FROM opc_projects WHERE company_id = ?`,
                p.company_id,
              );

              const contracts = db.queryOne(
                `SELECT COUNT(*) as total,
                        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
                        COALESCE(SUM(CASE WHEN status='active' THEN amount ELSE 0 END), 0) as active_value
                 FROM opc_contracts WHERE company_id = ?`,
                p.company_id,
              );

              const alerts = db.query(
                `SELECT severity, COUNT(*) as count
                 FROM opc_alerts WHERE company_id = ? AND status = 'active'
                 GROUP BY severity`,
                p.company_id,
              );

              const recentMetrics = db.query(
                `SELECT name, value, unit, category, recorded_at
                 FROM opc_metrics WHERE company_id = ?
                 ORDER BY recorded_at DESC LIMIT 20`,
                p.company_id,
              );

              const contacts = db.queryOne(
                "SELECT COUNT(*) as count FROM opc_contacts WHERE company_id = ?",
                p.company_id,
              ) as { count: number };

              return json({
                financial: {
                  total_income: revenue.total_income,
                  total_expense: revenue.total_expense,
                  net_profit: revenue.total_income - revenue.total_expense,
                },
                team: { active_employees: employees.count },
                projects,
                contracts,
                customers: { total_contacts: contacts.count },
                alerts: { active: alerts },
                recent_metrics: recentMetrics,
              });
            }

            case "delete_metric": {
              db.execute("DELETE FROM opc_metrics WHERE id = ?", p.metric_id);
              return json({ ok: true });
            }

            case "list_insights": {
              let sql = "SELECT * FROM opc_insights WHERE company_id = ? AND status = 'active' AND (expires_at = '' OR expires_at > datetime('now'))";
              const params2: unknown[] = [p.company_id];
              if ("insight_type" in p && p.insight_type) { sql += " AND insight_type = ?"; params2.push(p.insight_type); }
              sql += " ORDER BY priority DESC, created_at DESC LIMIT 20";
              return json(db.query(sql, ...params2));
            }

            case "dismiss_insight": {
              const now = new Date().toISOString();
              db.execute(
                "UPDATE opc_insights SET status = 'dismissed', updated_at = ? WHERE id = ?",
                now, p.insight_id,
              );
              const ins = db.queryOne("SELECT * FROM opc_insights WHERE id = ?", p.insight_id);
              if (!ins) return toolError("洞察不存在", "RECORD_NOT_FOUND");
              return json(ins);
            }

            case "health_score": {
              const score = computeHealthScore(db, p.company_id);
              return json(score);
            }

            case "growth_scorecard": {
              const card = computeGrowthScorecard(db, p.company_id);
              return json(card);
            }

            case "compare_briefing": {
              const last = getLastBriefing(db, p.company_id);
              if (!last) return json({ message: "尚无历史简报快照，系统将在每日扫描时自动保存" });
              const currentHealth = computeHealthScore(db, p.company_id);
              const currentScorecard = computeGrowthScorecard(db, p.company_id);
              return json({
                last_date: last.date,
                health_score: { previous: last.healthScore, current: currentHealth.total, change: currentHealth.total - last.healthScore },
                income: { previous: last.totalIncome, current: (db.queryOne("SELECT COALESCE(SUM(amount),0) as total FROM opc_transactions WHERE company_id = ? AND type='income'", p.company_id) as { total: number }).total },
                scorecard: { previous: last.scorecardGrade, current: currentScorecard.overall },
                dimensions: currentHealth.dimensions,
              });
            }

            case "strategy_report": {
              const stageResult = detectCompanyStage(db, p.company_id);
              const healthResult = computeHealthScore(db, p.company_id);
              const scorecardResult = computeGrowthScorecard(db, p.company_id);
              const insights = getActiveInsights(db, p.company_id, 20);

              const totalIncome = (db.queryOne(
                "SELECT COALESCE(SUM(amount), 0) as total FROM opc_transactions WHERE company_id = ? AND type = 'income'", p.company_id,
              ) as { total: number }).total;
              const totalExpense = (db.queryOne(
                "SELECT COALESCE(SUM(amount), 0) as total FROM opc_transactions WHERE company_id = ? AND type = 'expense'", p.company_id,
              ) as { total: number }).total;
              const revenueMonths = (db.queryOne(
                "SELECT COUNT(DISTINCT strftime('%Y-%m', transaction_date)) as cnt FROM opc_transactions WHERE company_id = ? AND type = 'income' AND amount > 0",
                p.company_id,
              ) as { cnt: number }).cnt;
              const contactCount = (db.queryOne(
                "SELECT COUNT(*) as cnt FROM opc_contacts WHERE company_id = ?", p.company_id,
              ) as { cnt: number }).cnt;
              const contractCount = (db.queryOne(
                "SELECT COUNT(*) as cnt FROM opc_contracts WHERE company_id = ?", p.company_id,
              ) as { cnt: number }).cnt;
              const contentCount = (db.queryOne(
                "SELECT COUNT(*) as cnt FROM opc_media_content WHERE company_id = ?", p.company_id,
              ) as { cnt: number }).cnt;

              // 收入来源分析
              const counterparties = db.query(
                "SELECT counterparty, SUM(amount) as total FROM opc_transactions WHERE company_id = ? AND type = 'income' AND counterparty != '' GROUP BY counterparty ORDER BY total DESC LIMIT 5",
                p.company_id,
              ) as { counterparty: string; total: number }[];
              const topClient = counterparties[0];
              const concentration = topClient && totalIncome > 0
                ? Math.round((topClient.total / totalIncome) * 100) : 0;

              return json({
                stage: stageResult,
                health: healthResult,
                scorecard: scorecardResult,
                financials: {
                  total_income: totalIncome,
                  total_expense: totalExpense,
                  net_profit: totalIncome - totalExpense,
                  profit_rate: totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0,
                  revenue_months: revenueMonths,
                  revenue_sources: counterparties,
                  top_client_concentration: `${concentration}%`,
                },
                operations: {
                  contact_count: contactCount,
                  contract_count: contractCount,
                  content_count: contentCount,
                },
                risks: insights.filter(i => i.insight_type === "risk").map(i => ({ title: i.title, priority: i.priority })),
                opportunities: insights.filter(i => i.insight_type === "opportunity").map(i => ({ title: i.title })),
                data_gaps: insights.filter(i => i.insight_type === "data_gap").map(i => i.title),
                staff_observations: insights.filter(i => i.insight_type === "staff_observation").map(i => ({ role: i.staff_role, title: i.title })),
              });
            }

            default:
              return toolError(`未知操作: ${(p as { action: string }).action}`, "UNKNOWN_ACTION");
          }
        } catch (err) {
          return toolError(err instanceof Error ? err.message : String(err), "DB_ERROR");
        }
      },
    },
    { name: "opc_monitoring" },
  );

  api.logger.info("opc: 已注册 opc_monitoring 工具");
}
