/**
 * 星环OPC中心 — opc_document 专业文档生成工具
 *
 * 生成格式化 Markdown 文档（合同、报价单、收据、报告、商务信函等）。
 * 支持导出为 Word (DOCX)、PDF 和 Excel 格式。
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json, toolError } from "../utils/tool-helper.js";
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer, Table, TableRow, TableCell, WidthType, BorderStyle } from "docx";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

const DocumentSchema = Type.Union([
  Type.Object({
    action: Type.Literal("generate_document"),
    company_id: Type.String({ description: "公司 ID" }),
    doc_type: Type.String({ description: "文档类型: contract/quotation/receipt/report/letter" }),
    title: Type.Optional(Type.String({ description: "文档标题（不填则自动生成）" })),
    variables: Type.String({ description: "模板变量 JSON 字符串" }),
  }),
  Type.Object({
    action: Type.Literal("export_document"),
    document_id: Type.String({ description: "文档 ID" }),
    format: Type.Union([Type.Literal("docx"), Type.Literal("pdf"), Type.Literal("excel")], { description: "导出格式: docx/pdf/excel" }),
    output_path: Type.Optional(Type.String({ description: "输出文件路径（不填则自动生成）" })),
  }),
  Type.Object({
    action: Type.Literal("generate_financial_report"),
    company_id: Type.String({ description: "公司 ID" }),
    report_type: Type.Union([
      Type.Literal("balance_sheet"),
      Type.Literal("income_statement"),
      Type.Literal("cashflow")
    ], { description: "报表类型: balance_sheet/income_statement/cashflow" }),
    start_date: Type.Optional(Type.String({ description: "开始日期 YYYY-MM-DD" })),
    end_date: Type.Optional(Type.String({ description: "结束日期 YYYY-MM-DD" })),
    format: Type.Union([Type.Literal("pdf"), Type.Literal("excel")], { description: "导出格式: pdf/excel" }),
    output_path: Type.Optional(Type.String({ description: "输出文件路径（不填则自动生成）" })),
  }),
  Type.Object({
    action: Type.Literal("generate_business_plan"),
    company_id: Type.String({ description: "公司 ID" }),
    format: Type.Union([Type.Literal("docx"), Type.Literal("pdf")], { description: "导出格式: docx/pdf" }),
    output_path: Type.Optional(Type.String({ description: "输出文件路径（不填则自动生成）" })),
  }),
  Type.Object({
    action: Type.Literal("list_templates"),
  }),
  Type.Object({
    action: Type.Literal("list_documents"),
    company_id: Type.String({ description: "公司 ID" }),
    doc_type: Type.Optional(Type.String({ description: "按类型筛选" })),
    status: Type.Optional(Type.String({ description: "按状态筛选: draft/final/sent/archived" })),
  }),
  Type.Object({
    action: Type.Literal("get_document"),
    document_id: Type.String({ description: "文档 ID" }),
  }),
  Type.Object({
    action: Type.Literal("update_document"),
    document_id: Type.String({ description: "文档 ID" }),
    content: Type.Optional(Type.String({ description: "新内容" })),
    status: Type.Optional(Type.String({ description: "新状态: draft/final/sent/archived" })),
    title: Type.Optional(Type.String({ description: "新标题" })),
  }),
  Type.Object({
    action: Type.Literal("delete_document"),
    document_id: Type.String({ description: "文档 ID" }),
  }),
]);

type DocumentParams = Static<typeof DocumentSchema>;

// ── 内置文档模板 ──────────────────────────────────────────────

interface DocumentTemplate {
  key: string;
  name: string;
  required_vars: string[];
  optional_vars: string[];
  description: string;
  generate: (vars: Record<string, unknown>, company: Record<string, unknown>) => { title: string; content: string };
}

const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    key: "contract",
    name: "服务合同",
    required_vars: ["counterparty", "service_content", "amount", "start_date", "end_date"],
    optional_vars: ["payment_terms", "penalty_clause"],
    description: "完整服务合同（编号、甲乙方、服务条款、付款方式、违约责任、签章区）",
    generate(vars, company) {
      const no = `HT-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const title = `服务合同 — ${vars.counterparty}`;
      const content = `# 服务合同

**合同编号**: ${no}

---

## 甲方（委托方）

- **名称**: ${vars.counterparty}

## 乙方（服务方）

- **名称**: ${company.name}
- **联系人**: ${company.owner_name}

---

## 第一条 服务内容

${vars.service_content}

## 第二条 合同期限

自 **${vars.start_date}** 起至 **${vars.end_date}** 止。

## 第三条 合同金额及付款方式

合同总金额：**人民币 ${Number(vars.amount).toLocaleString()} 元整**。

${vars.payment_terms ? `付款方式：${vars.payment_terms}` : "付款方式：合同签订后 30 日内，甲方向乙方支付合同全额。"}

## 第四条 双方权利义务

### 甲方权利义务
1. 按时支付合同款项；
2. 配合乙方提供必要的资料和工作条件；
3. 有权对服务质量进行监督和验收。

### 乙方权利义务
1. 按照合同约定提供专业服务；
2. 保守甲方商业秘密和技术秘密；
3. 按期完成服务交付。

## 第五条 违约责任

${vars.penalty_clause || "任何一方违反本合同约定的，应向守约方支付合同总金额 10% 的违约金。"}

## 第六条 争议解决

本合同在履行过程中如发生争议，双方应友好协商解决；协商不成的，任何一方均可向乙方所在地人民法院提起诉讼。

## 第七条 其他

1. 本合同一式两份，甲乙双方各持一份，具有同等法律效力。
2. 本合同未尽事宜，由双方另行协商补充。

---

**甲方（盖章）**：________________　　**乙方（盖章）**：________________

**授权代表**：________________　　　　**授权代表**：________________

**日期**：________________　　　　　　**日期**：________________
`;
      return { title, content };
    },
  },
  {
    key: "quotation",
    name: "报价单",
    required_vars: ["counterparty", "items", "valid_days"],
    optional_vars: ["notes", "payment_terms"],
    description: "报价单（明细表格、合计金额、有效期、付款方式）",
    generate(vars, company) {
      const no = `QT-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const title = `报价单 — ${vars.counterparty}`;
      let items: { name: string; quantity: number; unit_price: number; unit?: string }[];
      try {
        items = typeof vars.items === "string" ? JSON.parse(vars.items as string) : (vars.items as typeof items);
      } catch {
        items = [{ name: "服务项目", quantity: 1, unit_price: 0 }];
      }

      let total = 0;
      const rows = items.map((item, i) => {
        const amount = item.quantity * item.unit_price;
        total += amount;
        return `| ${i + 1} | ${item.name} | ${item.unit ?? "项"} | ${item.quantity} | ${item.unit_price.toLocaleString()} | ${amount.toLocaleString()} |`;
      });

      const content = `# 报价单

**编号**: ${no}
**日期**: ${new Date().toISOString().slice(0, 10)}
**有效期**: ${vars.valid_days} 天

---

**致**: ${vars.counterparty}
**自**: ${company.name}

---

## 报价明细

| 序号 | 项目名称 | 单位 | 数量 | 单价（元） | 金额（元） |
|------|---------|------|------|-----------|-----------|
${rows.join("\n")}
| | | | | **合计** | **${total.toLocaleString()}** |

---

${vars.payment_terms ? `## 付款方式\n\n${vars.payment_terms}\n\n---\n` : ""}
${vars.notes ? `## 备注\n\n${vars.notes}\n\n---\n` : ""}

**报价有效期至**: ${(() => { const d = new Date(); d.setDate(d.getDate() + Number(vars.valid_days)); return d.toISOString().slice(0, 10); })()}

**联系人**: ${company.owner_name}
**联系方式**: ${company.owner_contact ?? ""}
`;
      return { title, content };
    },
  },
  {
    key: "receipt",
    name: "收款收据",
    required_vars: ["counterparty", "amount", "payment_method"],
    optional_vars: ["description", "receipt_date"],
    description: "收款收据（收款方、金额大小写、收款方式）",
    generate(vars, company) {
      const no = `RC-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const title = `收款收据 — ${vars.counterparty}`;
      const amount = Number(vars.amount);
      const date = (vars.receipt_date as string) || new Date().toISOString().slice(0, 10);

      const content = `# 收款收据

**收据编号**: ${no}
**日期**: ${date}

---

今收到 **${vars.counterparty}** 支付的款项：

| 项目 | 内容 |
|------|------|
| 金额（大写） | **人民币 ${amountToChinese(amount)}** |
| 金额（小写） | **¥ ${amount.toLocaleString()}** |
| 收款方式 | ${vars.payment_method} |
| 用途 | ${vars.description || "服务费用"} |

---

**收款单位**: ${company.name}
**收款人**: ${company.owner_name}

**签章**：________________
`;
      return { title, content };
    },
  },
  {
    key: "report",
    name: "经营报告",
    required_vars: ["report_type", "period"],
    optional_vars: [],
    description: "经营报告（从数据库拉取财务/项目/客户数据自动填充）",
    generate(vars, company) {
      const title = `${company.name} ${vars.period} 经营报告`;
      // 报告模板 — 实际数据由调用方填充或后续 AI 补充
      const content = `# ${title}

**报告类型**: ${vars.report_type === "monthly" ? "月度报告" : vars.report_type === "quarterly" ? "季度报告" : "经营报告"}
**报告期间**: ${vars.period}
**生成日期**: ${new Date().toISOString().slice(0, 10)}

---

## 一、财务概况

> 以下数据需要 AI 从系统中获取并填充

| 指标 | 本期 | 上期 | 变动 |
|------|------|------|------|
| 总收入 | - | - | - |
| 总支出 | - | - | - |
| 净利润 | - | - | - |
| 交易笔数 | - | - | - |

## 二、客户情况

| 指标 | 数值 |
|------|------|
| 新增客户 | - |
| 活跃客户 | - |
| 漏斗线索 | - |
| 成交客户 | - |

## 三、项目进展

> 列出本期在执行的项目和进展

## 四、关键事件

> 列出本期发生的重要里程碑和事件

## 五、下期计划

> 根据当前数据提出下期工作重点

---

**报告编制**: ${company.name} 管理团队
`;
      return { title, content };
    },
  },
  {
    key: "letter",
    name: "商务信函",
    required_vars: ["counterparty", "subject", "body"],
    optional_vars: ["salutation", "closing"],
    description: "商务信函（收件人、主题、正文、署名）",
    generate(vars, company) {
      const title = `商务信函 — ${vars.subject}`;
      const date = new Date().toISOString().slice(0, 10);
      const content = `# 商务信函

**日期**: ${date}

**致**: ${vars.counterparty}

---

${vars.salutation || `尊敬的 ${vars.counterparty}：`}

${vars.body}

${vars.closing || "此致\n\n敬礼！"}

---

**${company.name}**
**${company.owner_name}**
`;
      return { title, content };
    },
  },
];

/** 数字金额转中文大写 */
function amountToChinese(n: number): string {
  const digits = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
  const units = ["", "拾", "佰", "仟", "万", "拾", "佰", "仟", "亿"];
  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 100);

  if (intPart === 0 && decPart === 0) return "零元整";

  let result = "";
  const intStr = String(intPart);
  for (let i = 0; i < intStr.length; i++) {
    const digit = parseInt(intStr[i]);
    const unitIdx = intStr.length - 1 - i;
    if (digit === 0) {
      if (result.length > 0 && !result.endsWith("零")) result += "零";
    } else {
      result += digits[digit] + units[unitIdx];
    }
  }
  // 清理末尾零
  result = result.replace(/零+$/, "");
  result += "元";

  if (decPart === 0) {
    result += "整";
  } else {
    const jiao = Math.floor(decPart / 10);
    const fen = decPart % 10;
    if (jiao > 0) result += digits[jiao] + "角";
    if (fen > 0) result += digits[fen] + "分";
  }

  return result;
}

