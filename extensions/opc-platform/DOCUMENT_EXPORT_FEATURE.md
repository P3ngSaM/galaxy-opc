# OPC 平台文档生成功能增强 - Word/PDF/Excel 导出

## 概述

为 OPC 平台的文档生成工具添加了专业文件导出功能，支持将 Markdown 格式的文档导出为 Word (DOCX)、PDF 和 Excel 格式，满足创业者生成正式商业文档的需求。

## 新增功能

### 1. 导出现有文档 (export_document)

将已生成的 Markdown 文档导出为 Word 或 PDF 格式。

**参数**：
- `document_id` - 文档 ID（必填）
- `format` - 导出格式：`docx` 或 `pdf`（必填）
- `output_path` - 输出路径（可选，默认使用系统临时目录）

**使用示例**：
```javascript
// 导出为 Word
{
  "action": "export_document",
  "document_id": "doc-123",
  "format": "docx"
}

// 导出为 PDF 并指定输出路径
{
  "action": "export_document",
  "document_id": "doc-123",
  "format": "pdf",
  "output_path": "/path/to/output.pdf"
}
```

**返回结果**：
```json
{
  "ok": true,
  "document_id": "doc-123",
  "format": "docx",
  "file_path": "/tmp/opc_doc_1234567890_abc123.docx",
  "file_size": 15360
}
```

### 2. 生成财务报表 (generate_financial_report)

自动从交易数据生成三大财务报表：资产负债表、利润表、现金流量表。

**参数**：
- `company_id` - 公司 ID（必填）
- `report_type` - 报表类型（必填）：
  - `balance_sheet` - 资产负债表
  - `income_statement` - 利润表
  - `cashflow` - 现金流量表
- `start_date` - 开始日期（可选，格式：YYYY-MM-DD）
- `end_date` - 结束日期（可选，格式：YYYY-MM-DD）
- `format` - 导出格式：`excel` 或 `pdf`（必填）
- `output_path` - 输出路径（可选）

**使用示例**：
```javascript
// 生成 2026 年 Q1 利润表
{
  "action": "generate_financial_report",
  "company_id": "comp-001",
  "report_type": "income_statement",
  "start_date": "2026-01-01",
  "end_date": "2026-03-31",
  "format": "excel"
}
```

**返回结果**：
```json
{
  "ok": true,
  "file_path": "/tmp/opc_financial_income_statement_1234567890.xlsx",
  "file_size": 8192,
  "summary": {
    "company_name": "科技创新公司",
    "report_type": "income_statement",
    "period": "2026-01-01 - 2026-03-31"
  }
}
```

**生成的报表内容**：

#### 资产负债表
- 资产部分（流动资产、资产合计）
- 负债部分（流动负债、负债合计）
- 所有者权益
- 负债和所有者权益合计

#### 利润表
- 营业收入
- 营业成本
- 营业利润
- 净利润

#### 现金流量表
- 经营活动现金流量
- 投资活动现金流量
- 筹资活动现金流量
- 现金净增加额

### 3. 生成商业计划书 (generate_business_plan)

整合公司所有数据，自动生成完整的商业计划书。

**参数**：
- `company_id` - 公司 ID（必填）
- `format` - 导出格式：`docx` 或 `pdf`（必填）
- `output_path` - 输出路径（可选）

**使用示例**：
```javascript
{
  "action": "generate_business_plan",
  "company_id": "comp-001",
  "format": "docx"
}
```

**返回结果**：
```json
{
  "ok": true,
  "format": "docx",
  "file_path": "/tmp/opc_doc_1234567890_xyz789.docx",
  "file_size": 32768
}
```

**商业计划书内容结构**：

1. **项目概述**
   - 公司名称、行业、创始人信息
   - 注册资本
   - 项目描述

