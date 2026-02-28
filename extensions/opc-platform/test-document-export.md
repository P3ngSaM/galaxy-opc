# OPC 文档生成工具 - 导出功能测试指南

## 新增功能概览

已为 OPC 平台的文档生成工具添加以下导出功能：

### 1. 导出现有文档为 Word/PDF
```
action: export_document
document_id: <文档ID>
format: docx | pdf
output_path: (可选) 输出文件路径
```

### 2. 生成财务报表 Excel
```
action: generate_financial_report
company_id: <公司ID>
report_type: balance_sheet | income_statement | cashflow
start_date: (可选) YYYY-MM-DD
end_date: (可选) YYYY-MM-DD
format: pdf | excel
output_path: (可选) 输出文件路径
```

### 3. 生成商业计划书 Word/PDF
```
action: generate_business_plan
company_id: <公司ID>
format: docx | pdf
output_path: (可选) 输出文件路径
```

## 测试用例

### 测试 1: 导出合同为 Word

1. 首先生成一个合同文档：
```json
{
  "action": "generate_document",
  "company_id": "test-company-001",
  "doc_type": "contract",
  "variables": "{\"counterparty\":\"客户公司A\",\"service_content\":\"软件开发服务\",\"amount\":100000,\"start_date\":\"2026-03-01\",\"end_date\":\"2026-12-31\"}"
}
```

2. 导出为 DOCX：
```json
{
  "action": "export_document",
  "document_id": "<上一步返回的文档ID>",
  "format": "docx"
}
```

预期结果：返回 DOCX 文件路径和大小

### 测试 2: 导出报价单为 PDF

1. 生成报价单：
```json
{
  "action": "generate_document",
  "company_id": "test-company-001",
  "doc_type": "quotation",
  "variables": "{\"counterparty\":\"客户公司B\",\"items\":[{\"name\":\"咨询服务\",\"quantity\":10,\"unit_price\":5000,\"unit\":\"小时\"}],\"valid_days\":30}"
}
```

2. 导出为 PDF：
```json
{
  "action": "export_document",
  "document_id": "<文档ID>",
  "format": "pdf"
}
```

预期结果：返回 PDF 文件路径和大小

### 测试 3: 生成财务报表

生成利润表 Excel：
```json
{
  "action": "generate_financial_report",
  "company_id": "test-company-001",
  "report_type": "income_statement",
  "start_date": "2026-01-01",
  "end_date": "2026-02-28",
  "format": "excel"
}
```

预期结果：返回 Excel 文件路径、大小和财务摘要

### 测试 4: 生成商业计划书

生成 DOCX 格式的商业计划书：
```json
{
  "action": "generate_business_plan",
  "company_id": "test-company-001",
  "format": "docx"
}
```

预期结果：返回包含完整商业计划书的 DOCX 文件

## 技术实现细节

### 依赖包
- `docx` - 生成 Word 文档
- `pdfkit` - 生成 PDF
- `exceljs` - 生成 Excel

### 文件输出位置
- 默认：系统临时目录 (`os.tmpdir()`)
- 自定义：通过 `output_path` 参数指定

### 数据来源
- **合同/报价单/收据**：从 `opc_documents` 表读取
- **财务报表**：从 `opc_transactions` 表聚合
- **商业计划书**：整合 `opc_companies`、`opc_opb_canvas`、`opc_employees`、`opc_transactions` 等多表数据

## 功能特性

### Markdown 转 Word
- 支持标题层级 (H1-H3)
- 支持粗体文本
- 支持列表
- 支持段落间距

### PDF 生成
- A4 纸张大小
- 自动分页
- 支持中文（需要系统字体）
- 标题样式化

### Excel 财务报表
- 标题行样式化（粗体 + 背景色）
- 自动列宽
- 三大报表支持：
  - 资产负债表
  - 利润表
  - 现金流量表

### 商业计划书
- 整合 OPB Canvas 15 个模块
- 自动填充财务数据
- 团队成员列表
- 生成日期标注

## 使用建议

1. **合同文档**：先用 `generate_document` 创建 Markdown 版本，确认内容无误后再用 `export_document` 导出正式格式

2. **财务报表**：定期生成 Excel 报表用于存档，PDF 版本用于对外展示

3. **商业计划书**：确保先完善 OPB Canvas 数据，生成的 BP 会更完整

4. **文件管理**：导出文件默认保存在临时目录，建议及时移动到永久存储位置

## 后续优化方向

1. 添加自定义模板支持（用户自定义 Word 模板）
2. 支持图表嵌入（财务趋势图、饼图等）
3. 支持批量导出
4. 添加文档签名/水印功能
5. 集成在线预览（Web UI）
6. 支持更多格式（ePub、HTML 等）

## 常见问题

**Q: 导出的 PDF 中文显示异常？**
A: PDFKit 默认使用 Helvetica 字体，不支持中文。需要在 `exportToPdf` 函数中注册中文字体文件。

**Q: 生成的 Excel 公式不生效？**
A: ExcelJS 支持公式，可以在 `generateFinancialReportExcel` 中添加公式逻辑。

**Q: 如何自定义 Word 文档样式？**
A: 修改 `markdownToDocxParagraphs` 函数中的字体、间距、颜色等参数。

**Q: 文件保存路径权限问题？**
A: 确保运行进程对 `output_path` 或系统临时目录有写入权限。