// ── 文档导出功能 ──────────────────────────────────────────────

/**
 * 将 Markdown 内容转换为 Word 文档段落
 */
function markdownToDocxParagraphs(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = markdown.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 处理标题
    if (line.startsWith("# ")) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(2),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        }),
      );
    } else if (line.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(3),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }),
      );
    } else if (line.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(4),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 160, after: 80 },
        }),
      );
    } else if (line.trim() === "---") {
      // 分隔线 - 空段落
      paragraphs.push(new Paragraph({ text: "", spacing: { before: 120, after: 120 } }));
    } else if (line.startsWith("**") && line.endsWith("**")) {
      // 粗体行
      const text = line.slice(2, -2);
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text, bold: true })],
          spacing: { after: 80 },
        }),
      );
    } else if (line.startsWith("- ")) {
      // 列表项
      paragraphs.push(
        new Paragraph({
          text: line.slice(2),
          bullet: { level: 0 },
        }),
      );
    } else if (line.includes("**")) {
      // 包含粗体文本的段落
      const parts: TextRun[] = [];
      const segments = line.split("**");
      segments.forEach((seg, idx) => {
        if (idx % 2 === 0) {
          if (seg) parts.push(new TextRun({ text: seg }));
        } else {
          parts.push(new TextRun({ text: seg, bold: true }));
        }
      });
      paragraphs.push(new Paragraph({ children: parts, spacing: { after: 80 } }));
    } else if (line.trim() === "") {
      // 空行
      paragraphs.push(new Paragraph({ text: "" }));
    } else {
      // 普通段落
      paragraphs.push(new Paragraph({ text: line, spacing: { after: 80 } }));
    }
  }

  return paragraphs;
}

