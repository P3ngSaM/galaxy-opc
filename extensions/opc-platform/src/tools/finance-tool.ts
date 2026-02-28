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
  Type.Object({
    action: Type.Literal("generate_balance_sheet"),
    company_id: Type.String({ description: "公司 ID" }),
    date: Type.Optional(Type.String({ description: "查询日期 (YYYY-MM-DD)，默认今天" })),
  }),
  Type.Object({
    action: Type.Literal("generate_income_statement"),
    company_id: Type.String({ description: "公司 ID" }),
    start_date: Type.String({ description: "起始日期 (YYYY-MM-DD)" }),
    end_date: Type.String({ description: "截止日期 (YYYY-MM-DD)" }),
  }),
  Type.Object({
    action: Type.Literal("generate_cashflow_statement"),
    company_id: Type.String({ description: "公司 ID" }),
    start_date: Type.String({ description: "起始日期 (YYYY-MM-DD)" }),
    end_date: Type.String({ description: "截止日期 (YYYY-MM-DD)" }),
  }),
  Type.Object({
    action: Type.Literal("calculate_customer_ltv"),
    company_id: Type.String({ description: "公司 ID" }),
    customer_id: Type.Optional(Type.String({ description: "特定客户 ID（不填则计算全部客户平均值）" })),
  }),
  Type.Object({
    action: Type.Literal("calculate_acquisition_cost"),
    company_id: Type.String({ description: "公司 ID" }),
    period: Type.String({ description: "统计期间，如 2026-01 或 2026-Q1" }),
  }),
  Type.Object({
    action: Type.Literal("unit_economics_analysis"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("generate_funding_datapack"),
    company_id: Type.String({ description: "公司 ID" }),
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
        "tax_filing_checklist(报税清单), " +
        "generate_balance_sheet(生成资产负债表), generate_income_statement(生成利润表), " +
        "generate_cashflow_statement(生成现金流量表), calculate_customer_ltv(计算客户生命周期价值), " +
        "calculate_acquisition_cost(计算获客成本), unit_economics_analysis(单位经济学分析), " +
        "generate_funding_datapack(生成融资数据包)",
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

            case "generate_balance_sheet": {
              const queryDate = p.date ?? new Date().toISOString().slice(0, 10);

              // 流动资产 - 现金（从交易记录汇总）
              const cashResult = db.queryOne(
                `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND transaction_date <= ?`,
                p.company_id, queryDate,
              ) as { total: number };
              const cash = cashResult?.total ?? 0;

              // 应收账款（已开具但未收款的销项发票）
              const receivablesResult = db.queryOne(
                `SELECT COALESCE(SUM(total_amount), 0) as total
                 FROM opc_invoices
                 WHERE company_id = ? AND type = 'sales' AND status IN ('issued') AND issue_date <= ?`,
                p.company_id, queryDate,
              ) as { total: number };
              const accountsReceivable = receivablesResult?.total ?? 0;

              // 固定资产（从采购中筛选固定资产类别）
              const fixedAssetsResult = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND type = 'expense' AND category = 'supplies' AND transaction_date <= ?`,
                p.company_id, queryDate,
              ) as { total: number };
              const fixedAssets = fixedAssetsResult?.total ?? 0;

              // 流动负债 - 应付账款（已收到但未支付的进项发票）
              const payablesResult = db.queryOne(
                `SELECT COALESCE(SUM(total_amount), 0) as total
                 FROM opc_invoices
                 WHERE company_id = ? AND type = 'purchase' AND status IN ('issued') AND issue_date <= ?`,
                p.company_id, queryDate,
              ) as { total: number };
              const accountsPayable = payablesResult?.total ?? 0;

              // 长期负债（从融资记录获取）
              const longTermDebtResult = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_investment_rounds
                 WHERE company_id = ? AND round_name LIKE '%债%' AND status = 'closed'`,
                p.company_id,
              ) as { total: number };
              const longTermDebt = longTermDebtResult?.total ?? 0;

              // 所有者权益 - 实收资本（从融资轮次）
              const paidCapitalResult = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_investment_rounds
                 WHERE company_id = ? AND status = 'closed' AND close_date <= ?`,
                p.company_id, queryDate,
              ) as { total: number };
              const paidCapital = paidCapitalResult?.total ?? 0;

              // 留存收益（净利润累计）
              const retainedEarningsResult = db.queryOne(
                `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND transaction_date <= ?`,
                p.company_id, queryDate,
              ) as { total: number };
              const retainedEarnings = (retainedEarningsResult?.total ?? 0) - paidCapital;

              const totalAssets = cash + accountsReceivable + fixedAssets;
              const totalLiabilities = accountsPayable + longTermDebt;
              const totalEquity = paidCapital + retainedEarnings;

              return json({
                ok: true,
                date: queryDate,
                balance_sheet: {
                  assets: {
                    current_assets: {
                      cash,
                      accounts_receivable: accountsReceivable,
                      total: cash + accountsReceivable,
                    },
                    fixed_assets: fixedAssets,
                    total: totalAssets,
                  },
                  liabilities: {
                    current_liabilities: {
                      accounts_payable: accountsPayable,
                      total: accountsPayable,
                    },
                    long_term_debt: longTermDebt,
                    total: totalLiabilities,
                  },
                  equity: {
                    paid_capital: paidCapital,
                    retained_earnings: retainedEarnings,
                    total: totalEquity,
                  },
                  total_liabilities_and_equity: totalLiabilities + totalEquity,
                },
                health_indicators: {
                  current_ratio: accountsPayable > 0 ? ((cash + accountsReceivable) / accountsPayable).toFixed(2) : "N/A",
                  debt_to_equity: totalEquity > 0 ? (totalLiabilities / totalEquity).toFixed(2) : "N/A",
                  explanation: {
                    current_ratio: "流动比率（流动资产/流动负债），健康值 > 1.5",
                    debt_to_equity: "资产负债率（总负债/所有者权益），健康值 < 1",
                  },
                },
              });
            }

            case "generate_income_statement": {
              // 营业收入（销售类交易）
              const revenueResult = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND type = 'income' AND category LIKE '%income%'
                   AND transaction_date >= ? AND transaction_date <= ?`,
                p.company_id, p.start_date, p.end_date,
              ) as { total: number };
              const revenue = revenueResult?.total ?? 0;

              // 营业成本（采购、薪资、税费）
              const costResult = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND type = 'expense' AND category IN ('salary', 'tax', 'supplies', 'rent', 'utilities')
                   AND transaction_date >= ? AND transaction_date <= ?`,
                p.company_id, p.start_date, p.end_date,
              ) as { total: number };
              const cost = costResult?.total ?? 0;

              // 营销费用
              const marketingResult = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND type = 'expense' AND category = 'marketing'
                   AND transaction_date >= ? AND transaction_date <= ?`,
                p.company_id, p.start_date, p.end_date,
              ) as { total: number };
              const marketing = marketingResult?.total ?? 0;

              const grossProfit = revenue - cost;
              const operatingProfit = grossProfit - marketing;
              const netProfit = operatingProfit;

              // 计算同比/环比（如果有历史数据）
              const periodDays = Math.ceil((new Date(p.end_date).getTime() - new Date(p.start_date).getTime()) / (1000 * 60 * 60 * 24));
              const prevStartDate = new Date(new Date(p.start_date).getTime() - periodDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
              const prevEndDate = new Date(new Date(p.end_date).getTime() - periodDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

              const prevRevenueResult = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND type = 'income' AND category LIKE '%income%'
                   AND transaction_date >= ? AND transaction_date <= ?`,
                p.company_id, prevStartDate, prevEndDate,
              ) as { total: number };
              const prevRevenue = prevRevenueResult?.total ?? 0;

              const revenueGrowth = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue * 100).toFixed(2) + "%" : "N/A";

              return json({
                ok: true,
                period: { start_date: p.start_date, end_date: p.end_date },
                income_statement: {
                  revenue,
                  cost_of_revenue: cost,
                  gross_profit: grossProfit,
                  gross_margin: revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(2) + "%" : "0%",
                  operating_expenses: {
                    marketing,
                    total: marketing,
                  },
                  operating_profit: operatingProfit,
                  operating_margin: revenue > 0 ? ((operatingProfit / revenue) * 100).toFixed(2) + "%" : "0%",
                  net_profit: netProfit,
                  net_margin: revenue > 0 ? ((netProfit / revenue) * 100).toFixed(2) + "%" : "0%",
                },
                growth_metrics: {
                  revenue_growth_mom: revenueGrowth,
                  explanation: "环比增长率：与上一周期相比的收入增长百分比",
                },
              });
            }

            case "generate_cashflow_statement": {
              // 经营活动现金流
              const operatingCashResult = db.queryOne(
                `SELECT
                   COALESCE(SUM(CASE WHEN type = 'income' AND category LIKE '%income%' THEN amount ELSE 0 END), 0) as inflow,
                   COALESCE(SUM(CASE WHEN type = 'expense' AND category IN ('salary', 'rent', 'utilities', 'marketing', 'tax') THEN amount ELSE 0 END), 0) as outflow
                 FROM opc_transactions
                 WHERE company_id = ? AND transaction_date >= ? AND transaction_date <= ?`,
                p.company_id, p.start_date, p.end_date,
              ) as { inflow: number; outflow: number };

              const operatingInflow = operatingCashResult?.inflow ?? 0;
              const operatingOutflow = operatingCashResult?.outflow ?? 0;
              const operatingCashFlow = operatingInflow - operatingOutflow;

              // 投资活动现金流（固定资产购置）
              const investingCashResult = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND type = 'expense' AND category = 'supplies'
                   AND transaction_date >= ? AND transaction_date <= ?`,
                p.company_id, p.start_date, p.end_date,
              ) as { total: number };
              const investingCashFlow = -(investingCashResult?.total ?? 0);

              // 筹资活动现金流（融资收入）
              const financingCashResult = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_investment_rounds
                 WHERE company_id = ? AND status = 'closed'
                   AND close_date >= ? AND close_date <= ?`,
                p.company_id, p.start_date, p.end_date,
              ) as { total: number };
              const financingCashFlow = financingCashResult?.total ?? 0;

              const netCashChange = operatingCashFlow + investingCashFlow + financingCashFlow;

              // 期初现金余额
              const openingCashResult = db.queryOne(
                `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND transaction_date < ?`,
                p.company_id, p.start_date,
              ) as { total: number };
              const openingCash = openingCashResult?.total ?? 0;
              const closingCash = openingCash + netCashChange;

              return json({
                ok: true,
                period: { start_date: p.start_date, end_date: p.end_date },
                cashflow_statement: {
                  operating_activities: {
                    sales_receipts: operatingInflow,
                    operating_expenses: -operatingOutflow,
                    net: operatingCashFlow,
                  },
                  investing_activities: {
                    asset_purchases: investingCashFlow,
                    net: investingCashFlow,
                  },
                  financing_activities: {
                    investment_received: financingCashFlow,
                    net: financingCashFlow,
                  },
                  net_cash_change: netCashChange,
                  opening_cash: openingCash,
                  closing_cash: closingCash,
                },
                health_indicators: {
                  ocf_positive: operatingCashFlow > 0,
                  cash_runway_months: operatingOutflow > 0 ? Math.floor(closingCash / (operatingOutflow / Math.ceil((new Date(p.end_date).getTime() - new Date(p.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30)))) : "N/A",
                  explanation: "现金流健康指标：经营现金流为正说明业务自给自足，现金跑道表示当前余额可维持几个月运营",
                },
              });
            }

            case "calculate_customer_ltv": {
              if (p.customer_id) {
                // 特定客户的 LTV
                const transactions = db.query(
                  `SELECT amount, transaction_date
                   FROM opc_transactions
                   WHERE company_id = ? AND type = 'income' AND counterparty = (
                     SELECT name FROM opc_contacts WHERE id = ?
                   )
                   ORDER BY transaction_date`,
                  p.company_id, p.customer_id,
                ) as { amount: number; transaction_date: string }[];

                if (transactions.length === 0) {
                  return json({
                    ok: false,
                    message: "该客户暂无交易记录",
                  });
                }

                const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
                const avgOrderValue = totalRevenue / transactions.length;
                const firstDate = new Date(transactions[0].transaction_date);
                const lastDate = new Date(transactions[transactions.length - 1].transaction_date);
                const lifespanDays = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
                const purchaseFrequency = transactions.length / (lifespanDays / 30);
                const ltv = avgOrderValue * purchaseFrequency * (lifespanDays / 30);

                return json({
                  ok: true,
                  customer_id: p.customer_id,
                  ltv_analysis: {
                    average_order_value: avgOrderValue.toFixed(2),
                    purchase_frequency_per_month: purchaseFrequency.toFixed(2),
                    customer_lifespan_months: (lifespanDays / 30).toFixed(1),
                    lifetime_value: ltv.toFixed(2),
                    total_transactions: transactions.length,
                    total_revenue: totalRevenue.toFixed(2),
                  },
                });
              } else {
                // 所有客户的平均 LTV
                const customers = db.query(
                  `SELECT id, name FROM opc_contacts WHERE company_id = ?`,
                  p.company_id,
                ) as { id: string; name: string }[];

                let totalLTV = 0;
                let customerCount = 0;

                for (const customer of customers) {
                  const transactions = db.query(
                    `SELECT amount, transaction_date
                     FROM opc_transactions
                     WHERE company_id = ? AND type = 'income' AND counterparty = ?
                     ORDER BY transaction_date`,
                    p.company_id, customer.name,
                  ) as { amount: number; transaction_date: string }[];

                  if (transactions.length === 0) continue;

                  const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
                  const avgOrderValue = totalRevenue / transactions.length;
                  const firstDate = new Date(transactions[0].transaction_date);
                  const lastDate = new Date(transactions[transactions.length - 1].transaction_date);
                  const lifespanDays = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
                  const purchaseFrequency = transactions.length / (lifespanDays / 30);
                  const ltv = avgOrderValue * purchaseFrequency * (lifespanDays / 30);

                  totalLTV += ltv;
                  customerCount++;
                }

                const avgLTV = customerCount > 0 ? totalLTV / customerCount : 0;

                return json({
                  ok: true,
                  ltv_analysis: {
                    average_lifetime_value: avgLTV.toFixed(2),
                    customer_count: customerCount,
                    explanation: "客户生命周期价值（LTV）= 平均订单价值 × 购买频率 × 客户生命周期",
                  },
                });
              }
            }

            case "calculate_acquisition_cost": {
              // 解析期间
              const periodStr = p.period;
              let startDate: string, endDate: string;

              if (periodStr.includes("Q")) {
                const [year, q] = periodStr.split("-Q");
                const quarter = parseInt(q);
                const startMonth = (quarter - 1) * 3 + 1;
                startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
                const endMonth = quarter * 3;
                const lastDay = new Date(parseInt(year), endMonth, 0).getDate();
                endDate = `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
              } else {
                startDate = `${periodStr}-01`;
                const [year, month] = periodStr.split("-");
                const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                endDate = `${periodStr}-${String(lastDay).padStart(2, "0")}`;
              }

              // 营销支出总额
              const marketingSpendResult = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND type = 'expense' AND category = 'marketing'
                   AND transaction_date >= ? AND transaction_date <= ?`,
                p.company_id, startDate, endDate,
              ) as { total: number };
              const marketingSpend = marketingSpendResult?.total ?? 0;

              // 新增客户数
              const newCustomersResult = db.queryOne(
                `SELECT COUNT(*) as count
                 FROM opc_contacts
                 WHERE company_id = ? AND created_at >= ? AND created_at <= ?`,
                p.company_id, startDate, endDate + " 23:59:59",
              ) as { count: number };
              const newCustomers = newCustomersResult?.count ?? 0;

              const cac = newCustomers > 0 ? marketingSpend / newCustomers : 0;

              // 获取平均 LTV 用于计算 LTV/CAC 比率
              const customers = db.query(
                `SELECT id, name FROM opc_contacts WHERE company_id = ?`,
                p.company_id,
              ) as { id: string; name: string }[];

              let totalLTV = 0;
              let customerCount = 0;

              for (const customer of customers) {
                const transactions = db.query(
                  `SELECT amount, transaction_date
                   FROM opc_transactions
                   WHERE company_id = ? AND type = 'income' AND counterparty = ?
                   ORDER BY transaction_date`,
                  p.company_id, customer.name,
                ) as { amount: number; transaction_date: string }[];

                if (transactions.length === 0) continue;

                const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
                const avgOrderValue = totalRevenue / transactions.length;
                const firstDate = new Date(transactions[0].transaction_date);
                const lastDate = new Date(transactions[transactions.length - 1].transaction_date);
                const lifespanDays = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
                const purchaseFrequency = transactions.length / (lifespanDays / 30);
                const ltv = avgOrderValue * purchaseFrequency * (lifespanDays / 30);

                totalLTV += ltv;
                customerCount++;
              }

              const avgLTV = customerCount > 0 ? totalLTV / customerCount : 0;
              const ltvCacRatio = cac > 0 ? avgLTV / cac : 0;

              return json({
                ok: true,
                period: periodStr,
                cac_analysis: {
                  marketing_spend: marketingSpend.toFixed(2),
                  new_customers: newCustomers,
                  customer_acquisition_cost: cac.toFixed(2),
                  average_ltv: avgLTV.toFixed(2),
                  ltv_cac_ratio: ltvCacRatio.toFixed(2),
                  health_status: ltvCacRatio > 3 ? "健康（LTV/CAC > 3）" : ltvCacRatio > 1 ? "尚可（LTV/CAC > 1）" : "需优化（LTV/CAC < 1）",
                  explanation: "获客成本（CAC）= 营销支出 / 新增客户数。健康的 LTV/CAC 比率应 > 3",
                },
              });
            }

            case "unit_economics_analysis": {
              // 从最近的交易数据推算单位经济学
              const recentRevenue = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
                 FROM opc_transactions
                 WHERE company_id = ? AND type = 'income' AND category LIKE '%income%'
                   AND transaction_date >= date('now', '-30 days')`,
                p.company_id,
              ) as { total: number; count: number };

              const recentCost = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND type = 'expense'
                   AND transaction_date >= date('now', '-30 days')`,
                p.company_id,
              ) as { total: number };

              const units = recentRevenue.count > 0 ? recentRevenue.count : 1;
              const revenuePerUnit = recentRevenue.total / units;
              const costPerUnit = recentCost.total / units;
              const contributionMargin = revenuePerUnit - costPerUnit;
              const contributionMarginRate = revenuePerUnit > 0 ? (contributionMargin / revenuePerUnit) * 100 : 0;

              // 盈亏平衡点计算（假设有固定成本）
              const fixedCost = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND type = 'expense' AND category IN ('rent', 'salary')
                   AND transaction_date >= date('now', '-30 days')`,
                p.company_id,
              ) as { total: number };

              const breakEvenUnits = contributionMargin > 0 ? Math.ceil(fixedCost.total / contributionMargin) : 0;

              return json({
                ok: true,
                unit_economics: {
                  revenue_per_unit: revenuePerUnit.toFixed(2),
                  cost_per_unit: costPerUnit.toFixed(2),
                  contribution_margin: contributionMargin.toFixed(2),
                  contribution_margin_rate: contributionMarginRate.toFixed(2) + "%",
                  units_analyzed: units,
                },
                break_even_analysis: {
                  fixed_cost_monthly: fixedCost.total.toFixed(2),
                  break_even_units: breakEvenUnits,
                  explanation: "盈亏平衡点 = 固定成本 / 单位贡献边际",
                },
                health_indicators: {
                  status: contributionMarginRate > 50 ? "优秀" : contributionMarginRate > 30 ? "良好" : "需优化",
                  recommendation: contributionMarginRate < 30 ? "建议提高定价或降低变动成本" : "单位经济学健康",
                },
                data_note: "基于最近 30 天交易数据计算",
              });
            }

            case "generate_funding_datapack": {
              // 获取公司基本信息
              const company = db.queryOne(
                `SELECT * FROM opc_companies WHERE id = ?`,
                p.company_id,
              );
              if (!company) {
                return toolError("公司不存在", "COMPANY_NOT_FOUND");
              }

              // 过去 12 个月财务数据
              const now = new Date();
              const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1).toISOString().slice(0, 10);
              const today = now.toISOString().slice(0, 10);

              // 生成利润表
              const revenueResult = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND type = 'income' AND category LIKE '%income%'
                   AND transaction_date >= ? AND transaction_date <= ?`,
                p.company_id, twelveMonthsAgo, today,
              ) as { total: number };
              const revenue = revenueResult?.total ?? 0;

              const costResult = db.queryOne(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND type = 'expense'
                   AND transaction_date >= ? AND transaction_date <= ?`,
                p.company_id, twelveMonthsAgo, today,
              ) as { total: number };
              const cost = costResult?.total ?? 0;

              const profit = revenue - cost;
              const profitMargin = revenue > 0 ? ((profit / revenue) * 100).toFixed(2) + "%" : "0%";

              // 现金余额
              const cashResult = db.queryOne(
                `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as total
                 FROM opc_transactions
                 WHERE company_id = ? AND transaction_date <= ?`,
                p.company_id, today,
              ) as { total: number };
              const cash = cashResult?.total ?? 0;

              // 客户分析
              const customers = db.query(
                `SELECT id, name FROM opc_contacts WHERE company_id = ?`,
                p.company_id,
              ) as { id: string; name: string }[];

              let totalLTV = 0;
              let customerCount = 0;

              for (const customer of customers) {
                const transactions = db.query(
                  `SELECT amount, transaction_date
                   FROM opc_transactions
                   WHERE company_id = ? AND type = 'income' AND counterparty = ?
                   ORDER BY transaction_date`,
                  p.company_id, customer.name,
                ) as { amount: number; transaction_date: string }[];

                if (transactions.length === 0) continue;

                const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
                const avgOrderValue = totalRevenue / transactions.length;
                const firstDate = new Date(transactions[0].transaction_date);
                const lastDate = new Date(transactions[transactions.length - 1].transaction_date);
                const lifespanDays = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
                const purchaseFrequency = transactions.length / (lifespanDays / 30);
                const ltv = avgOrderValue * purchaseFrequency * (lifespanDays / 30);

                totalLTV += ltv;
                customerCount++;
              }

              const avgLTV = customerCount > 0 ? totalLTV / customerCount : 0;

              // 团队信息
              const team = db.query(
                `SELECT employee_name, position, status FROM opc_hr_records WHERE company_id = ? AND status = 'active'`,
                p.company_id,
              );

              // 融资历史
              const fundingHistory = db.query(
                `SELECT round_name, amount, valuation_post, lead_investor, close_date, status
                 FROM opc_investment_rounds
                 WHERE company_id = ?
                 ORDER BY close_date DESC`,
                p.company_id,
              );

              // 商业模式
              const businessModel = db.queryOne(
                `SELECT * FROM opc_opb_canvas WHERE company_id = ?`,
                p.company_id,
              );

              // 月度增长率（最近 3 个月）
              const monthlyGrowth = [];
              for (let i = 0; i < 3; i++) {
                const monthStart = new Date(now.getFullYear(), now.getMonth() - i - 1, 1).toISOString().slice(0, 10);
                const monthEnd = new Date(now.getFullYear(), now.getMonth() - i, 0).toISOString().slice(0, 10);
                const monthRevenue = db.queryOne(
                  `SELECT COALESCE(SUM(amount), 0) as total
                   FROM opc_transactions
                   WHERE company_id = ? AND type = 'income' AND category LIKE '%income%'
                     AND transaction_date >= ? AND transaction_date <= ?`,
                  p.company_id, monthStart, monthEnd,
                ) as { total: number };
                monthlyGrowth.push({
                  month: monthStart.slice(0, 7),
                  revenue: monthRevenue?.total ?? 0,
                });
              }

              // 计算环比增长率
              const growthRates = [];
              for (let i = 0; i < monthlyGrowth.length - 1; i++) {
                const current = monthlyGrowth[i].revenue;
                const previous = monthlyGrowth[i + 1].revenue;
                const growthRate = previous > 0 ? ((current - previous) / previous * 100).toFixed(2) + "%" : "N/A";
                growthRates.push({
                  period: `${monthlyGrowth[i + 1].month} -> ${monthlyGrowth[i].month}`,
                  growth_rate: growthRate,
                });
              }

              return json({
                ok: true,
                generated_at: now.toISOString(),
                funding_datapack: {
                  company_info: company,
                  financial_summary: {
                    period: `${twelveMonthsAgo} 至 ${today}`,
                    revenue: revenue.toFixed(2),
                    cost: cost.toFixed(2),
                    profit: profit.toFixed(2),
                    profit_margin: profitMargin,
                    cash_balance: cash.toFixed(2),
                  },
                  growth_metrics: {
                    monthly_revenue: monthlyGrowth,
                    growth_rates: growthRates,
                    revenue_growth_trend: growthRates.length > 0 ? "详见 growth_rates" : "数据不足",
                  },
                  customer_metrics: {
                    total_customers: customers.length,
                    active_customers: customerCount,
                    average_ltv: avgLTV.toFixed(2),
                  },
                  team: team,
                  funding_history: fundingHistory,
                  business_model: businessModel ?? "未填写 OPB 画布",
                },
                usage_note: "此数据包可直接发送给投资人或用于商业计划书制作",
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
    { name: "opc_finance" },
  );

  api.logger.info("opc: 已注册 opc_finance 工具");
}
