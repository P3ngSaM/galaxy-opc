# 星环OPC中心 — OpenClaw 插件

> 一人公司(OPC)孵化与赋能平台，基于 [OpenClaw](https://github.com/openclaw/openclaw) 构建的 AI 员工全套解决方案。

![版本](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![OpenClaw](https://img.shields.io/badge/OpenClaw-2026.x-orange)

---

## ✨ 功能概览

| 模块 | 工具名 | 功能 |
|------|--------|------|
| 核心管理 | `opc_core` | 公司注册、客户管理、收支记录 |
| AI 员工 | `opc_staff` | 行政/财务/HR/法务/市场/运营岗位配置 |
| 财税管理 | `opc_finance` | 发票、增值税、所得税、纳税申报 |
| 法务合同 | `opc_legal` | 合同管理、风险评估、到期提醒 |
| 人力资源 | `opc_hr` | 员工档案、薪资、社保、公积金 |
| 新媒体运营 | `opc_media` | 内容创建、发布排期、数据分析 |
| 项目管理 | `opc_project` | 项目、任务、进度、预算跟踪 |
| 投融资 | `opc_investment` | 融资轮次、投资人、股权结构 |
| 服务采购 | `opc_procurement` | 服务项目、采购订单、费用统计 |
| 生命周期 | `opc_lifecycle` | 里程碑、大事记、时间线报告 |
| 运营监控 | `opc_monitoring` | 指标记录、告警管理、KPI 看板 |

**自动提醒服务**（后台每小时扫描）：
- 税务申报到期提醒（7天内）
- 合同到期提醒（30天内）
- 现金流预警（净流出超 5000 元）
- 融资轮次截止跟进

**管理后台** `http://localhost:18789/opc/admin`：
- 公司仪表盘、财务总览、监控中心
- 一键进入公司 AI 助手对话
- SOP 使用指南

---

## 📦 安装

### 前提条件

- 已安装并运行 [OpenClaw](https://github.com/openclaw/openclaw) Gateway
- Node.js 20+

### 方式一：直接克隆到插件目录（推荐）

```bash
# 进入你的 OpenClaw 插件目录
cd <your-openclaw-dir>/extensions

# 克隆插件
git clone https://github.com/P3ngSaM/opc.git opc-platform

# 安装依赖
cd opc-platform
npm install
```

### 方式二：手动下载

下载 Release 压缩包，解压到 `<openclaw>/extensions/opc-platform/`，然后 `npm install`。

---

## ⚙️ 配置

在 OpenClaw 配置文件 `~/.openclaw/openclaw.json` 中启用插件：

```json
{
  "plugins": {
    "entries": {
      "opc-platform": {
        "enabled": true,
        "config": {
          "dbPath": "~/.openclaw/opc-platform/opc.db"
        }
      }
    }
  }
}
```

`dbPath` 可选，默认为 `~/.openclaw/opc-platform/opc.db`，支持 `~/` 路径前缀。

---

## 🚀 快速开始

重启 OpenClaw Gateway 后，对 AI 说：

```
注册一家公司，名称"极光科技有限公司"，行业"软件开发"，注册资金50万
```

然后访问管理后台：`http://localhost:18789/opc/admin`

### 典型 SOP 流程

```
1. 注册公司        → opc_core: register_company
2. 激活公司        → opc_core: activate_company
3. 配置 AI 员工    → opc_staff: init_default_staff
4. 日常运营        → 告诉 AI 助手记录收支、合同、员工等
5. 融资管理        → opc_investment: create_round
6. 生命周期报告    → opc_lifecycle: generate_report
```

---

## 📁 项目结构

```
opc-platform/
├── index.ts                 # 插件入口
├── openclaw.plugin.json     # 插件元数据
├── package.json
├── src/
│   ├── api/                 # HTTP API 路由
│   ├── db/                  # SQLite 数据库适配器 & Schema
│   ├── opc/                 # 上下文注入、提醒服务、工作区工厂
│   ├── tools/               # 11 个 AI 工具模块
│   └── web/                 # 管理后台 UI (config-ui) & Landing Page
└── skills/                  # OpenClaw Skills 配置
    ├── basic-crm/
    ├── basic-finance/
    ├── company-registration/
    └── ...（共 11 个技能包）
```

---

## 🗄️ 数据库

使用 SQLite（WAL 模式），自动迁移，无需手动建表。主要数据表：

- `opc_companies` — 公司档案
- `opc_transactions` — 收支流水
- `opc_contracts` — 合同管理
- `opc_tax_filings` — 税务申报
- `opc_employees` / `opc_hr_records` — HR 档案
- `opc_investment_rounds` — 融资轮次
- `opc_alerts` — 告警记录
- `opc_staff_config` — AI 员工角色配置
- ...共 19 张表

---

## 🛠️ 开发

```bash
# 类型检查
npx tsc -p tsconfig.json --noEmit

# 构建管理后台 UI（如修改了 UI）
# 在 openclaw 根目录执行：
node scripts/ui.js build
```

---

## 📄 License

MIT © 2026 星河数科 (StarRiver Digital Technology)