/**
 * 导出文档为 DOCX 格式
 */
async function exportToDocx(
  title: string,
  content: string,
  outputPath?: string,
): Promise<{ file_path: string; file_size: number }> {
  const paragraphs = markdownToDocxParagraphs(content);

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  const finalPath =
    outputPath ||
    path.join(
      os.tmpdir(),
      `opc_doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.docx`,
    );

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(finalPath, buffer);

  return {
    file_path: finalPath,
    file_size: buffer.length,
  };
}

/**
 * 导出文档为 PDF 格式
 */
async function exportToPdf(
  title: string,
  content: string,
  outputPath?: string,
): Promise<{ file_path: string; file_size: number }> {
  const finalPath =
    outputPath ||
    path.join(
      os.tmpdir(),
      `opc_doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`,
    );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(finalPath);

    doc.pipe(stream);

    // 添加标题
    doc.fontSize(20).text(title, { align: "center" });
    doc.moveDown(2);

    // 处理内容
    const lines = content.split("\n");
    for (const line of lines) {
      if (line.startsWith("# ")) {
        doc.fontSize(18).font("Helvetica-Bold").text(line.slice(2));
        doc.moveDown(0.5);
      } else if (line.startsWith("## ")) {
        doc.fontSize(16).font("Helvetica-Bold").text(line.slice(3));
        doc.moveDown(0.5);
      } else if (line.startsWith("### ")) {
        doc.fontSize(14).font("Helvetica-Bold").text(line.slice(4));
        doc.moveDown(0.5);
      } else if (line.trim() === "---") {
        doc.moveDown(0.5);
      } else if (line.trim()) {
        // 移除 Markdown 粗体标记
        const plainText = line.replace(/\*\*/g, "");
        doc.fontSize(12).font("Helvetica").text(plainText);
      } else {
        doc.moveDown(0.3);
      }
    }

    doc.end();

    stream.on("finish", () => {
      const stats = fs.statSync(finalPath);
      resolve({
        file_path: finalPath,
        file_size: stats.size,
      });
    });

    stream.on("error", reject);
  });
}