2. **商业模式 (OPB Canvas)**
   - 目标客户
   - 痛点问题
   - 解决方案
   - 独特价值
   - 渠道策略
   - 收入模式
   - 成本结构
   - 关键资源
   - 关键活动
   - 关键合作
   - 不公平优势
   - 核心指标
   - 非竞争承诺
   - 扩张策略

3. **团队介绍**
   - 核心团队成员列表
   - 角色和职责

4. **财务概况**
   - 累计收入
   - 累计支出
   - 净利润

5. **发展规划**
   - 未来计划和里程碑

## 技术实现

### 依赖包

```json
{
  "docx": "^9.6.0",      // Word 文档生成
  "pdfkit": "^0.17.2",   // PDF 文档生成
  "exceljs": "^4.4.0",   // Excel 文档生成
  "@types/pdfkit": "^0.17.5"
}
```

### Markdown 到 Word 转换

实现了智能的 Markdown 解析器，支持：
- 标题层级（H1-H3）→ Word 标题样式
- 粗体文本 `**text**` → 粗体格式
- 列表项 `- item` → 项目符号列表
- 分隔线 `---` → 空段落
- 混合格式段落（包含粗体的普通文本）

### PDF 生成

使用 PDFKit 库生成 PDF 文档：
- A4 纸张大小
- 50pt 页边距
- 自动分页
- 标题样式（18pt 粗体）
- 正文样式（12pt 常规）

### Excel 报表

使用 ExcelJS 生成专业财务报表：
- 标题行样式化（粗体 + 灰色背景）
- 自动列宽调整
- 科目分类和小计
- 数据自动聚合（从 `opc_transactions` 表）

## 文件路径管理

### 默认输出路径

文件默认保存到系统临时目录：
- Windows: `C:\Users\<user>\AppData\Local\Temp\`
- Linux/Mac: `/tmp/`

文件命名格式：
- 普通文档：`opc_doc_<timestamp>_<random>.{docx|pdf}`
- 财务报表：`opc_financial_<type>_<timestamp>.xlsx`

### 自定义输出路径

可通过 `output_path` 参数指定：
```javascript
{
  "action": "export_document",
  "document_id": "doc-123",
  "format": "docx",
  "output_path": "/home/user/documents/contract.docx"
}
```

## 数据来源

### 文档导出
- 数据表：`opc_documents`
- 字段：`title`, `content`

### 财务报表
- 数据表：`opc_transactions`
- 聚合逻辑：
  - 收入：`type = 'income'`
  - 支出：`type = 'expense'`
  - 时间筛选：`transaction_date BETWEEN start_date AND end_date`

### 商业计划书
- `opc_companies` - 公司基本信息
- `opc_opb_canvas` - 商业模式画布
- `opc_employees` - 团队成员
- `opc_transactions` - 财务数据

## 使用场景

### 场景 1：生成并导出合同

```javascript
// Step 1: 生成合同文档
{
  "action": "generate_document",
  "company_id": "comp-001",
  "doc_type": "contract",
  "variables": JSON.stringify({
    "counterparty": "北京科技有限公司",
    "service_content": "提供软件开发服务，包括需求分析、系统设计、编码实现、测试部署等全流程服务。",
    "amount": 100000,
    "start_date": "2026-03-01",
    "end_date": "2026-12-31",
    "payment_terms": "首付 30%，中期交付后支付 40%，验收通过后支付尾款 30%。"
  })
}

// Step 2: 导出为 Word
{
  "action": "export_document",
  "document_id": "<返回的文档ID>",
  "format": "docx"
}
```

### 场景 2：生成季度财务报表

```javascript
// 生成 Q1 资产负债表
{
  "action": "generate_financial_report",
  "company_id": "comp-001",
  "report_type": "balance_sheet",
  "start_date": "2026-01-01",
  "end_date": "2026-03-31",
  "format": "excel",
  "output_path": "./reports/Q1_balance_sheet.xlsx"
}

