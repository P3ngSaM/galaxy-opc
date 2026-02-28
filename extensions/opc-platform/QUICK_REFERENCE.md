# OPC 文档导出功能 - 快速参考

## 快速开始

### 1. 导出合同为 Word

```javascript
// 生成合同
opc_document {
  action: "generate_document",
  company_id: "comp-001",
  doc_type: "contract",
  variables: '{"counterparty":"客户A","service_content":"开发服务","amount":100000,"start_date":"2026-03-01","end_date":"2026-12-31"}'
}

// 导出为 DOCX
opc_document {
  action: "export_document",
  document_id: "doc-xxx",  // 上一步返回的 ID
  format: "docx"
}
```

### 2. 生成财务报表

```javascript
// 利润表
opc_document {
  action: "generate_financial_report",
  company_id: "comp-001",
  report_type: "income_statement",
  start_date: "2026-01-01",
  end_date: "2026-03-31",
  format: "excel"
}
```

### 3. 生成商业计划书

```javascript
opc_document {
  action: "generate_business_plan",
  company_id: "comp-001",
  format: "docx"
}
```

## 所有 Actions

| Action | 说明 | 格式支持 |
|--------|------|---------|
| `generate_document` | 生成文档（Markdown） | - |
| `export_document` | 导出文档 | DOCX, PDF |
| `generate_financial_report` | 生成财务报表 | Excel, PDF |
| `generate_business_plan` | 生成商业计划书 | DOCX, PDF |
| `list_templates` | 列出模板 | - |
| `list_documents` | 列出文档 | - |
| `get_document` | 获取文档详情 | - |
| `update_document` | 更新文档 | - |
| `delete_document` | 删除文档 | - |

## 文档类型

| 类型 | 说明 | 必填字段 |
|------|------|---------|
| `contract` | 服务合同 | counterparty, service_content, amount, start_date, end_date |
| `quotation` | 报价单 | counterparty, items, valid_days |
| `receipt` | 收款收据 | counterparty, amount, payment_method |
| `report` | 经营报告 | report_type, period |
| `letter` | 商务信函 | counterparty, subject, body |

## 财务报表类型

| 类型 | 说明 | 内容 |
|------|------|------|
| `balance_sheet` | 资产负债表 | 资产、负债、所有者权益 |
| `income_statement` | 利润表 | 收入、成本、利润 |
| `cashflow` | 现金流量表 | 经营/投资/筹资活动现金流 |

## 返回字段

所有导出操作返回：
```json
{
  "ok": true,
  "file_path": "/tmp/opc_doc_xxx.docx",
  "file_size": 15360,
  "format": "docx"
}
```

财务报表额外返回：
```json
{
  "summary": {
    "company_name": "公司名",
    "report_type": "income_statement",
    "period": "2026-01-01 - 2026-03-31"
  }
}
```

## 常用示例

### 报价单

```javascript
opc_document {
  action: "generate_document",
  company_id: "comp-001",
  doc_type: "quotation",
  variables: '{
    "counterparty": "北京科技公司",
    "items": [
      {"name": "咨询服务", "quantity": 10, "unit_price": 5000, "unit": "小时"},
      {"name": "开发服务", "quantity": 100, "unit_price": 800, "unit": "小时"}
    ],
    "valid_days": 30,
    "payment_terms": "合同签订后 7 日内支付"
  }'
}
```

### 收据

```javascript
opc_document {
  action: "generate_document",
  company_id: "comp-001",
  doc_type: "receipt",
  variables: '{
    "counterparty": "张三",
    "amount": 50000,
    "payment_method": "银行转账",
    "description": "软件开发首付款"
  }'
}
```

### 现金流量表

```javascript
opc_document {
  action: "generate_financial_report",
  company_id: "comp-001",
  report_type: "cashflow",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  format: "excel",
  output_path: "./2026_cashflow.xlsx"
}
```

## 文件路径

- 默认路径：系统临时目录
- Windows: `C:\Users\<user>\AppData\Local\Temp\`
- Linux/Mac: `/tmp/`
- 自定义：通过 `output_path` 参数指定

## 故障排除

| 问题 | 解决方案 |
|------|---------|
| PDF 中文乱码 | 使用 DOCX 格式 |
| 文件过大 | 分批处理或压缩 |
| 权限错误 | 检查输出路径权限 |
| 缺少数据 | 先完善 OPB Canvas |

## 相关文档

- [完整功能文档](./DOCUMENT_EXPORT_FEATURE.md)
- [测试指南](./test-document-export.md)
- [模板说明](./templates/README.md)
