---
name: investment-management
description: |
  投融资管理技能。当用户提到融资、投资人、估值、股权、cap table、融资轮次、天使轮、A轮时激活。
---

# 投融资管理技能

使用 `opc_investment` 工具进行融资轮次管理、投资人管理和股权结构分析。

## 融资轮次管理

### 创建融资轮次

```json
{
  "action": "create_round",
  "company_id": "公司ID",
  "round_name": "angel",
  "amount": 1000000,
  "valuation_pre": 5000000,
  "lead_investor": "某某资本",
  "close_date": "2025-06-30",
  "notes": "天使轮融资"
}
```

常见轮次: seed(种子轮), angel(天使轮), pre-A, A, B, C, D, IPO

### 查看融资轮次

```json
{
  "action": "list_rounds",
  "company_id": "公司ID",
  "status": "closed"
}
```

轮次状态: `planning` → `fundraising` → `closed`，或 `cancelled`

## 投资人管理

### 添加投资人

```json
{
  "action": "add_investor",
  "company_id": "公司ID",
  "round_id": "轮次ID",
  "name": "张三",
  "type": "angel",
  "amount": 500000,
  "equity_percent": 5,
  "contact": "zhangsan@example.com"
}
```

投资人类型: individual(个人), institutional(机构), angel(天使), vc(风投), strategic(战略投资)

### 查看投资人列表

```json
{
  "action": "list_investors",
  "company_id": "公司ID",
  "round_id": "轮次ID"
}
```

## 股权与估值

### 查看股权结构表 (Cap Table)

```json
{
  "action": "cap_table",
  "company_id": "公司ID"
}
```

返回: 所有投资人持股、总投资额、创始人剩余股权。

### 查看估值变化历史

```json
{
  "action": "valuation_history",
  "company_id": "公司ID"
}
```

返回: 各轮融资的投前/投后估值变化。

## 使用建议

1. 每次融资开启时先 `create_round`，确定轮次名称和目标金额
2. 逐个 `add_investor` 录入投资人信息
3. 融资完成后更新轮次状态为 `closed`
4. 定期查看 `cap_table` 了解股权分布
5. 投后估值 = 投前估值 + 融资金额（系统自动计算）
