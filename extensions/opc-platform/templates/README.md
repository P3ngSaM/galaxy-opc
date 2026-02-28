# OPC 文档模板目录

此目录存放文档生成工具使用的模板文件。

## 目录结构

```
templates/
├── contracts/          # 合同模板
│   ├── service_contract.json
│   ├── procurement_contract.json
│   └── employment_contract.json
├── reports/            # 报告模板
│   └── monthly_report.json
└── business_plan/      # 商业计划书模板
    └── standard_bp.json
```

## 当前状态

当前版本使用**内置模板**（硬编码在 `document-tool.ts` 中），支持以下文档类型：

- `contract` - 服务合同
- `quotation` - 报价单
- `receipt` - 收款收据
- `report` - 经营报告
- `letter` - 商务信函

## 未来规划

未来版本将支持：

1. **外部模板文件**：JSON 格式的模板定义
2. **用户自定义模板**：允许用户上传自己的模板
3. **模板版本管理**：支持模板的版本控制
4. **国际化支持**：多语言模板

## 模板格式示例 (JSON)

```json
{
  "id": "service_contract",
  "name": "服务合同模板",
  "category": "contract",
  "version": "1.0",
  "variables": {
    "required": ["company_name", "counterparty", "service_description", "amount", "start_date", "end_date"],
    "optional": ["payment_terms", "penalty_clause"]
  },
  "sections": [
    {
      "heading": "合同主体",
      "content": "甲方：{{company_name}}\n乙方：{{counterparty}}"
    },
    {
      "heading": "服务内容",
      "content": "{{service_description}}"
    },
    {
      "heading": "合同金额",
      "content": "总金额：人民币 {{amount}} 元整"
    }
  ],
  "metadata": {
    "author": "星环OPC团队",
    "created_at": "2026-02-28",
    "tags": ["合同", "服务"]
  }
}
```

## 使用方法

当前使用内置模板，调用示例：

```javascript
opc_document action=list_templates  // 查看所有可用模板

opc_document action=generate_document \
  company_id=xxx \
  doc_type=contract \
  variables='{"counterparty":"客户A","service_content":"开发服务",...}'
```

## 贡献指南

欢迎贡献新的模板！请遵循以下规范：

1. 使用 JSON 格式定义模板
2. 明确标注必填和可选变量
3. 提供模板描述和使用示例
4. 测试模板在不同场景下的效果
5. 提交 PR 前运行测试用例
