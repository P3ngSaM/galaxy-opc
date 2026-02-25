/**
 * 星环OPC中心 — opc_finance 财税管理工具
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json } from "../utils/tool-helper.js";

const FinanceSchema = Type.Union([
  Type.Object({
    action: Type.Literal("create_invoice"),
    company_id: Type.String({ description: "公司 ID" }),
    type: Type.String({ description: "发票类型: sales(销项) 或 purchase(进项)" }),
    counterparty: Type.String({ description: "对方单位名称" }),
    amount: Type.Number({ description: "不含税金额（元）" }),
    tax_rate: Type.Optional(Type.Number({ description: "税率，如 0.06 表示 6%，默认 0.06" })),
    invoice_number: Type.Optional(Type.String({ description: "发票号码" })),
    issue_date: Type.Optional(Type.String({ description: "开票日期 (YYYY-MM-DD)" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("list_invoices"),
    company_id: Type.String({ description: "公司 ID" }),
    type: Type.Optional(Type.String({ description: "按类型筛选: sales/purchase" })),
    status: Type.Optional(Type.String({ description: "按状态筛选: draft/issued/paid/void" })),
  }),
  Type.Object({
    action: Type.Literal("update_invoice_status"),
    invoice_id: Type.String({ description: "发票 ID" }),
    status: Type.String({ description: "新状态: issued/paid/void" }),
  }),
  Type.Object({
    action: Type.Literal("calc_vat"),
    company_id: Type.String({ description: "公司 ID" }),
    period: Type.String({ description: "税期，如 2025-Q1 或 2025-01" }),
  }),
  Type.Object({
    action: Type.Literal("calc_income_tax"),
    company_id: Type.String({ description: "公司 ID" }),
    period: Type.String({ description: "税期，如 2025-Q1 或 2025" }),
    annual_revenue: Type.Optional(Type.Number({ description: "年收入（用于年度汇算）" })),
    annual_cost: Type.Optional(Type.Number({ description: "年成本（用于年度汇算）" })),
  }),
  Type.Object({
    action: Type.Literal("create_tax_filing"),
    company_id: Type.String({ description: "公司 ID" }),
    period: Type.String({ description: "税期" }),
    tax_type: Type.String({ description: "税种: vat/income_tax/other" }),
    revenue: Type.Number({ description: "营收" }),
    deductible: Type.Number({ description: "可抵扣/成本" }),
    tax_amount: Type.Number({ description: "应纳税额" }),
    due_date: Type.Optional(Type.String({ description: "申报截止日期" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("list_tax_filings"),
    company_id: Type.String({ description: "公司 ID" }),
    tax_type: Type.Optional(Type.String({ description: "按税种筛选" })),
  }),
  Type.Object({
    action: Type.Literal("tax_calendar"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("delete_invoice"),
    invoice_id: Type.String({ description: "发票 ID" }),
  }),
  Type.Object({
    action: Type.Literal("delete_tax_filing"),
    filing_id: Type.String({ description: "税务申报 ID" }),
  }),
]);

type FinanceParams = Static<typeof FinanceSchema>;

/** 小规模纳税人增值税简易计算 */
function calcVatSimple(salesAmount: number, rate = 0.03): { tax: number; rate: number } {
  return { tax: Math.round(salesAmount * rate * 100) / 100, rate };
}

/** 企业所得税简算（小型微利企业优惠） */
function calcIncomeTax(profit: number): { tax: number; rate: number; note: string } {
  if (profit <= 0) return { tax: 0, rate: 0, note: "无应纳税所得额" };
  if (profit <= 3_000_000) {
    // 小型微利企业: 应纳税所得额 ≤ 300万，实际税负 5%
    const tax = Math.round(profit * 0.05 * 100) / 100;
    return { tax, rate: 0.05, note: "小型微利企业优惠税率 5%" };
  }
  const tax = Math.round(profit * 0.25 * 100) / 100;
  return { tax, rate: 0.25, note: "一般企业税率 25%" };
}

