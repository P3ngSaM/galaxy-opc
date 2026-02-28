/**
 * 星环OPC中心 — opc_finance 财税管理工具
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json, toolError } from "../utils/tool-helper.js";

const FinanceSchema = Type.Union([
  Type.Object({
    action: Type.Literal("create_invoice"),
    company_id: Type.String({ description: "公司 ID" }),
    type: Type.String({ description: "发票类型: sales(销项) 或 purchase(进项)" }),
    counterparty: Type.String({ description: "对方单位名称" }),
    amount: Type.Number({ description: "不含税金额（元），有 items 时可设为 0（自动汇总）" }),
    tax_rate: Type.Optional(Type.Number({ description: "税率，如 0.06 表示 6%，默认 0.06" })),
    invoice_number: Type.Optional(Type.String({ description: "发票号码（不填则自动生成 INV-YYYYMM-NNN）" })),
    issue_date: Type.Optional(Type.String({ description: "开票日期 (YYYY-MM-DD)" })),
    due_date: Type.Optional(Type.String({ description: "到期日期 (YYYY-MM-DD)" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
    items: Type.Optional(Type.Array(Type.Object({
      description: Type.String({ description: "项目描述" }),
      quantity: Type.Number({ description: "数量" }),
      unit_price: Type.Number({ description: "单价（元）" }),
      tax_rate: Type.Optional(Type.Number({ description: "该行税率（覆盖发票级税率）" })),
    }), { description: "明细行数组" })),
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
  Type.Object({
    action: Type.Literal("get_invoice"),
    invoice_id: Type.String({ description: "发票 ID" }),
  }),
  Type.Object({
    action: Type.Literal("tax_filing_checklist"),
    company_id: Type.String({ description: "公司 ID" }),
    period: Type.String({ description: "报税期间，如 2026-Q1 或 2026-03" }),
  }),
  Type.Object({
    action: Type.Literal("batch_import_transactions"),
    company_id: Type.String({ description: "公司 ID" }),
    transactions: Type.Array(Type.Object({
      type: Type.String({ description: "类型: income/expense" }),
      amount: Type.Number({ description: "金额（元）" }),
      category: Type.Optional(Type.String({ description: "分类" })),
      description: Type.Optional(Type.String({ description: "描述" })),
      counterparty: Type.Optional(Type.String({ description: "交易对方" })),
      transaction_date: Type.Optional(Type.String({ description: "交易日期 (YYYY-MM-DD)" })),
    }), { description: "交易数组", minItems: 1, maxItems: 200 }),
  }),
  Type.Object({
    action: Type.Literal("batch_import_invoices"),
    company_id: Type.String({ description: "公司 ID" }),
    invoices: Type.Array(Type.Object({
      type: Type.String({ description: "类型: sales/purchase" }),
      counterparty: Type.String({ description: "对方单位" }),
      amount: Type.Number({ description: "不含税金额（元）" }),
      tax_rate: Type.Optional(Type.Number({ description: "税率，默认 0.06" })),
      invoice_number: Type.Optional(Type.String({ description: "发票号码" })),
      issue_date: Type.Optional(Type.String({ description: "开票日期 (YYYY-MM-DD)" })),
    }), { description: "发票数组", minItems: 1, maxItems: 200 }),
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
        "list_tax_filings(申报列表), tax_calendar(税务日历), delete_invoice(删除发票), " +
        "delete_tax_filing(删除税务申报记录), batch_import_transactions(批量导入交易), " +
        "batch_import_invoices(批量导入发票), get_invoice(获取发票详情含明细行), " +
        "tax_filing_checklist(报税清单)",
      parameters: FinanceSchema,
      async execute(_toolCallId, params) {
        const p = params as FinanceParams;
        try {
          switch (p.action) {
            case "create_invoice": {
              const id = db.genId();
              const now = new Date().toISOString();
              const issueDate = p.issue_date ?? now.slice(0, 10);
              const dueDate = (p as Record<string, unknown>).due_date as string ?? "";
              const items = (p as Record<string, unknown>).items as { description: string; quantity: number; unit_price: number; tax_rate?: number }[] | undefined;
              const globalTaxRate = p.tax_rate ?? 0.06;

              // 自动编号: INV-YYYYMM-NNN
              let invoiceNumber = p.invoice_number ?? "";
              if (!invoiceNumber) {
                const month = issueDate.slice(0, 7).replace("-", "");
                const countRow = db.queryOne(
                  "SELECT COUNT(*) as cnt FROM opc_invoices WHERE company_id = ? AND invoice_number LIKE ?",
                  p.company_id, `INV-${month}-%`,
                ) as { cnt: number };
                const seq = String((countRow?.cnt ?? 0) + 1).padStart(3, "0");
                invoiceNumber = `INV-${month}-${seq}`;
              }

              let amount: number;
              let taxAmount: number;
              let totalAmount: number;

              if (items && items.length > 0) {
                // 从明细行汇总
                amount = 0;
                taxAmount = 0;
                for (const item of items) {
                  const lineAmount = Math.round(item.quantity * item.unit_price * 100) / 100;
                  const lineRate = item.tax_rate ?? globalTaxRate;
                  const lineTax = Math.round(lineAmount * lineRate * 100) / 100;
                  amount += lineAmount;
                  taxAmount += lineTax;
                }
                totalAmount = amount + taxAmount;
              } else {
                amount = p.amount;
                taxAmount = Math.round(amount * globalTaxRate * 100) / 100;
                totalAmount = amount + taxAmount;
              }

              db.transaction(() => {
                db.execute(
                  `INSERT INTO opc_invoices (id, company_id, invoice_number, type, counterparty, amount, tax_rate, tax_amount, total_amount, status, issue_date, due_date, notes, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
                  id, p.company_id, invoiceNumber, p.type, p.counterparty,
                  amount, globalTaxRate, taxAmount, totalAmount,
                  issueDate, dueDate, p.notes ?? "", now,
                );

                // 插入明细行
                if (items && items.length > 0) {
                  for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const lineAmount = Math.round(item.quantity * item.unit_price * 100) / 100;
                    const lineRate = item.tax_rate ?? globalTaxRate;
                    const lineTax = Math.round(lineAmount * lineRate * 100) / 100;
                    db.execute(
                      `INSERT INTO opc_invoice_items (id, invoice_id, description, quantity, unit_price, amount, tax_rate, tax_amount, sort_order)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                      db.genId(), id, item.description, item.quantity, item.unit_price,
                      lineAmount, lineRate, lineTax, i + 1,
                    );
                  }
                }
              });

              const invoice = db.queryOne("SELECT * FROM opc_invoices WHERE id = ?", id);
              const invoiceItems = db.query("SELECT * FROM opc_invoice_items WHERE invoice_id = ? ORDER BY sort_order", id);
              return json({ ...(invoice as object), items: invoiceItems });
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
              const invoice = db.queryOne("SELECT * FROM opc_invoices WHERE id = ?", p.invoice_id);
              if (!invoice) return toolError(`发票 ${p.invoice_id} 不存在`, "INVOICE_NOT_FOUND");
              return json(invoice);
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

            case "get_invoice": {
              const invoice = db.queryOne("SELECT * FROM opc_invoices WHERE id = ?", p.invoice_id);
              if (!invoice) return toolError("发票不存在", "INVOICE_NOT_FOUND");
              const invoiceItems = db.query("SELECT * FROM opc_invoice_items WHERE invoice_id = ? ORDER BY sort_order", p.invoice_id);
              return json({ ...(invoice as object), items: invoiceItems });
            }

            case "tax_filing_checklist": {
              // 解析期间 (支持 2026-Q1 或 2026-03 格式)
              const periodStr = p.period;
              let datePrefix: string;
              if (periodStr.includes("Q")) {
                const [year, q] = periodStr.split("-Q");
                const quarter = parseInt(q);
                const months = quarter === 1 ? ["01", "02", "03"] : quarter === 2 ? ["04", "05", "06"] : quarter === 3 ? ["07", "08", "09"] : ["10", "11", "12"];
                datePrefix = months.map((m) => `${year}-${m}`).join("|");
              } else {
                datePrefix = periodStr;
              }

              // 汇总销项/进项
              const likeClauses = datePrefix.split("|");
              let salesTotal = 0, salesTax = 0, purchaseTotal = 0, purchaseTax = 0;
              for (const prefix of likeClauses) {
                const sales = db.queryOne(
                  "SELECT COALESCE(SUM(amount), 0) as total, COALESCE(SUM(tax_amount), 0) as tax FROM opc_invoices WHERE company_id = ? AND type = 'sales' AND issue_date LIKE ?",
                  p.company_id, prefix + "%",
                ) as { total: number; tax: number };
                salesTotal += sales.total;
                salesTax += sales.tax;
                const purchases = db.queryOne(
                  "SELECT COALESCE(SUM(amount), 0) as total, COALESCE(SUM(tax_amount), 0) as tax FROM opc_invoices WHERE company_id = ? AND type = 'purchase' AND issue_date LIKE ?",
                  p.company_id, prefix + "%",
                ) as { total: number; tax: number };
                purchaseTotal += purchases.total;
                purchaseTax += purchases.tax;
              }

              // 费用票数量
              let expenseCount = 0;
              for (const prefix of likeClauses) {
                const cnt = (db.queryOne(
                  "SELECT COUNT(*) as cnt FROM opc_transactions WHERE company_id = ? AND type = 'expense' AND transaction_date LIKE ?",
                  p.company_id, prefix + "%",
                ) as { cnt: number }).cnt;
                expenseCount += cnt;
              }

              // 已有税务申报
              const existingFilings = db.query(
                "SELECT * FROM opc_tax_filings WHERE company_id = ? AND period = ?",
                p.company_id, periodStr,
              );

              const vatPayable = Math.max(0, salesTax - purchaseTax);

              return json({
                ok: true,
                period: periodStr,
                checklist: [
                  { step: 1, item: "核对销项发票", detail: `${salesTotal.toLocaleString()} 元（税额 ${salesTax.toLocaleString()} 元）` },
                  { step: 2, item: "核对进项发票", detail: `${purchaseTotal.toLocaleString()} 元（可抵扣税额 ${purchaseTax.toLocaleString()} 元）` },
                  { step: 3, item: "计算增值税", detail: `应缴 ${vatPayable.toLocaleString()} 元 = 销项税 ${salesTax.toLocaleString()} - 进项税 ${purchaseTax.toLocaleString()}` },
                  { step: 4, item: "核对费用票", detail: `本期支出 ${expenseCount} 笔，确保均有对应票据` },
                  { step: 5, item: "检查已有申报记录", detail: existingFilings.length > 0 ? `已有 ${existingFilings.length} 条申报记录` : "暂无申报记录，需创建" },
                  { step: 6, item: "提交申报", detail: "确认以上数据无误后，使用 create_tax_filing 创建申报记录" },
                ],
                summary: { sales_total: salesTotal, sales_tax: salesTax, purchase_total: purchaseTotal, purchase_tax: purchaseTax, vat_payable: vatPayable, expense_count: expenseCount },
                existing_filings: existingFilings,
              });
            }

            case "batch_import_transactions": {
              const records: unknown[] = [];
              db.transaction(() => {
                const now = new Date().toISOString();
                for (const tx of p.transactions) {
                  const id = db.genId();
                  db.execute(
                    `INSERT INTO opc_transactions (id, company_id, type, category, amount, description, counterparty, transaction_date, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    id, p.company_id, tx.type, tx.category ?? "other", tx.amount,
                    tx.description ?? "", tx.counterparty ?? "",
                    tx.transaction_date ?? now.slice(0, 10), now,
                  );
                  records.push({ id, type: tx.type, amount: tx.amount, counterparty: tx.counterparty ?? "" });
                }
              });
              return json({ ok: true, imported_count: p.transactions.length, records });
            }

            case "batch_import_invoices": {
              const records: unknown[] = [];
              db.transaction(() => {
                const now = new Date().toISOString();
                for (const inv of p.invoices) {
                  const id = db.genId();
                  const taxRate = inv.tax_rate ?? 0.06;
                  const taxAmount = Math.round(inv.amount * taxRate * 100) / 100;
                  const totalAmount = inv.amount + taxAmount;
                  db.execute(
                    `INSERT INTO opc_invoices (id, company_id, invoice_number, type, counterparty, amount, tax_rate, tax_amount, total_amount, status, issue_date, notes, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, '', ?)`,
                    id, p.company_id, inv.invoice_number ?? "", inv.type, inv.counterparty,
                    inv.amount, taxRate, taxAmount, totalAmount,
                    inv.issue_date ?? now.slice(0, 10), now,
                  );
                  records.push({ id, type: inv.type, counterparty: inv.counterparty, total_amount: totalAmount });
                }
              });
              return json({ ok: true, imported_count: p.invoices.length, records });
            }

            default:
              return toolError(`未知操作: ${(p as { action: string }).action}`, "UNKNOWN_ACTION");
          }
        } catch (err) {
          return toolError(err instanceof Error ? err.message : String(err), "DB_ERROR");
        }
      },
    },
    { name: "opc_finance" },
  );

  api.logger.info("opc: 已注册 opc_finance 工具");
}
