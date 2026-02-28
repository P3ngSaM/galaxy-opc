# 星环 Galaxy OPC -- 一人公司 AI 管家

> **一人 = AI 团队**｜覆盖公司全生命周期：注册 → 运营 → 成长 → 退出

Galaxy OPC 是一套面向一人公司创业者的 AI 赋能平台。通过自然语言对话，即可完成公司注册、财税管理、法务合规、项目管理、投融资等全部经营事务 -- 无需雇人，AI 就是你的团队。

系统内置 **14 个专业工具、113 个操作指令、6 个 AI 员工岗位**，并提供可视化管理后台，让一人公司也能拥有完整的企业级管理能力。

**资金闭环模式**：当公司经营不善时，可通过「收并购 → 资产打包 → 城投转让 → 科技贷 → 融资服务费」实现资金回收，形成完整的商业闭环。

---

## 目录

- [1. 快速开始](#1-快速开始)
- [2. 功能模块总览](#2-功能模块总览)
- [3. 使用教程](#3-使用教程)
  - [3.1 注册第一家公司](#31-注册第一家公司)
  - [3.2 财务管理](#32-财务管理)
  - [3.3 客户与合同](#33-客户与合同)
  - [3.4 人力资源](#34-人力资源)
  - [3.5 项目管理](#35-项目管理)
  - [3.6 自媒体运营](#36-自媒体运营)
  - [3.7 文档生成与导出](#37-文档生成与导出)
  - [3.8 投融资](#38-投融资)
  - [3.9 运营监控](#39-运营监控)
  - [3.10 资金闭环](#310-资金闭环)
- [4. 管理后台指南](#4-管理后台指南)
- [5. 命令参考](#5-命令参考)
- [6. 数据与配置](#6-数据与配置)
- [7. 常见问题 FAQ](#7-常见问题-faq)

---

## 1. 快速开始

### 环境要求

- **Node.js >= 22**（推荐使用 [nvm](https://github.com/nvm-sh/nvm) 管理版本）

### 一键安装

```bash
npx galaxy-opc
```

安装向导会引导你完成 4 个步骤：

| 步骤 | 内容 |
|------|------|
| 1. 环境检查 | 检测 Node.js 版本、网络连接 |
| 2. OpenClaw 安装 | 安装 AI 对话引擎 OpenClaw |
| 3. 插件安装 | 安装 OPC 平台插件 (`galaxy-opc-plugin@0.2.1`) |
| 4. 模型配置 | 选择并配置 AI 大模型 |

### 支持的 AI 模型

**国内模型（推荐，速度快、有免费额度）：**

| 模型 | 认证方式 | 获取地址 |
|------|----------|----------|
| 通义千问 (Qwen) | OAuth 授权 / API Key | [dashscope.aliyun.com](https://dashscope.aliyun.com) |
| MiniMax | OAuth 授权 / API Key | [minimaxi.com](https://www.minimaxi.com) |
| 豆包 Doubao（火山引擎） | API Key | [console.volcengine.com](https://console.volcengine.com) |
| Kimi (Moonshot) | API Key | [platform.moonshot.ai](https://platform.moonshot.ai) |
| DeepSeek | API Key | [platform.deepseek.com](https://platform.deepseek.com) |

**国际模型：**

| 模型 | 说明 | 获取地址 |
|------|------|----------|
| OpenAI | gpt-4o-mini | [platform.openai.com](https://platform.openai.com) |
| Anthropic | claude-3-5-haiku | [console.anthropic.com](https://console.anthropic.com) |
| OpenRouter | 多模型聚合，一个 Key | [openrouter.ai](https://openrouter.ai) |

### 启动与访问

安装完成后，启动服务：

```bash
npx galaxy-opc start
```

访问以下地址：

| 地址 | 说明 |
|------|------|
| `http://localhost:18789` | Chat UI 对话界面 -- 与 AI 对话完成所有操作 |
| `http://localhost:18789/opc/admin?token=<你的token>` | 管理后台 -- 可视化管理公司数据 |
| `http://localhost:18789/opc/home` | 产品首页 -- 功能介绍与使用指南 |

> **提示**：token 在安装过程中自动生成，保存在 `~/.openclaw/.env` 文件中。

---

## 2. 功能模块总览

Galaxy OPC 按公司生命周期分为 4 组，共 14 个工具模块：

### 注册期（Phase 1 -- 核心工具，始终启用）

| 模块 | 工具名 | 功能描述 |
|------|--------|----------|
| 核心管理 | `opc_manage` | 公司注册/查询/更新、记账、客户管理、看板统计（16 个操作） |
| OPB 画布 | `opc_opb` | 一人企业商业画布（16 个模块），帮你梳理商业模式（3 个操作） |
| AI 员工 | `opc_staff` | 配置 6 个 AI 员工岗位：行政、HR、财务、法务、市场、运营（5 个操作） |
| 公司注册引导 | -- | 通过对话式交互引导完成公司注册全流程 |

### 运营期（Phase 2 -- 专业工具，可按需启用/禁用）

| 模块 | 工具名 | 功能描述 |
|------|--------|----------|
| 财税管理 | `opc_finance` | 发票管理、增值税/所得税计算、纳税申报、税务日历（10 个操作） |
| 法务助手 | `opc_legal` | 合同管理、风险检查、合规清单、合同模板（8 个操作） |
| 人力资源 | `opc_hr` | 员工管理、社保公积金计算、个税计算、薪酬汇总（7 个操作） |
| 项目管理 | `opc_project` | 项目/任务/看板/进度跟踪（10 个操作） |
| 新媒体运营 | `opc_media` | 内容管理、发布日历、平台运营指南（6 个操作） |
| 文档生成 | `opc_document` | 合同/报价单/收据生成，导出 Word/PDF/Excel（9 个操作） |
| 服务采购 | `opc_procurement` | 服务项目、采购订单、费用统计（8 个操作） |

### 成长期（Phase 3 -- 业务闭环工具，可按需启用/禁用）

| 模块 | 工具名 | 功能描述 |
|------|--------|----------|
| 投融资 | `opc_investment` | 融资轮次、投资人管理、股权结构表、估值历史（9 个操作） |
| 生命周期 | `opc_lifecycle` | 里程碑、大事记、时间线、公司综合报告（9 个操作） |
| 运营监控 | `opc_monitoring` | 指标记录、告警管理、KPI 汇总（7 个操作） |

### 退出期（资金闭环工具，始终启用）

| 模块 | 工具名 | 功能描述 |
|------|--------|----------|
| 收并购 | `opc_acquisition` | 收并购管理，亏损抵税计算（4 个操作） |
| 资产打包/城投转让 | `opc_asset_package` | 资产包管理、城投转让、科创贷、融资服务费（11 个操作） |

---

## 3. 使用教程

Galaxy OPC 通过自然语言对话驱动所有操作。你只需在 Chat UI（`http://localhost:18789`）中用日常语言告诉 AI 你想做什么，AI 会自动调用对应的工具完成任务。

以下每个场景都包含：**你可以对 AI 说的话** + **AI 实际调用的工具指令（JSON）**，方便你理解系统是如何工作的。

---

### 3.1 注册第一家公司

#### 第一步：填写 OPB 商业画布

先梳理你的商业模式。OPB 画布包含 16 个模块，AI 会引导你逐步填写。

**对 AI 说：**
> "我想创建一家做 AI 教育的一人公司，帮我先做一个商业画布。"

**AI 调用：**
```json
{
  "action": "canvas_init",
  "company_id": "公司ID",
  "track": "AI 教育",
  "target_customer": "想学 AI 的职场人",
  "pain_point": "AI 学习门槛高，缺乏实战项目",
  "solution": "AI 实战训练营 + 一对一辅导",
  "unique_value": "从零到项目落地的完整学习路径",
  "channels": "小红书、抖音、知乎",
  "revenue_model": "课程销售 + 企业内训",
  "cost_structure": "AI 工具订阅、内容制作、平台推广",
  "key_resources": "AI 技术能力、教学经验",
  "key_activities": "课程开发、内容运营、学员服务",
  "key_partners": "AI 平台、在线教育平台",
  "unfair_advantage": "多年 AI 从业经验 + 真实项目案例",
  "key_metrics": "付费学员数、完课率、续费率",
  "non_compete_strategy": "聚焦垂直领域，不做大而全",
  "scaling_path": "录播课程 → 训练营 → 企业服务 → AI 教育 SaaS"
}
```

#### 第二步：注册公司

**对 AI 说：**
> "帮我注册一家公司，名称叫星辰 AI 学院，行业是教育科技，注册资本 10 万元。"

**AI 调用：**
```json
{
  "action": "register_company",
  "name": "星辰AI学院",
  "industry": "教育科技",
  "owner_name": "张三",
  "owner_contact": "zhangsan@example.com",
  "registered_capital": 100000,
  "description": "AI 教育一人公司"
}
```

#### 第三步：激活公司

**对 AI 说：**
> "激活这家公司。"

**AI 调用：**
```json
{
  "action": "activate_company",
  "company_id": "公司ID"
}
```

#### 第四步：初始化 AI 员工团队

**对 AI 说：**
> "帮我初始化默认的 AI 员工团队。"

**AI 调用：**
```json
{
  "action": "init_default_staff",
  "company_id": "公司ID"
}
```

系统会自动创建 6 个 AI 员工岗位：

| 岗位 | 角色代码 | 职责 |
|------|----------|------|
| 行政助理 | `admin` | 日常行政、文件管理 |
| HR 专员 | `hr` | 招聘、员工管理 |
| 财务顾问 | `finance` | 记账、税务规划 |
| 法务助理 | `legal` | 合同审查、合规管理 |
| 市场推广 | `marketing` | 品牌、营销、获客 |
| 运营经理 | `ops` | 数据分析、运营优化 |

> **提示**：你也可以自定义岗位 -- 对 AI 说 "给公司配置一个产品经理岗位"，AI 会调用 `configure_staff` 创建自定义角色。

---

### 3.2 财务管理

#### 记一笔收入

**对 AI 说：**
> "今天收到客户李四付款 5000 元，课程费用。"

**AI 调用：**
```json
{
  "action": "add_transaction",
  "company_id": "公司ID",
  "type": "income",
  "category": "课程收入",
  "amount": 5000,
  "description": "客户课程费用",
  "counterparty": "李四",
  "transaction_date": "2026-02-27"
}
```

#### 记一笔支出

**对 AI 说：**
> "今天花了 200 元买了 AI 工具订阅。"

**AI 调用：**
```json
{
  "action": "add_transaction",
  "company_id": "公司ID",
  "type": "expense",
  "category": "工具订阅",
  "amount": 200,
  "description": "AI 工具月度订阅费",
  "counterparty": "某SaaS平台",
  "transaction_date": "2026-02-27"
}
```

#### 开一张发票

**对 AI 说：**
> "给李四开一张 5000 元的销售发票。"

**AI 调用：**
```json
{
  "action": "create_invoice",
  "company_id": "公司ID",
  "type": "sales",
  "counterparty": "李四",
  "amount": 5000,
  "tax_rate": 0.03,
  "issue_date": "2026-02-27"
}
```

#### 计算增值税

**对 AI 说：**
> "帮我算一下这个季度要交多少增值税。"

**AI 调用：**
```json
{
  "action": "calc_vat",
  "company_id": "公司ID",
  "period": "2026-Q1"
}
```

> 系统按小规模纳税人 3% 税率自动计算。

#### 计算企业所得税

**对 AI 说：**
> "今年预计收入 50 万，成本 30 万，帮我算下所得税。"

**AI 调用：**
```json
{
  "action": "calc_income_tax",
  "company_id": "公司ID",
  "period": "2026",
  "annual_revenue": 500000,
  "annual_cost": 300000
}
```

> 小型微利企业税率 5%，一般企业 25%。

#### 纳税申报

**对 AI 说：**
> "创建一条 2026 年 Q1 的增值税申报记录。"

**AI 调用：**
```json
{
  "action": "create_tax_filing",
  "company_id": "公司ID",
  "period": "2026-Q1",
  "tax_type": "vat",
  "revenue": 150000,
  "deductible": 0,
  "tax_amount": 4500,
  "due_date": "2026-04-15"
}
```

#### 查看税务日历

**对 AI 说：**
> "接下来有哪些报税截止日？"

**AI 调用：**
```json
{
  "action": "tax_calendar",
  "company_id": "公司ID"
}
```

> 税务日历会列出月度（增值税）、季度（所得税预缴）、年度（汇算清缴/工商年报）的截止日期。

---

### 3.3 客户与合同

#### 添加客户/联系人

**对 AI 说：**
> "添加一个客户，王五，电话 13800138000，是 ABC 公司的。"

**AI 调用：**
```json
{
  "action": "add_contact",
  "company_id": "公司ID",
  "name": "王五",
  "phone": "13800138000",
  "company_name": "ABC公司",
  "tags": "[\"客户\", \"企业\"]"
}
```

#### 创建合同

**对 AI 说：**
> "跟 ABC 公司签一份 10 万元的服务合同，期限一年。"

**AI 调用：**
```json
{
  "action": "create_contract",
  "company_id": "公司ID",
  "title": "AI 培训服务合同",
  "counterparty": "ABC公司",
  "contract_type": "服务合同",
  "amount": 100000,
  "start_date": "2026-03-01",
  "end_date": "2027-02-28",
  "key_terms": "每月提供 4 次 AI 培训课程"
}
```

#### 合同风险检查

**对 AI 说：**
> "帮我检查一下这份服务合同有没有风险。"

**AI 调用：**
```json
{
  "action": "contract_risk_check",
  "contract_type": "服务合同",
  "key_terms": "每月提供 4 次 AI 培训课程，违约金 10%"
}
```

> 系统内置服务合同、采购合同、劳动合同、租赁合同的风险检查清单。

#### 查看合规清单

**对 AI 说：**
> "看看我公司有哪些合规事项要处理。"

**AI 调用：**
```json
{
  "action": "compliance_checklist",
  "company_id": "公司ID"
}
```

> 合规清单包含年度/月度合规事项，以及即将到期的合同提醒。

#### 获取合同模板

**对 AI 说：**
> "给我一份 NDA 保密协议模板。"

**AI 调用：**
```json
{
  "action": "contract_template",
  "contract_type": "NDA"
}
```

> 内置模板：服务合同、NDA（保密协议）、劳动合同、租赁合同。

---

### 3.4 人力资源

#### 员工入职

**对 AI 说：**
> "录入一名新员工，赵六，产品经理，月薪 15000，全职，3 月 1 日入职。"

**AI 调用：**
```json
{
  "action": "add_employee",
  "company_id": "公司ID",
  "employee_name": "赵六",
  "position": "产品经理",
  "salary": 15000,
  "contract_type": "full_time",
  "start_date": "2026-03-01"
}
```

> 合同类型支持：`full_time`（全职）、`part_time`（兼职）、`contractor`（外包）、`intern`（实习）。

#### 社保公积金计算

**对 AI 说：**
> "帮我算一下月薪 15000 在北京要交多少社保和公积金。"

**AI 调用：**
```json
{
  "action": "calc_social_insurance",
  "salary": 15000,
  "city": "北京"
}
```

> 系统自动计算五险一金（养老、医疗、失业、工伤、生育 + 公积金），包含个人和企业缴纳部分。

#### 个税计算

**对 AI 说：**
> "月薪 15000，社保扣了 2000，专项附加扣除 1500，算一下个税。"

**AI 调用：**
```json
{
  "action": "calc_personal_tax",
  "monthly_salary": 15000,
  "social_insurance": 2000,
  "special_deduction": 1500
}
```

> 按累进税率计算，扣除 5000 元起征点。

#### 薪酬汇总

**对 AI 说：**
> "看看公司现在总共的用工成本是多少。"

**AI 调用：**
```json
{
  "action": "payroll_summary",
  "company_id": "公司ID"
}
```

> 自动汇总所有在职员工的总薪资、总社保、总公积金和总用工成本。

---

### 3.5 项目管理

#### 创建项目

**对 AI 说：**
> "创建一个新项目，AI 训练营第一期，预算 5 万，3 月到 6 月。"

**AI 调用：**
```json
{
  "action": "create_project",
  "company_id": "公司ID",
  "name": "AI训练营第一期",
  "description": "面向职场人的 AI 实战训练营",
  "start_date": "2026-03-01",
  "end_date": "2026-06-30",
  "budget": 50000
}
```

#### 添加任务

**对 AI 说：**
> "给训练营项目加一个任务：编写课程大纲，优先级高，下周五前完成，预计 16 小时。"

**AI 调用：**
```json
{
  "action": "add_task",
  "project_id": "项目ID",
  "company_id": "公司ID",
  "title": "编写课程大纲",
  "description": "完成第一期训练营 12 节课的课程大纲",
  "assignee": "张三",
  "priority": "high",
  "due_date": "2026-03-07",
  "hours_estimated": 16
}
```

> 优先级：`low`（低）、`medium`（中）、`high`（高）、`urgent`（紧急）。

#### 更新任务状态

**对 AI 说：**
> "课程大纲写完了，把任务标记为完成，实际用了 12 小时。"

**AI 调用：**
```json
{
  "action": "update_task",
  "task_id": "任务ID",
  "status": "done",
  "hours_actual": 12
}
```

> 任务状态：`todo`（待办）→ `in_progress`（进行中）→ `review`（待审）→ `done`（完成）。

#### 查看看板

**对 AI 说：**
> "看一下训练营项目的看板。"

**AI 调用：**
```json
{
  "action": "kanban",
  "project_id": "项目ID"
}
```

> 看板分为 4 栏：待办 (todo) → 进行中 (in_progress) → 待审 (review) → 完成 (done)。

#### 项目进度汇报

**对 AI 说：**
> "给我一份训练营项目的进度报告。"

**AI 调用：**
```json
{
  "action": "project_summary",
  "project_id": "项目ID"
}
```

> 包含任务完成统计、逾期任务列表、预算使用情况。

---

### 3.6 自媒体运营

#### 创建内容

**对 AI 说：**
> "帮我创建一篇小红书笔记，标题是《一人公司如何用 AI 降本增效》。"

**AI 调用：**
```json
{
  "action": "create_content",
  "company_id": "公司ID",
  "title": "一人公司如何用 AI 降本增效",
  "platform": "小红书",
  "content_type": "article",
  "content": "正文内容...",
  "tags": "AI,一人公司,效率"
}
```

> 内容类型：`article`（文章）、`short_video`（短视频）、`image`（图文）、`live`（直播）、`other`（其他）。

#### 安排发布时间

**对 AI 说：**
> "把这篇笔记安排在下周一上午 10 点发布。"

**AI 调用：**
```json
{
  "action": "update_content",
  "content_id": "内容ID",
  "status": "scheduled"
}
```

#### 查看发布日历

**对 AI 说：**
> "看一下 3 月份的内容发布计划。"

**AI 调用：**
```json
{
  "action": "content_calendar",
  "company_id": "公司ID",
  "month": "2026-03"
}
```

#### 获取平台运营指南

**对 AI 说：**
> "给我看看小红书的运营技巧。"

**AI 调用：**
```json
{
  "action": "platform_guide",
  "platform": "小红书"
}
```

> 内置 6 大平台运营指南：**微信公众号、小红书、抖音、微博、知乎、B站**。每个指南包含内容格式建议、最佳发布时间、运营技巧。

---

### 3.7 文档生成与导出

#### 生成合同文档

**对 AI 说：**
> "帮我生成一份服务合同，对方是北京科技公司，服务内容是软件开发，合同金额 10 万元，合同期限从 2026-03-01 到 2026-12-31。"

**AI 调用：**
```json
{
  "action": "generate_document",
  "company_id": "公司ID",
  "doc_type": "contract",
  "variables": "{\"counterparty\":\"北京科技公司\",\"service_content\":\"软件开发服务\",\"amount\":100000,\"start_date\":\"2026-03-01\",\"end_date\":\"2026-12-31\"}"
}
```

> 支持的文档类型：`contract`（合同）、`quotation`（报价单）、`receipt`（收据）、`report`（报告）、`letter`（信函）。

#### 导出文档为 Word/PDF

**对 AI 说：**
> "把这份合同导出为 Word 文档。"

**AI 调用：**
```json
{
  "action": "export_document",
  "document_id": "文档ID",
  "format": "docx"
}
```

系统会返回文件路径和大小，你可以直接下载使用。

> 支持的导出格式：`docx`（Word）、`pdf`（PDF）。

#### 生成财务报表

**对 AI 说：**
> "生成 2026 年第一季度的利润表，导出为 Excel。"

**AI 调用：**
```json
{
  "action": "generate_financial_report",
  "company_id": "公司ID",
  "report_type": "income_statement",
  "start_date": "2026-01-01",
  "end_date": "2026-03-31",
  "format": "excel"
}
```

> 支持的财务报表类型：
> - `balance_sheet`（资产负债表）
> - `income_statement`（利润表）
> - `cashflow`（现金流量表）

#### 生成商业计划书

**对 AI 说：**
> "生成一份完整的商业计划书，Word 格式。"

**AI 调用：**
```json
{
  "action": "generate_business_plan",
  "company_id": "公司ID",
  "format": "docx"
}
```

商业计划书会自动整合以下数据：
- 公司基本信息
- OPB Canvas 商业模式
- 团队成员列表
- 财务数据概览
- 发展规划

> **提示**：生成 BP 前请先完善 OPB Canvas 数据，否则内容会不完整。详细功能文档请查看 [文档导出功能说明](./extensions/opc-platform/DOCUMENT_EXPORT_FEATURE.md)。

---

### 3.8 投融资

#### 创建融资轮次

**对 AI 说：**
> "创建一轮天使融资，目标融资 100 万，投前估值 500 万。"

**AI 调用：**
```json
{
  "action": "create_round",
  "company_id": "公司ID",
  "round_name": "angel",
  "amount": 1000000,
  "valuation_pre": 5000000,
  "valuation_post": 6000000,
  "notes": "天使轮融资"
}
```

> 融资轮次：`seed`（种子）、`angel`（天使）、`pre-A`、`A`、`B`、`C`、`D`、`IPO`。

#### 添加投资人

**对 AI 说：**
> "添加一个天使投资人，张总，投 50 万占 8%。"

**AI 调用：**
```json
{
  "action": "add_investor",
  "company_id": "公司ID",
  "round_id": "轮次ID",
  "name": "张总",
  "type": "angel",
  "amount": 500000,
  "equity_percent": 8,
  "contact": "zhang@example.com"
}
```

> 投资人类型：`individual`（个人）、`institutional`（机构）、`angel`（天使）、`vc`（风投）、`strategic`（战略投资）。

#### 查看股权结构表（Cap Table）

**对 AI 说：**
> "看一下公司现在的股权结构。"

**AI 调用：**
```json
{
  "action": "cap_table",
  "company_id": "公司ID"
}
```

> 自动汇总所有投资人持股比例，并计算创始人剩余股权。

#### 估值历史

**对 AI 说：**
> "公司历次估值变化是怎样的？"

**AI 调用：**
```json
{
  "action": "valuation_history",
  "company_id": "公司ID"
}
```

---

### 3.9 运营监控

#### 记录 KPI 指标

**对 AI 说：**
> "记录一下本月的付费用户数是 120 人。"

**AI 调用：**
```json
{
  "action": "record_metric",
  "company_id": "公司ID",
  "name": "付费用户数",
  "value": 120,
  "unit": "人",
  "category": "user"
}
```

> 指标分类：`revenue`（营收）、`user`（用户）、`conversion`（转化）、`cost`（成本）、`other`（其他）。

#### 创建告警

**对 AI 说：**
> "创建一个警告：本月收入低于预期。"

**AI 调用：**
```json
{
  "action": "create_alert",
  "company_id": "公司ID",
  "title": "月收入低于预期",
  "severity": "warning",
  "category": "revenue",
  "message": "2 月收入仅达目标的 60%，需关注获客渠道"
}
```

> 告警级别：`info`（信息）、`warning`（警告）、`critical`（严重）。

#### KPI 汇总

**对 AI 说：**
> "给我一份公司的 KPI 总览。"

**AI 调用：**
```json
{
  "action": "kpi_summary",
  "company_id": "公司ID"
}
```

> KPI 汇总会自动跨表聚合：财务数据、团队规模、项目进度、合同状态、客户数量、活跃告警、近期指标等多维数据。

#### Webhook 推送

系统支持将告警和提醒自动推送到飞书、企业微信等平台。在管理后台的「工具管理」页面配置 Webhook URL 即可。

后台服务每小时自动扫描一次，推送以下提醒：
- 税务申报到期提醒（提前 7 天）
- 合同到期提醒（提前 30 天）
- 现金流预警（净流出超阈值）
- 融资轮次截止跟进

---

### 3.10 资金闭环

资金闭环是 Galaxy OPC 的核心商业模式，完整流程如下：

```
经营不善的公司 → 收并购（亏损抵税）→ 资产打包 → 城投转让 → 科技贷 → 融资服务费
```

#### 第一步：发起收购

当一人公司经营不善时，发起收并购，亏损可用于抵扣应纳税所得额。

**对 AI 说：**
> "这家公司经营不善，亏损 20 万，帮我发起收购。"

**AI 调用：**
```json
{
  "action": "create_acquisition",
  "company_id": "公司ID",
  "trigger_reason": "连续亏损，无法持续经营",
  "acquisition_price": 10000,
  "loss_amount": 200000
}
```

> 系统自动将公司标记为 `acquired` 状态，并计算税务抵扣额（亏损 × 25%）。

#### 第二步：创建资产包

将多个已收购公司组合成科创资产包。

**对 AI 说：**
> "创建一个科创资产包，把收购的公司打包进去。"

**AI 调用：**
```json
{
  "action": "create_asset_package",
  "name": "2026年Q1科创资产包",
  "description": "AI 教育赛道收并购资产包"
}
```

#### 第三步：将公司加入资产包

**对 AI 说：**
> "把刚收购的公司加入资产包。"

**AI 调用：**
```json
{
  "action": "add_company_to_package",
  "package_id": "资产包ID",
  "company_id": "公司ID",
  "acquisition_case_id": "收购案例ID",
  "valuation": 50000
}
```

> 系统自动汇总资产包总估值。

#### 第四步：发起城投转让

将资产包转让给城投公司，由城投公司申请科技创新贷款。

**对 AI 说：**
> "把这个资产包转让给城投公司，目标科创贷 500 万。"

**AI 调用：**
```json
{
  "action": "create_ct_transfer",
  "package_id": "资产包ID",
  "ct_company": "XX城投发展有限公司",
  "transfer_price": 100000,
  "sci_loan_target": 5000000
}
```

#### 第五步：记录融资服务费

科创贷审批后，按比例收取融资服务费，完成资金闭环。

**对 AI 说：**
> "科创贷批下来 500 万，按 3% 收取服务费。"

**AI 调用：**
```json
{
  "action": "record_financing_fee",
  "transfer_id": "转让ID",
  "base_amount": 5000000,
  "fee_rate": 0.03
}
```

> 系统自动计算：500 万 × 3% = 15 万服务费。

#### 查看闭环汇总

**对 AI 说：**
> "看一下资金闭环的整体情况。"

**AI 调用：**
```json
{
  "action": "closure_summary"
}
```

> 汇总报表包含：资产包总数、城投转让总额、科创贷总额、融资服务费总收入。

---

## 4. 管理后台指南

### 访问与登录

```
http://localhost:18789/opc/admin?token=<你的token>
```

使用 URL 参数 `token` 进行认证。Token 在安装时自动生成，保存在 `~/.openclaw/.env` 文件中。

### 8 个管理页面

| 页面 | 说明 |
|------|------|
| **仪表盘** | 平台整体数据概览 -- 公司数、收入趋势、活跃告警 |
| **公司管理** | 公司列表、搜索筛选，点击进入公司详情 |
| **OPB 画布** | 查看和编辑一人企业商业画布（16 个模块） |
| **财务总览** | 跨公司的财务数据汇总与趋势分析 |
| **监控中心** | 运营指标看板、KPI 监控、告警管理 |
| **工具管理** | 启用/禁用功能模块、Webhook 配置、技能管理 |
| **资金闭环** | 收并购、资产包、城投转让、服务费全流程可视化 |
| **使用指南** | 产品文档与操作说明 |

### 公司详情页 -- 10 个标签

点击任意公司进入详情页，包含以下标签：

| 标签 | 内容 |
|------|------|
| 概览 | 公司基本信息、状态、注册资本、创建时间 |
| 财务 | 收支记录、发票列表、财务摘要 |
| 团队 | 员工列表、薪酬汇总、社保公积金 |
| 项目 | 项目列表、任务分布、进度概况 |
| 合同 | 合同管理、状态跟踪、到期提醒 |
| 投融资 | 融资轮次、投资人、股权结构表 |
| 时间线 | 里程碑、大事记、公司完整历程 |
| AI 员工 | AI 岗位配置、启用/停用管理 |
| 新媒体 | 内容列表、发布日历、平台统计 |
| 采购 | 服务项目、采购订单、费用汇总 |

### 工具管理

在「工具管理」页面可以：

- **启用/禁用模块**：根据公司发展阶段按需开关功能模块
- **Webhook 配置**：设置告警推送地址（支持飞书、企业微信等）
- **技能管理**：查看和管理 16 个内置 Agent 技能

可管理的 10 个工具模块：

| 工具 Key | 名称 | 说明 |
|----------|------|------|
| `opc_core` | 核心管理 | 公司注册、员工、客户、交易 |
| `opc_finance` | 财税管理 | 发票、增值税、所得税、纳税申报 |
| `opc_legal` | 法务合同 | 合同管理、风险评估、到期提醒 |
| `opc_hr` | 人力资源 | 员工档案、薪资、社保、公积金 |
| `opc_media` | 新媒体运营 | 内容创建、发布排期、数据分析 |
| `opc_document` | 文档生成 | 合同/报价单/收据生成，导出 Word/PDF/Excel |
| `opc_project` | 项目管理 | 项目、任务、进度、预算跟踪 |
| `opc_investment` | 投融资 | 融资轮次、投资人、股权结构 |
| `opc_procurement` | 服务采购 | 服务项目、采购订单、费用统计 |
| `opc_lifecycle` | 生命周期 | 里程碑、大事记、时间线、报告 |
| `opc_monitoring` | 运营监控 | 指标记录、告警管理、KPI 看板 |

---

## 5. 命令参考

| 命令 | 说明 |
|------|------|
| `npx galaxy-opc` | 一键安装（默认命令），引导完成环境检查、安装、配置全流程 |
| `npx galaxy-opc setup` | 重新配置 AI 模型（切换模型供应商或更新 API Key） |
| `npx galaxy-opc start` | 启动服务（等同于 `openclaw gateway`） |
| `npx galaxy-opc doctor` | 诊断安装状态（运行 6 项检查） |

### `npx galaxy-opc doctor` 检查项

| # | 检查项 | 说明 |
|---|--------|------|
| 1 | OpenClaw 安装 | 检测 OpenClaw 是否已全局安装 |
| 2 | 插件安装 | 检测 `galaxy-opc-plugin` 是否已安装到 OpenClaw |
| 3 | 配置文件 | 检测 `~/.openclaw/openclaw.json` 是否存在且有效 |
| 4 | AI 模型 | 检测是否已配置可用的 AI 模型和 API Key |
| 5 | Gateway Token | 检测 Token 是否已生成 |
| 6 | 数据库目录 | 检测 `~/.openclaw/opc-platform/` 目录是否存在且可写 |

---

## 6. 数据与配置

### 文件路径

| 路径 | 说明 |
|------|------|
| `~/.openclaw/openclaw.json` | OpenClaw 主配置文件（模型、代理、插件） |
| `~/.openclaw/.env` | 环境变量文件（API Key、Gateway Token） |
| `~/.openclaw/opc-platform/opc.db` | SQLite 数据库（所有业务数据） |
| `~/.openclaw/extensions/galaxy-opc-plugin/` | 插件安装目录 |

### 备份数据

数据库是单个 SQLite 文件，直接复制即可备份：

```bash
cp ~/.openclaw/opc-platform/opc.db ~/backup/opc-$(date +%Y%m%d).db
```

### 恢复数据

将备份文件复制回原路径，然后重启服务：

```bash
cp ~/backup/opc-20260227.db ~/.openclaw/opc-platform/opc.db
npx galaxy-opc start
```

---

## 7. 常见问题 FAQ

### 安装失败怎么办？

1. 确认 Node.js 版本 >= 22：`node -v`
2. 运行诊断命令：`npx galaxy-opc doctor`
3. 检查网络连接，确保能访问 npm registry
4. 尝试重新安装：`npx galaxy-opc`

### 如何切换 AI 模型？

运行以下命令重新选择模型：

```bash
npx galaxy-opc setup
```

向导会引导你选择新的模型供应商并配置 API Key。

### 数据存在哪里？

所有业务数据存储在 `~/.openclaw/opc-platform/opc.db`（SQLite 数据库文件）。配置文件在 `~/.openclaw/openclaw.json`。这些文件与项目目录无关，重装插件不会丢失数据。

### 如何备份数据？

直接复制 SQLite 数据库文件即可。详见 [数据与配置](#6-数据与配置) 章节。

### Token 忘记了怎么办？

Token 保存在环境变量文件中，查看方法：

```bash
cat ~/.openclaw/.env
```

找到 `GATEWAY_TOKEN=xxx` 一行即可。也可以运行 `npx galaxy-opc doctor` 查看 Token 状态。

### 端口被占用怎么办？

默认端口为 18789。如果被占用，可在 `~/.openclaw/openclaw.json` 中修改 `port` 字段，然后重启服务。

### 如何更新到最新版本？

```bash
npx galaxy-opc@latest
```

---

## 版本信息

| 组件 | 版本 | 说明 |
|------|------|------|
| galaxy-opc（CLI 安装器） | 0.4.0 | `npx galaxy-opc` 一键安装工具 |
| galaxy-opc-plugin（OPC 插件） | 0.2.1 | OpenClaw 平台插件 |

## 开源协议

MIT © 2026 星河数科 (StarRiver Digital Technology)
