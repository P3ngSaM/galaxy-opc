# 星环 Galaxy OPC

> **一人公司孵化与赋能平台** — 基于 AI 的一人公司全生命周期管理系统

[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-2026.x-orange)](https://github.com/openclaw/openclaw)

---

## 是什么

星环 Galaxy OPC 是一套为**一人公司（One-Person Company）** 打造的 AI 员工平台。它把公司注册、财税、合同、HR、投融资、监控等日常经营事务全部交给 AI 处理，创始人只需专注核心业务。

平台由两部分组成：

| 组件 | 说明 |
|------|------|
| **OpenClaw** | 多渠道 AI 网关，负责与大模型通信、管理 AI 代理 |
| **OPC Platform 插件** | 星环业务插件，11 个工具模块 + Web 管理后台 |

---

## 功能一览

### 11 个 AI 工具模块

| 模块 | 功能 |
|------|------|
| 核心管理 | 公司注册、客户管理、收支记录 |
| AI 员工 | 行政 / 财务 / HR / 法务 / 市场 / 运营岗位配置 |
| 财税管理 | 发票、增值税、所得税、纳税申报自动提醒 |
| 法务合同 | 合同管理、风险评估、到期提醒 |
| 人力资源 | 员工档案、薪资结构、社保公积金 |
| 新媒体运营 | 内容创作、发布排期、数据分析 |
| 项目管理 | 项目 / 任务 / 进度 / 预算全链路跟踪 |
| 投融资 | 融资轮次、投资人管理、股权结构 |
| 服务采购 | 采购订单、供应商管理、费用统计 |
| 生命周期 | 公司里程碑、大事记、时间线报告 |
| 运营监控 | KPI 指标、告警规则、实时看板 |

### Web 管理后台

访问 `http://localhost:18789/opc/admin`：

- 公司仪表盘 — 资产、营收、现金流概览
- 财务总览 — 月度收支趋势图
- 资金闭环模型 — 投资→采购→回款→资产→融资服务可视化
- 监控中心 — KPI 实时看板
- OPB 画布 — 16 模块商业模式画布
- SOP 使用指南 — 完整经营流程文档

### 自动提醒（后台每小时扫描）

- 税务申报到期提醒（提前 7 天）
- 合同到期提醒（提前 30 天）
- 现金流预警（净流出超 5000 元）
- 融资轮次截止跟进

---

## 快速开始

### 系统要求

- Node.js >= 22
- pnpm（`npm install -g pnpm`，向导会自动安装）
- Git（可选，用于安装扩展 Skills）

### 安装

```bash
git clone https://github.com/P3ngSaM/galaxy-opc.git
cd galaxy-opc
node setup.mjs
```

向导会引导你完成：

1. 环境检查（Node.js / pnpm / git）
2. 依赖安装（`pnpm install`）
3. AI 模型配置（选择国产或海外模型）
4. 基础配置（Gateway Token 自动生成）

### 启动

```bash
cd openclaw
npm start
```

然后打开 `http://localhost:18789/opc/admin`

---

## 支持的 AI 模型

向导提供交互式选择，也可在 `~/.openclaw/openclaw.json` 手动配置。

### 国产模型（推荐，速度快、有免费额度）

| 服务商 | 模型 | 登录方式 | 获取地址 |
|--------|------|---------|---------|
| 通义千问 Qwen | qwen-max / qwen-plus / qwen-turbo | OAuth 扫码 或 API Key | [dashscope.aliyun.com](https://dashscope.aliyun.com) |
| MiniMax | MiniMax-M2.1 | OAuth 扫码 | [minimaxi.com](https://www.minimaxi.com) |
| 豆包 Doubao | doubao-seed-1-8 / GLM-4.7 / Kimi-K2.5 | API Key | [console.volcengine.com](https://console.volcengine.com) |
| Kimi（Moonshot） | kimi-k2.5 | API Key | [platform.moonshot.ai](https://platform.moonshot.ai) |
| 百度千帆 | deepseek-v3 / ERNIE 系列 | API Key | [qianfan.baidu.com](https://qianfan.baidu.com) |
| DeepSeek | deepseek-chat / deepseek-reasoner | API Key | [platform.deepseek.com](https://platform.deepseek.com) |

### 海外模型

| 服务商 | 推荐模型 | 获取地址 |
|--------|---------|---------|
| OpenAI | gpt-4o / gpt-4o-mini | [platform.openai.com](https://platform.openai.com) |
| Anthropic | claude-3-5-haiku-latest | [console.anthropic.com](https://console.anthropic.com) |
| OpenRouter | 聚合多家模型，一个 Key | [openrouter.ai](https://openrouter.ai) |

---

## 配置文件说明

配置存放在 `~/.openclaw/`，**不在项目目录**，重新克隆项目不会丢失配置。

```
~/.openclaw/
├── openclaw.json   # 主配置（模型、代理、插件路径）
└── .env            # API Keys（自动加载，不提交到 git）
```

手动修改示例（切换模型）：

```json
{
  "agents": {
    "defaults": {
      "model": "qwen-max"
    }
  }
}
```

---

## 典型 SOP 流程

```
1. 注册公司      → 告诉 AI："注册一家公司，名称XX，行业YY"
2. 激活公司      → AI 自动配置工作空间
3. 配置 AI 员工  → 在管理后台设置各岗位 AI 员工角色
4. 日常运营      → 自然语言记录收支、合同、员工等
5. 查看报告      → 管理后台看财务图表，或让 AI 生成周报
6. 融资管理      → "创建 A 轮融资，金额500万"
7. 生命周期报告  → "生成公司运营报告"
```

---

## 项目结构

```
galaxy-opc/
├── setup.mjs                  # 首次配置向导
├── .gitignore
├── README.md
└── openclaw/                  # OpenClaw AI 网关
    ├── package.json
    ├── openclaw.mjs            # CLI 入口
    ├── src/                   # 核心源码
    ├── extensions/
    │   └── opc-platform/      # 星环 OPC 插件
    │       ├── index.ts       # 插件入口
    │       ├── src/
    │       │   ├── tools/     # 11 个 AI 工具模块
    │       │   ├── db/        # SQLite 数据库（19 张表）
    │       │   ├── opc/       # 上下文注入 & 提醒服务
    │       │   └── web/       # 管理后台 UI
    │       └── skills/        # 11 个技能包
    └── dist/                  # 编译产物
```

---

## 开发

```bash
# TypeScript 类型检查
cd openclaw/extensions/opc-platform
npx tsc -p tsconfig.json --noEmit

# 开发模式启动（跳过消息渠道连接）
cd openclaw
npm run gateway:dev
```

---

## License

MIT © 2026 星河数科 (StarRiver Digital Technology)
