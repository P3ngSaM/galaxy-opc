---
name: company-lifecycle
description: |
  公司生命周期管理技能。当用户提到里程碑、大事记、发展历程、时间线、公司报告、重大事件时激活。
---

# 公司生命周期管理技能

使用 `opc_lifecycle` 工具管理公司里程碑、大事件记录、时间线和综合报告。

## 里程碑管理

### 添加里程碑

```json
{
  "action": "add_milestone",
  "company_id": "公司ID",
  "title": "完成产品 MVP",
  "category": "product",
  "target_date": "2025-06-30",
  "description": "核心功能开发完成并上线内测"
}
```

里程碑类别: business(商业), product(产品), finance(财务), legal(法律), team(团队), other

### 查看里程碑列表

```json
{
  "action": "list_milestones",
  "company_id": "公司ID",
  "status": "pending",
  "category": "product"
}
```

里程碑状态: `pending` → `in_progress` → `completed`，或 `cancelled`

## 公司大事件

### 记录公司事件

```json
{
  "action": "create_event",
  "company_id": "公司ID",
  "title": "获得天使轮融资",
  "event_type": "funding",
  "event_date": "2025-03-15",
  "impact": "获得100万元启动资金",
  "description": "由某某资本领投，估值500万"
}
```

事件类型: registration(注册), funding(融资), product_launch(产品发布), partnership(合作), pivot(转型), expansion(扩张), other

### 查看事件列表

```json
{
  "action": "list_events",
  "company_id": "公司ID",
  "event_type": "funding"
}
```

## 时间线与报告

### 查看统一时间线

```json
{
  "action": "timeline",
  "company_id": "公司ID"
}
```

返回: 里程碑 + 事件合并排序的完整时间线。

### 生成公司综合报告

```json
{
  "action": "generate_report",
  "company_id": "公司ID"
}
```

返回: 公司基本信息、团队规模、财务摘要、客户数、合同数、项目数、里程碑完成度、融资情况、活跃告警数等全景数据。

## 使用建议

1. 公司注册时立即 `create_event` 记录注册事件
2. 设定短期和中期里程碑，定期跟踪进度
3. 每个重大决策（融资/合作/发布）都用 `create_event` 记录
4. 季度末用 `generate_report` 生成综合报告，复盘公司发展
5. 用 `timeline` 回顾公司完整发展历程
