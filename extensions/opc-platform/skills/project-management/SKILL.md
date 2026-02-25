---
name: project-management
description: |
  项目管理技能。当用户提到项目、任务、看板、排期、工时、里程碑、项目进度、任务分配时激活。
---

# 项目管理技能

使用 `opc_project` 工具进行项目创建、任务管理和进度追踪。

## 项目管理

### 创建项目

```json
{
  "action": "create_project",
  "company_id": "公司ID",
  "name": "XX客户官网重构",
  "description": "响应式重构，含前后端和部署",
  "start_date": "2025-04-01",
  "end_date": "2025-06-30",
  "budget": 150000
}
```

### 查看项目列表

```json
{
  "action": "list_projects",
  "company_id": "公司ID",
  "status": "active"
}
```

项目状态: `planning`(规划中) → `active`(进行中) → `completed`(已完成)，或 `paused`(暂停) / `cancelled`(取消)

### 更新项目

```json
{
  "action": "update_project",
  "project_id": "项目ID",
  "status": "active",
  "spent": 50000,
  "description": "新增移动端适配需求"
}
```

## 任务管理

### 添加任务

```json
{
  "action": "add_task",
  "project_id": "项目ID",
  "company_id": "公司ID",
  "title": "完成首页UI设计",
  "description": "参照竞品分析结果，设计3版方案",
  "assignee": "张三",
  "priority": "high",
  "due_date": "2025-04-15",
  "hours_estimated": 16
}
```

优先级: `urgent`(紧急) / `high`(高) / `medium`(中) / `low`(低)

### 查看任务列表

```json
{
  "action": "list_tasks",
  "project_id": "项目ID",
  "status": "in_progress"
}
```

任务按优先级和截止日期排序。

任务状态: `todo`(待办) → `in_progress`(进行中) → `review`(审核) → `done`(完成)

### 更新任务

```json
{
  "action": "update_task",
  "task_id": "任务ID",
  "status": "done",
  "hours_actual": 20
}
```

## 项目概况

```json
{
  "action": "project_summary",
  "project_id": "项目ID"
}
```

返回: 项目基本信息、各状态任务统计（数量/预估工时/实际工时）、逾期任务列表。

## 看板视图

```json
{
  "action": "kanban",
  "project_id": "项目ID"
}
```

返回四列看板: `todo` / `in_progress` / `review` / `done`

## 使用建议

1. 每个项目创建后先拆解为 5-10 个具体任务
2. 任务粒度建议 2-8 小时，太大需再拆分
3. 完成任务时填写 `hours_actual`，便于后续项目报价参考
4. 定期使用 `project_summary` 查看进度和逾期风险
5. 一人公司项目 `assignee` 可填自己名字或留空
6. 预算管理: 通过 `update_project` 更新 `spent` 字段追踪支出