// 生成 Q1 利润表
{
  "action": "generate_financial_report",
  "company_id": "comp-001",
  "report_type": "income_statement",
  "start_date": "2026-01-01",
  "end_date": "2026-03-31",
  "format": "excel",
  "output_path": "./reports/Q1_income_statement.xlsx"
}
```

### 场景 3：融资准备 - 生成 BP

```javascript
// 确保已完善 OPB Canvas 数据
{
  "action": "update_opb_canvas",
  "company_id": "comp-001",
  "target_customer": "中小企业 IT 部门",
  "pain_point": "传统软件开发周期长、成本高、维护困难",
  "solution": "提供 AI 辅助的快速开发平台，降低 70% 开发成本",
  "unique_value": "业内首个集成 AI 代码生成和自动化测试的一体化平台",
  // ... 其他字段
}

// 生成商业计划书
{
  "action": "generate_business_plan",
  "company_id": "comp-001",
  "format": "docx",
  "output_path": "./business_plan_v1.0.docx"
}
```

## 常见问题

### Q1: PDF 中文显示为方块或乱码？

**原因**：PDFKit 默认使用 Helvetica 字体，不支持中文。

**解决方案**：
1. 短期：使用 DOCX 格式，然后用 Word/WPS 导出 PDF
2. 长期：在 `exportToPdf` 函数中注册中文字体文件：
```javascript
doc.registerFont('SimSun', './fonts/simsun.ttf');
doc.font('SimSun');
```

### Q2: 导出的 Excel 能否包含图表？

**当前版本**：仅支持数据表格。

**未来版本**：计划添加图表支持（柱状图、折线图、饼图）。

**临时方案**：在 Excel 中手动插入图表，或使用 Python 脚本后处理。

### Q3: Word 文档样式如何自定义？

修改 `markdownToDocxParagraphs` 函数中的样式参数：
```javascript
new Paragraph({
  text: line.slice(2),
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 240, after: 120 },  // 调整间距
  font: { name: "宋体", size: 18 },      // 调整字体
  alignment: AlignmentType.CENTER        // 居中对齐
})
```

### Q4: 批量导出多个文档？

当前需要逐个调用。未来版本将添加批量导出功能：
```javascript
{
  "action": "batch_export",
  "document_ids": ["doc-1", "doc-2", "doc-3"],
  "format": "pdf",
  "output_dir": "./exports/"
}
```

### Q5: 文件大小限制？

- Word: 建议 < 100MB
- PDF: 建议 < 50MB
- Excel: 建议 < 50MB，行数 < 100,000

超大文件可能导致内存溢出，请分批处理。

## 后续优化计划

### 短期（1-2 个月）
- [ ] 添加中文字体支持（PDF）
- [ ] 优化 Word 文档样式（字体、颜色、页眉页脚）
- [ ] 添加图表支持（Excel 财务报表）
- [ ] 支持批量导出

### 中期（3-6 个月）
- [ ] 用户自定义模板上传
- [ ] 模板市场（社区共享模板）
- [ ] 在线预览（Web UI 集成）
- [ ] 文档签名和水印
- [ ] 版本历史和协作编辑

### 长期（6-12 个月）
- [ ] AI 内容优化（自动润色、语法检查）
- [ ] 多语言支持（英文、日文 BP 生成）
- [ ] 集成电子签章（CA 证书）
- [ ] 导出为 HTML/ePub
- [ ] 移动端支持（PDF 阅读器适配）

## 贡献指南

欢迎贡献代码和模板！

### 提交流程
1. Fork 仓库
2. 创建功能分支 `feature/document-export-enhancement`
3. 提交代码并编写测试
4. 发起 Pull Request

### 代码规范
- TypeScript 严格模式
- 使用 ESLint + Prettier
- 单元测试覆盖率 > 80%
- 提供使用文档和示例

## 许可证

MIT License

---

**更新日期**: 2026-02-28
**版本**: 0.2.1
**维护者**: 星环 OPC 团队
