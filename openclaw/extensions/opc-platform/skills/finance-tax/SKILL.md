---
name: finance-tax
description: |
  财税管理技能。当用户提到发票、增值税、所得税、纳税申报、税务日历、开票、进项、销项时激活。
---

# 财税管理技能

使用 `opc_finance` 工具进行发票管理、税务计算和纳税申报。

## 发票管理

### 创建销项发票

```json
{
  "action": "create_invoice",
  "company_id": "公司ID",
  "type": "sales",
  "counterparty": "客户公司名称",
  "amount": 100000,
  "tax_rate": 0.06,
  "invoice_number": "INV-2025-001",
  "issue_date": "2025-03-15",
  "notes": "XX项目技术服务费"
}
```

### 创建进项发票

```json
{
  "action": "create_invoice",
  "company_id": "公司ID",
  "type": "purchase",
  "counterparty": "供应商名称",
  "amount": 20000,
  "tax_rate": 0.13,
  "issue_date": "2025-03-10"
}
```

### 查看发票列表

```json
{
  "action": "list_invoices",
  "company_id": "公司ID",
  "type": "sales",
  "status": "issued"
}
```

### 更新发票状态

```json
{
  "action": "update_invoice_status",
  "invoice_id": "发票ID",
  "status": "paid"
}
```

发票状态流转: `draft` → `issued` → `paid`，或 `draft` → `void`

## 税务计算

### 增值税计算

根据某税期的销项/进项发票自动汇算：

```json
{
  "action": "calc_vat",
  "company_id": "公司ID",
  "period": "2025-Q1"
}
```

返回: 销售额、销项税、进项税、应纳税额。

### 企业所得税计算

```json
{
  "action": "calc_income_tax",
  "company_id": "公司ID",
  "period": "2025",
  "annual_revenue": 500000,
  "annual_cost": 300000
}
```

- 小型微利企业（应纳税所得额 ≤ 300万）适用 5% 优惠税率
- 一般企业适用 25% 税率

## 纳税申报

### 创建申报记录

```json
{
  "action": "create_tax_filing",
  "company_id": "公司ID",
  "period": "2025-Q1",
  "tax_type": "vat",
  "revenue": 300000,
  "deductible": 50000,
  "tax_amount": 7500,
  "due_date": "2025-04-15"
}
```

### 查看申报列表

```json
{
  "action": "list_tax_filings",
  "company_id": "公司ID",
  "tax_type": "vat"
}
```

### 税务日历

```json
{
  "action": "tax_calendar",
  "company_id": "公司ID"
}
```

返回月度、季度、年度税务截止日期以及待处理的申报。

## 常见税率

| 类型 | 税率 | 适用 |
|---|---|---|
| 一般纳税人增值税 | 6% / 9% / 13% | 服务 / 建筑运输 / 货物 |
| 小规模纳税人增值税 | 3% | 简易计税 |
| 企业所得税（小微） | 5% | 应纳税所得额 ≤ 300万 |
| 企业所得税（一般） | 25% | 一般企业 |

## 使用建议

1. 每次开票或收到发票时及时录入
2. 每月底提醒用户查看税务日历
3. 季度末主动帮用户计算增值税和所得税预缴
4. `tax_rate` 默认 6%（服务类），货物类提醒用户确认 13%
5. 金额均为不含税金额，系统自动计算税额和含税总额