export function registerFinanceTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerTool(
    {
      name: "opc_finance",
      label: "OPC 财税管理",
      description:
        "财税管理工具。操作: create_invoice(创建发票), list_invoices(发票列表), " +
        "update_invoice_status(更新发票状态), calc_vat(增值税计算), " +
        "calc_income_tax(所得税计算), create_tax_filing(创建税务申报), " +
        "list_tax_filings(申报列表), tax_calendar(税务日历), delete_invoice(删除发票), delete_tax_filing(删除税务申报记录)",
      parameters: FinanceSchema,
      async execute(_toolCallId, params) {
        const p = params as FinanceParams;
        try {
          switch (p.action) {
            case "create_invoice": {
              const id = db.genId();
              const now = new Date().toISOString();
              const taxRate = p.tax_rate ?? 0.06;
              const taxAmount = Math.round(p.amount * taxRate * 100) / 100;
              const totalAmount = p.amount + taxAmount;
              db.execute(
                `INSERT INTO opc_invoices (id, company_id, invoice_number, type, counterparty, amount, tax_rate, tax_amount, total_amount, status, issue_date, notes, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
                id, p.company_id, p.invoice_number ?? "", p.type, p.counterparty,
                p.amount, taxRate, taxAmount, totalAmount,
                p.issue_date ?? now.slice(0, 10), p.notes ?? "", now,
              );
              return json(db.queryOne("SELECT * FROM opc_invoices WHERE id = ?", id));
            }

            case "list_invoices": {
              let sql = "SELECT * FROM opc_invoices WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.type) { sql += " AND type = ?"; params2.push(p.type); }
              if (p.status) { sql += " AND status = ?"; params2.push(p.status); }
              sql += " ORDER BY created_at DESC";
              return json(db.query(sql, ...params2));
            }

            case "update_invoice_status": {
              db.execute("UPDATE opc_invoices SET status = ? WHERE id = ?", p.status, p.invoice_id);
              return json(db.queryOne("SELECT * FROM opc_invoices WHERE id = ?", p.invoice_id) ?? { error: "发票不存在" });
            }

            case "calc_vat": {
              const sales = db.query(
                "SELECT COALESCE(SUM(amount), 0) as total FROM opc_invoices WHERE company_id = ? AND type = 'sales' AND issue_date LIKE ?",
                p.company_id, p.period + "%",
              ) as { total: number }[];
              const purchases = db.query(
                "SELECT COALESCE(SUM(tax_amount), 0) as total FROM opc_invoices WHERE company_id = ? AND type = 'purchase' AND issue_date LIKE ?",
                p.company_id, p.period + "%",
              ) as { total: number }[];
              const salesTotal = sales[0]?.total ?? 0;
              const inputTax = purchases[0]?.total ?? 0;
              const vat = calcVatSimple(salesTotal);
              return json({
                period: p.period,
                sales_amount: salesTotal,
                output_tax: vat.tax,
                input_tax: inputTax,
                payable: Math.max(0, vat.tax - inputTax),
                note: "小规模纳税人简易计算，税率 3%",
              });
            }

            case "calc_income_tax": {
              let revenue = p.annual_revenue;
              let cost = p.annual_cost;
              if (revenue === undefined || cost === undefined) {
                const summary = db.getFinanceSummary(p.company_id);
                revenue = revenue ?? summary.total_income;
                cost = cost ?? summary.total_expense;
              }
              const profit = revenue - cost;
              const result = calcIncomeTax(profit);
              return json({
                period: p.period,
                revenue,
                cost,
                profit,
                ...result,
              });
            }

            case "create_tax_filing": {
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_tax_filings (id, company_id, period, tax_type, revenue, deductible, tax_amount, status, due_date, notes, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
                id, p.company_id, p.period, p.tax_type,
                p.revenue, p.deductible, p.tax_amount,
                p.due_date ?? "", p.notes ?? "", now,
              );
              return json(db.queryOne("SELECT * FROM opc_tax_filings WHERE id = ?", id));
            }

            case "list_tax_filings": {
              let sql = "SELECT * FROM opc_tax_filings WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.tax_type) { sql += " AND tax_type = ?"; params2.push(p.tax_type); }
              sql += " ORDER BY period DESC";
              return json(db.query(sql, ...params2));
            }

            case "tax_calendar":
              return json({
                monthly: [
                  { deadline: "每月15日", item: "增值税申报（小规模按季）" },
                  { deadline: "每月15日", item: "个人所得税代扣代缴" },
                  { deadline: "每月15日", item: "城建税/教育费附加" },
                ],
                quarterly: [
                  { deadline: "季后15日内", item: "企业所得税预缴" },
                  { deadline: "季后15日内", item: "增值税申报（小规模纳税人）" },
                ],
                annual: [
                  { deadline: "次年5月31日前", item: "企业所得税汇算清缴" },
                  { deadline: "次年6月30日前", item: "工商年报公示" },
                ],
                pending: db.query(
                  "SELECT * FROM opc_tax_filings WHERE company_id = ? AND status = 'pending' ORDER BY due_date",
                  p.company_id,
                ),
              });

            case "delete_invoice": {
              db.execute("DELETE FROM opc_invoices WHERE id = ?", p.invoice_id);
              return json({ ok: true });
            }

            case "delete_tax_filing": {
              db.execute("DELETE FROM opc_tax_filings WHERE id = ?", p.filing_id);
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
    { name: "opc_finance" },
  );

  api.logger.info("opc: 已注册 opc_finance 工具");
}
