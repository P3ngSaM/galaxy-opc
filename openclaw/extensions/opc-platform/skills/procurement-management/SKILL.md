---
name: procurement-management
description: |
  服务采购管理技能。当用户提到采购、服务商、供应商、订单、外包、SaaS订阅、服务续费时激活。
---

# 服务采购管理技能

使用 `opc_procurement` 工具进行服务项目管理、采购订单管理和费用汇总。

## 服务项目管理

### 添加服务项目

```json
{
  "action": "create_service",
  "company_id": "公司ID",
  "name": "阿里云 ECS",
  "category": "saas",
  "provider": "阿里云",
  "unit_price": 500,
  "billing_cycle": "monthly",
  "description": "云服务器 2核4G"
}
```

服务类别: saas, outsource(外包), subscription(订阅), consulting(咨询), other

计费周期: monthly(月付), quarterly(季付), yearly(年付), one_time(一次性)

### 查看服务列表

```json
{
  "action": "list_services",
  "company_id": "公司ID",
  "category": "saas",
  "status": "active"
}
```

## 采购订单管理

### 创建采购订单

```json
{
  "action": "create_order",
  "company_id": "公司ID",
  "service_id": "服务ID",
  "title": "2025年Q2云服务器续费",
  "amount": 1500,
  "order_date": "2025-04-01",
  "delivery_date": "2025-04-01",
  "notes": "季度预付"
}
```

### 查看订单列表

```json
{
  "action": "list_orders",
  "company_id": "公司ID",
  "status": "pending"
}
```

订单状态: `pending` → `approved` → `paid`，或 `cancelled`

## 采购汇总

### 查看采购统计

```json
{
  "action": "order_summary",
  "company_id": "公司ID"
}
```

返回: 总订单数、总金额、按状态/类别分组统计、活跃服务月度成本。

## 使用建议

1. 先 `create_service` 建立服务项目清单（如云服务、设计外包、法律顾问）
2. 每次采购时 `create_order` 关联对应服务
3. 定期 `order_summary` 查看采购支出分布
4. 注意 `billing_cycle` 字段，方便预算规划
5. 对比采购支出和收入，及时调整成本结构
