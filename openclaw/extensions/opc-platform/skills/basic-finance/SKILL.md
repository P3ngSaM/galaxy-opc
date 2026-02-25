---
name: basic-finance
description: |
  基础财务记账技能。当用户提到记账、收入、支出、报表、财务、收支、流水时激活。
---

# 基础财务技能

使用 `opc_manage` 工具进行收支记录和财务统计。

## 记账

### 记录收入

```json
{
  "action": "add_transaction",
  "company_id": "公司ID",
  "type": "income",
  "category": "service_income",
  "amount": 50000,
  "description": "XX项目开发尾款",
  "counterparty": "客户公司名",
  "transaction_date": "2025-01-15"
}
```

### 记录支出

```json
{
  "action": "add_transaction",
  "company_id": "公司ID",
  "type": "expense",
  "category": "rent",
  "amount": 3000,
  "description": "1月办公室租金",
  "counterparty": "房东姓名",
  "transaction_date": "2025-01-01"
}
```

## 交易分类

| 分类 | 类型 | 说明 |
|---|---|---|
| `service_income` | 收入 | 服务/咨询收入 |
| `product_income` | 收入 | 产品销售收入 |
| `investment_income` | 收入 | 投资收益 |
| `salary` | 支出 | 工资/人力成本 |
| `rent` | 支出 | 房租/场地费用 |
| `utilities` | 支出 | 水电网等公用事业 |
| `marketing` | 支出 | 营销/推广费用 |
| `tax` | 支出 | 税费 |
| `supplies` | 支出 | 办公用品/耗材 |
| `other` | 通用 | 其他 |

## 查询交易

### 交易列表

```json
{
  "action": "list_transactions",
  "company_id": "公司ID",
  "type": "income",
  "start_date": "2025-01-01",
  "end_date": "2025-01-31",
  "limit": 20
}
```

### 财务摘要

```json
{
  "action": "finance_summary",
  "company_id": "公司ID",
  "start_date": "2025-01-01",
  "end_date": "2025-03-31"
}
```

返回: 总收入、总支出、净利润、交易笔数。

## 记账建议

对话中，帮助创业者：
1. 收到收入/支出信息时，自动选择合适的分类
2. 如果用户说"上个月"，计算出具体日期范围
3. 定期提醒查看财务摘要
4. 如果净利润为负，温和地提出关注
5. 金额使用人民币（元），无需用户每次声明货币

## 平台看板

查看整体统计：
```json
{ "action": "dashboard" }
```
