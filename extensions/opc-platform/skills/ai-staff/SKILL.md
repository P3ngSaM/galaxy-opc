---
name: ai-staff
description: |
  AI 员工配置技能。当用户提到AI员工、AI团队、虚拟员工、配置员工、一人团队、AI助手角色时激活。
---

# AI 员工配置技能

使用 `opc_staff` 工具为一人公司配置 AI 员工团队，实现"一人 = AI 团队"的核心理念。每个 AI 员工拥有独立的角色定位和专业提示词。

## 快速上手

### 一键初始化默认团队

为公司快速创建 6 个标准 AI 岗位：

```json
{
  "action": "init_default_staff",
  "company_id": "公司ID"
}
```

默认团队包含：
- **行政助理** — 日程管理、文件归档、会议安排
- **HR 专员** — 招聘、入职、薪酬核算、社保公积金
- **财务顾问** — 账务、发票、税务申报、现金流分析
- **法务顾问** — 合同审查、知识产权、劳动法务
- **营销专员** — 内容创作、社交媒体运营、品牌推广
- **运营经理** — 项目管理、供应链协调、数据分析

## 自定义员工

### 配置/更新 AI 员工

```json
{
  "action": "configure_staff",
  "company_id": "公司ID",
  "role_id": "product_manager",
  "name": "产品经理",
  "system_prompt": "你是公司产品经理，负责需求分析、产品规划、用户体验优化和竞品调研。善于用数据驱动产品决策。",
  "skills": "requirement-analysis,user-research,roadmap"
}
```

### 查看内置角色模板

```json
{
  "action": "list_builtin_roles"
}
```

可用内置角色: admin(行政), hr(HR), finance(财务), legal(法务), marketing(营销), operations(运营)

### 查看已配置的员工

```json
{
  "action": "list_staff",
  "company_id": "公司ID"
}
```

### 启用/禁用员工

```json
{
  "action": "toggle_staff",
  "company_id": "公司ID",
  "role_id": "marketing",
  "enabled": false
}
```

## 工作原理

配置 AI 员工后，当用户进入公司 Agent 对话时：
1. 系统自动注入所有已启用员工的角色信息
2. AI 可根据问题类型自动"调度"对应岗位的专业知识
3. 每个员工的 system_prompt 定义了其专业能力边界

## 使用建议

1. 新公司注册后，先运行 `init_default_staff` 一键配置
2. 根据公司实际业务，添加自定义岗位（如产品经理、技术总监）
3. 暂时不需要的岗位可以 `toggle_staff` 禁用，无需删除
4. 定期更新员工的 system_prompt 以匹配公司最新业务方向