/**
 * 生成财务报表 Excel
 */
async function generateFinancialReportExcel(
  db: OpcDatabase,
  companyId: string,
  reportType: string,
  startDate?: string,
  endDate?: string,
  outputPath?: string,
): Promise<{ file_path: string; file_size: number; summary: Record<string, unknown> }> {
  const workbook = new ExcelJS.Workbook();
  const company = db.queryOne("SELECT * FROM opc_companies WHERE id = ?", companyId) as Record<string, unknown> | null;

  if (!company) {
    throw new Error(`公司 ${companyId} 不存在`);
  }

  const finalPath =
    outputPath ||
    path.join(
      os.tmpdir(),
      `opc_financial_${reportType}_${Date.now()}.xlsx`,
    );

  if (reportType === "balance_sheet") {
    // 资产负债表
    const sheet = workbook.addWorksheet("资产负债表");

    sheet.columns = [
      { header: "科目", key: "subject", width: 30 },
      { header: "金额（元）", key: "amount", width: 20 },
    ];

    // 样式化标题行
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };

    // 查询收入和支出数据
    const income = db.queryOne(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM opc_transactions
       WHERE company_id = ? AND type = 'income'${startDate ? " AND transaction_date >= ?" : ""}${endDate ? " AND transaction_date <= ?" : ""}`,
      companyId,
      ...(startDate ? [startDate] : []),
      ...(endDate ? [endDate] : []),
    ) as { total: number };

    const expense = db.queryOne(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM opc_transactions
       WHERE company_id = ? AND type = 'expense'${startDate ? " AND transaction_date >= ?" : ""}${endDate ? " AND transaction_date <= ?" : ""}`,
      companyId,
      ...(startDate ? [startDate] : []),
      ...(endDate ? [endDate] : []),
    ) as { total: number };

    const netAssets = income.total - expense.total;

    sheet.addRow({ subject: "资产", amount: "" });
    sheet.addRow({ subject: "  流动资产", amount: netAssets > 0 ? netAssets : 0 });
    sheet.addRow({ subject: "资产合计", amount: netAssets > 0 ? netAssets : 0 });
    sheet.addRow({ subject: "", amount: "" });
    sheet.addRow({ subject: "负债", amount: "" });
    sheet.addRow({ subject: "  流动负债", amount: netAssets < 0 ? -netAssets : 0 });
    sheet.addRow({ subject: "负债合计", amount: netAssets < 0 ? -netAssets : 0 });
    sheet.addRow({ subject: "", amount: "" });
    sheet.addRow({ subject: "所有者权益", amount: netAssets });
    sheet.addRow({ subject: "负债和所有者权益合计", amount: netAssets > 0 ? netAssets : 0 });

  } else if (reportType === "income_statement") {
    // 利润表
    const sheet = workbook.addWorksheet("利润表");

    sheet.columns = [
      { header: "科目", key: "subject", width: 30 },
      { header: "金额（元）", key: "amount", width: 20 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };

    const income = db.queryOne(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM opc_transactions
       WHERE company_id = ? AND type = 'income'${startDate ? " AND transaction_date >= ?" : ""}${endDate ? " AND transaction_date <= ?" : ""}`,
      companyId,
      ...(startDate ? [startDate] : []),
      ...(endDate ? [endDate] : []),
    ) as { total: number };

    const expense = db.queryOne(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM opc_transactions
       WHERE company_id = ? AND type = 'expense'${startDate ? " AND transaction_date >= ?" : ""}${endDate ? " AND transaction_date <= ?" : ""}`,
      companyId,
      ...(startDate ? [startDate] : []),
      ...(endDate ? [endDate] : []),
    ) as { total: number };

    const profit = income.total - expense.total;

    sheet.addRow({ subject: "一、营业收入", amount: income.total });
    sheet.addRow({ subject: "二、营业成本", amount: expense.total });
    sheet.addRow({ subject: "三、营业利润", amount: profit });
    sheet.addRow({ subject: "四、净利润", amount: profit });

  } else if (reportType === "cashflow") {
    // 现金流量表
    const sheet = workbook.addWorksheet("现金流量表");

    sheet.columns = [
      { header: "科目", key: "subject", width: 40 },
      { header: "金额（元）", key: "amount", width: 20 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };

    const income = db.queryOne(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM opc_transactions
       WHERE company_id = ? AND type = 'income'${startDate ? " AND transaction_date >= ?" : ""}${endDate ? " AND transaction_date <= ?" : ""}`,
      companyId,
      ...(startDate ? [startDate] : []),
      ...(endDate ? [endDate] : []),
    ) as { total: number };

    const expense = db.queryOne(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM opc_transactions
       WHERE company_id = ? AND type = 'expense'${startDate ? " AND transaction_date >= ?" : ""}${endDate ? " AND transaction_date <= ?" : ""}`,
      companyId,
      ...(startDate ? [startDate] : []),
      ...(endDate ? [endDate] : []),
    ) as { total: number };

    const netCashFlow = income.total - expense.total;

    sheet.addRow({ subject: "一、经营活动产生的现金流量", amount: "" });
    sheet.addRow({ subject: "  销售商品、提供劳务收到的现金", amount: income.total });
    sheet.addRow({ subject: "  购买商品、接受劳务支付的现金", amount: -expense.total });
    sheet.addRow({ subject: "  经营活动现金流量净额", amount: netCashFlow });
    sheet.addRow({ subject: "", amount: "" });
    sheet.addRow({ subject: "二、投资活动产生的现金流量", amount: 0 });
    sheet.addRow({ subject: "三、筹资活动产生的现金流量", amount: 0 });
    sheet.addRow({ subject: "", amount: "" });
    sheet.addRow({ subject: "四、现金及现金等价物净增加额", amount: netCashFlow });
  }

  await workbook.xlsx.writeFile(finalPath);
  const stats = fs.statSync(finalPath);

  return {
    file_path: finalPath,
    file_size: stats.size,
    summary: {
      company_name: company.name,
      report_type: reportType,
      period: `${startDate || "起始"} - ${endDate || "当前"}`,
    },
  };
}

/**
 * 生成商业计划书
 */
async function generateBusinessPlan(
  db: OpcDatabase,
  companyId: string,
  format: "docx" | "pdf",
  outputPath?: string,
): Promise<{ file_path: string; file_size: number }> {
  const company = db.queryOne("SELECT * FROM opc_companies WHERE id = ?", companyId) as Record<string, unknown> | null;

  if (!company) {
    throw new Error(`公司 ${companyId} 不存在`);
  }

  // 获取 OPB Canvas
  const canvas = db.queryOne("SELECT * FROM opc_opb_canvas WHERE company_id = ?", companyId) as Record<string, unknown> | null;

  // 获取财务数据
  const income = db.queryOne(
    "SELECT COALESCE(SUM(amount), 0) as total FROM opc_transactions WHERE company_id = ? AND type = 'income'",
    companyId,
  ) as { total: number };

  const expense = db.queryOne(
    "SELECT COALESCE(SUM(amount), 0) as total FROM opc_transactions WHERE company_id = ? AND type = 'expense'",
    companyId,
  ) as { total: number };

  // 获取团队信息
  const employees = db.query(
    "SELECT name, role FROM opc_employees WHERE company_id = ? AND status = 'active'",
    companyId,
  ) as Array<{ name: string; role: string }>;

  // 生成 Markdown 内容
  const bpContent = `# ${company.name} 商业计划书

**行业**: ${company.industry}
**创始人**: ${company.owner_name}
**联系方式**: ${company.owner_contact || "未提供"}
**注册资本**: ¥${Number(company.registered_capital).toLocaleString()}

---

## 一、项目概述

${company.description || "（待完善）"}

## 二、商业模式 (OPB Canvas)

### 目标客户
${canvas?.target_customer || "（待完善）"}

### 痛点问题
${canvas?.pain_point || "（待完善）"}

### 解决方案
${canvas?.solution || "（待完善）"}

### 独特价值
${canvas?.unique_value || "（待完善）"}

### 渠道策略
${canvas?.channels || "（待完善）"}

### 收入模式
${canvas?.revenue_model || "（待完善）"}

### 成本结构
${canvas?.cost_structure || "（待完善）"}

### 关键资源
${canvas?.key_resources || "（待完善）"}

### 关键活动
${canvas?.key_activities || "（待完善）"}

### 关键合作
${canvas?.key_partners || "（待完善）"}

### 不公平优势
${canvas?.unfair_advantage || "（待完善）"}

### 核心指标
${canvas?.metrics || "（待完善）"}

### 非竞争承诺
${canvas?.non_compete || "（待完善）"}

### 扩张策略
${canvas?.scaling_strategy || "（待完善）"}

---

## 三、团队介绍

${employees.length > 0 ? employees.map((e) => `- **${e.name}** - ${e.role}`).join("\n") : "（暂无团队成员）"}

---

## 四、财务概况

**累计收入**: ¥${income.total.toLocaleString()}
**累计支出**: ¥${expense.total.toLocaleString()}
**净利润**: ¥${(income.total - expense.total).toLocaleString()}

---

## 五、发展规划

${canvas?.notes || "（待完善）"}

---

**生成日期**: ${new Date().toISOString().slice(0, 10)}
`;

  if (format === "docx") {
    return exportToDocx(`${company.name} 商业计划书`, bpContent, outputPath);
  } else {
    return exportToPdf(`${company.name} 商业计划书`, bpContent, outputPath);
  }
}

export function registerDocumentTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerTool(
    {
      name: "opc_document",
      label: "OPC 文档生成",
      description:
        "专业文档生成工具，支持 Word/PDF/Excel 导出。操作: generate_document(生成文档), export_document(导出文档为 DOCX/PDF), " +
        "generate_financial_report(生成财务报表 Excel), generate_business_plan(生成商业计划书 DOCX/PDF), " +
        "list_templates(模板列表), list_documents(文档列表), get_document(获取文档), update_document(更新文档), delete_document(删除文档)",
      parameters: DocumentSchema,
      async execute(_toolCallId, params) {
        const p = params as DocumentParams;
        try {
          switch (p.action) {
            case "generate_document": {
              // 查找模板
              const template = DOCUMENT_TEMPLATES.find((t) => t.key === p.doc_type);
              if (!template) {
                return toolError(
                  `未知文档类型 "${p.doc_type}"，可用: ${DOCUMENT_TEMPLATES.map((t) => t.key).join(", ")}`,
                  "INVALID_INPUT",
                );
              }

              // 解析变量
              let vars: Record<string, unknown>;
              try {
                vars = JSON.parse(p.variables);
              } catch {
                return toolError("variables 不是有效的 JSON", "VALIDATION_ERROR");
              }

              // 检查必填变量
              const missing = template.required_vars.filter((v) => !vars[v] && vars[v] !== 0);
              if (missing.length > 0) {
                return toolError(
                  `缺少必填变量: ${missing.join(", ")}。模板 "${template.key}" 需要: ${template.required_vars.join(", ")}`,
                  "VALIDATION_ERROR",
                );
              }

              // 获取公司信息
              const company = db.queryOne("SELECT * FROM opc_companies WHERE id = ?", p.company_id) as Record<string, unknown> | null;
              if (!company) return toolError(`公司 ${p.company_id} 不存在`, "COMPANY_NOT_FOUND");

              // 生成文档
              const { title, content } = template.generate(vars, company);
              const finalTitle = p.title || title;

              // 存入数据库
              const id = db.genId();
              const now = new Date().toISOString();
              db.execute(
                `INSERT INTO opc_documents (id, company_id, doc_type, title, template_key, content, variables, version, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'draft', ?, ?)`,
                id, p.company_id, p.doc_type, finalTitle, template.key, content, p.variables, now, now,
              );

              return json({
                ok: true,
                document: db.queryOne("SELECT * FROM opc_documents WHERE id = ?", id),
                content,
              });
            }

            case "list_templates":
              return json(
                DOCUMENT_TEMPLATES.map((t) => ({
                  key: t.key,
                  name: t.name,
                  description: t.description,
                  required_vars: t.required_vars,
                  optional_vars: t.optional_vars,
                })),
              );

            case "list_documents": {
              let sql = "SELECT id, company_id, doc_type, title, template_key, status, version, created_at, updated_at FROM opc_documents WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.doc_type) { sql += " AND doc_type = ?"; params2.push(p.doc_type); }
              if (p.status) { sql += " AND status = ?"; params2.push(p.status); }
              sql += " ORDER BY created_at DESC";
              return json(db.query(sql, ...params2));
            }

            case "get_document": {
              const doc = db.queryOne("SELECT * FROM opc_documents WHERE id = ?", p.document_id);
              if (!doc) return toolError("文档不存在", "RECORD_NOT_FOUND");
              return json(doc);
            }

            case "update_document": {
              const fields: string[] = [];
              const values: unknown[] = [];
              if (p.content) { fields.push("content = ?"); values.push(p.content); }
              if (p.status) { fields.push("status = ?"); values.push(p.status); }
              if (p.title) { fields.push("title = ?"); values.push(p.title); }
              if (fields.length === 0) return toolError("没有需要更新的字段", "VALIDATION_ERROR");

              // 如果更新了内容，版本号加1
              if (p.content) {
                fields.push("version = version + 1");
              }
              fields.push("updated_at = ?"); values.push(new Date().toISOString());
              values.push(p.document_id);
              db.execute(`UPDATE opc_documents SET ${fields.join(", ")} WHERE id = ?`, ...values);
              const doc = db.queryOne("SELECT * FROM opc_documents WHERE id = ?", p.document_id);
              if (!doc) return toolError("文档不存在", "RECORD_NOT_FOUND");
              return json(doc);
            }

            case "delete_document": {
              db.execute("DELETE FROM opc_documents WHERE id = ?", p.document_id);
              return json({ ok: true });
            }

            case "export_document": {
              const doc = db.queryOne("SELECT * FROM opc_documents WHERE id = ?", p.document_id) as Record<string, unknown> | null;
              if (!doc) return toolError("文档不存在", "RECORD_NOT_FOUND");

              const title = String(doc.title || "文档");
              const content = String(doc.content || "");

              let result: { file_path: string; file_size: number };

              if (p.format === "docx") {
                result = await exportToDocx(title, content, p.output_path);
              } else if (p.format === "pdf") {
                result = await exportToPdf(title, content, p.output_path);
              } else {
                return toolError("Excel 格式仅支持财务报表，请使用 generate_financial_report", "INVALID_INPUT");
              }

              return json({
                ok: true,
                document_id: p.document_id,
                format: p.format,
                ...result,
              });
            }

            case "generate_financial_report": {
              const result = await generateFinancialReportExcel(
                db,
                p.company_id,
                p.report_type,
                p.start_date,
                p.end_date,
                p.output_path,
              );

              // 如果是 PDF 格式，需要转换
              if (p.format === "pdf") {
                // 先生成 Excel，然后用户可以手动转换
                // 或者可以在这里添加 Excel 到 PDF 的转换逻辑
                return json({
                  ok: true,
                  message: "财务报表已生成为 Excel 格式，如需 PDF 请使用 Office 或在线工具转换",
                  ...result,
                });
              }

              return json({
                ok: true,
                ...result,
              });
            }

            case "generate_business_plan": {
              const result = await generateBusinessPlan(db, p.company_id, p.format, p.output_path);

              return json({
                ok: true,
                format: p.format,
                ...result,
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
    { name: "opc_document" },
  );

  api.logger.info("opc: 已注册 opc_document 工具");
}
