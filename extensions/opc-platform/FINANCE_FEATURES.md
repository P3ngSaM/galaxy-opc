# OPC 平台财务功能补充说明

## 概述

本次更新为 OPC 平台的 `opc_finance` 工具补充了关键的财务分析和报表功能，满足一人公司的融资和运营决策需求。

## 新增功能

### 1. 自动财务报表生成

#### a) 资产负债表 (`generate_balance_sheet`)

生成标准的资产负债表，展示公司在特定日期的财务状况。

**调用示例:**
```
opc_finance action=generate_balance_sheet company_id=xxx date=2026-02-28
```

**参数:**
- `company_id`: 公司 ID（必填）
- `date`: 查询日期 (YYYY-MM-DD)，默认今天

**输出内容:**
- **资产:**
  - 流动资产：现金、应收账款
  - 固定资产
  - 总资产
- **负债:**
  - 流动负债：应付账款
  - 长期负债
  - 总负债
- **所有者权益:**
  - 实收资本（从融资轮次获取）
  - 留存收益
  - 总权益
- **健康指标:**
  - 流动比率（流动资产/流动负债，健康值 > 1.5）
  - 资产负债率（总负债/所有者权益，健康值 < 1）

**数据来源:**
- `opc_transactions`: 现金余额
- `opc_invoices`: 应收应付账款
- `opc_investment_rounds`: 实收资本

---

#### b) 利润表 (`generate_income_statement`)

生成损益表(P&L)，展示公司在指定期间的盈利能力。

**调用示例:**
```
opc_finance action=generate_income_statement company_id=xxx start_date=2026-01-01 end_date=2026-01-31
```

**参数:**
- `company_id`: 公司 ID（必填）
- `start_date`: 起始日期 (YYYY-MM-DD)（必填）
- `end_date`: 截止日期 (YYYY-MM-DD)（必填）

**输出内容:**
- 营业收入（从 sales 类型交易）
- 营业成本（从 purchase/salary/tax 交易）
- 毛利润和毛利率
- 营业费用（营销费用）
- 营业利润和营业利润率
- 净利润和净利率
- 收入环比增长率

**计算逻辑:**
```
收入 = SUM(amount WHERE type='income' AND category LIKE '%income%')
成本 = SUM(amount WHERE type='expense' AND category IN ('salary','tax','supplies','rent','utilities'))
净利润 = 收入 - 成本 - 营销费用
```

---

#### c) 现金流量表 (`generate_cashflow_statement`)

生成现金流量表，展示公司现金流入流出情况。

**调用示例:**
```
opc_finance action=generate_cashflow_statement company_id=xxx start_date=2026-01-01 end_date=2026-01-31
```

**参数:**
- `company_id`: 公司 ID（必填）
- `start_date`: 起始日期 (YYYY-MM-DD)（必填）
- `end_date`: 截止日期 (YYYY-MM-DD)（必填）

**输出内容:**
- **经营活动现金流:**
  - 销售收款
  - 经营性支出（薪资、租金、税费等）
  - 净经营现金流
- **投资活动现金流:**
  - 固定资产购置
- **筹资活动现金流:**
  - 融资收入
- 现金净增加额
- 期初现金余额
- 期末现金余额
- **健康指标:**
  - 经营现金流是否为正
  - 现金跑道（当前余额可维持几个月运营）

**数据来源:** `opc_transactions` 按类型分类汇总

---

### 2. 客户价值分析

#### a) 客户生命周期价值 (`calculate_customer_ltv`)

计算客户的长期价值，帮助评估营销投入的合理性。

**调用示例:**
```
# 计算所有客户平均 LTV
opc_finance action=calculate_customer_ltv company_id=xxx

# 计算特定客户 LTV
opc_finance action=calculate_customer_ltv company_id=xxx customer_id=yyy
```

**参数:**
- `company_id`: 公司 ID（必填）
- `customer_id`: 特定客户 ID（可选，不填则计算全部客户平均值）

**输出内容:**
- 平均订单价值 (AOV)
- 购买频率（次/月）
- 客户生命周期（月）
- LTV = AOV × 购买频率 × 生命周期
- 总交易次数
- 总收入

**计算方法:**
```
AOV = 总收入 / 交易次数
购买频率 = 交易次数 / 客户生命周期（月）
客户生命周期 = (最后交易日期 - 首次交易日期) / 30
LTV = AOV × 购买频率 × 客户生命周期
```

**数据来源:**
- `opc_transactions` JOIN `opc_contacts` 获取客户交易历史

---

#### b) 获客成本 (`calculate_acquisition_cost`)

计算每获得一个新客户的成本，并评估 LTV/CAC 健康度。

**调用示例:**
```
# 月度计算
opc_finance action=calculate_acquisition_cost company_id=xxx period=2026-01

# 季度计算
opc_finance action=calculate_acquisition_cost company_id=xxx period=2026-Q1
```

**参数:**
- `company_id`: 公司 ID（必填）
- `period`: 统计期间，支持 `YYYY-MM` 或 `YYYY-Q1/Q2/Q3/Q4` 格式（必填）

**输出内容:**
- 营销支出总额
- 新增客户数
- CAC = 营销支出 / 新增客户数
- 平均 LTV
- LTV/CAC 比率
- 健康状态判断：
  - LTV/CAC > 3: 健康
  - LTV/CAC > 1: 尚可
  - LTV/CAC < 1: 需优化

**数据来源:**
- `opc_transactions` 中 `category='marketing'` 的支出
- `opc_contacts` 按 `created_at` 统计新增客户

---

### 3. 单位经济学分析

#### 单位经济学分析 (`unit_economics_analysis`)

分析每个单位产品/服务的经济效益，评估商业模式可持续性。

**调用示例:**
```
opc_finance action=unit_economics_analysis company_id=xxx
```

**参数:**
- `company_id`: 公司 ID（必填）

**输出内容:**
- **单位经济学指标:**
  - 单位收入
  - 单位成本
  - 单位贡献边际
  - 贡献率 = (单位收入 - 单位成本) / 单位收入
- **盈亏平衡分析:**
  - 月度固定成本
  - 盈亏平衡点（需销售多少单位）
- **健康指标:**
  - 状态评估（优秀/良好/需优化）
  - 优化建议

**计算逻辑:**
- 基于最近 30 天的交易数据
- 单位成本 = 总成本 / 交易次数
- 单位收入 = 总收入 / 交易次数
- 盈亏平衡点 = 固定成本 / 单位贡献边际

**健康标准:**
- 贡献率 > 50%: 优秀
- 贡献率 > 30%: 良好
- 贡献率 < 30%: 需优化

---

### 4. 融资数据包生成

#### 融资数据包 (`generate_funding_datapack`)

一键生成完整的融资材料数据包，可直接用于投资人沟通或 BP 制作。

**调用示例:**
```
opc_finance action=generate_funding_datapack company_id=xxx
```

**参数:**
- `company_id`: 公司 ID（必填）

**输出内容:**
- **公司基本信息:**
  - 公司名称、行业、创始人、注册资本等
- **财务摘要（过去 12 个月）:**
  - 营业收入
  - 营业成本
  - 净利润
  - 利润率
  - 现金余额
- **增长指标:**
  - 月度收入数据
  - 环比增长率
  - 收入增长趋势
- **客户指标:**
  - 客户总数
  - 活跃客户数
  - 平均 LTV
- **团队信息:**
  - 从 `opc_hr_records` 获取在职员工
- **融资历史:**
  - 从 `opc_investment_rounds` 获取历史融资记录
- **商业模式:**
  - 从 `opc_opb_canvas` 获取 OPB 画布

**用途:**
- 直接发送给投资人
- 用于制作商业计划书
- 董事会汇报材料

---

## 数据库扩展

为支持上述功能，新增了以下数据表：

### 1. `opc_financial_periods` - 财务期间表

用于缓存月度/季度/年度汇总数据，提升查询性能。

```sql
CREATE TABLE IF NOT EXISTS opc_financial_periods (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  period_type TEXT NOT NULL,        -- monthly/quarterly/yearly
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  revenue REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  cash_flow REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company_id, period_type, start_date),
  FOREIGN KEY (company_id) REFERENCES opc_companies(id)
)
```

### 2. `opc_payments` - 付款记录表

用于跟踪应收应付款项的实际支付情况。

```sql
CREATE TABLE IF NOT EXISTS opc_payments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,               -- receivable/payable
  amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/paid/overdue
  due_date TEXT NOT NULL DEFAULT '',
  paid_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (company_id) REFERENCES opc_companies(id)
)
```

---

## 使用场景示例

### 场景 1：准备月度财务报告

```bash
# 1. 生成利润表
opc_finance action=generate_income_statement company_id=xxx start_date=2026-01-01 end_date=2026-01-31

# 2. 生成现金流量表
opc_finance action=generate_cashflow_statement company_id=xxx start_date=2026-01-01 end_date=2026-01-31

# 3. 生成资产负债表
opc_finance action=generate_balance_sheet company_id=xxx date=2026-01-31
```

### 场景 2：评估营销投入效果

```bash
# 1. 计算本月获客成本
opc_finance action=calculate_acquisition_cost company_id=xxx period=2026-01

# 2. 计算客户 LTV
opc_finance action=calculate_customer_ltv company_id=xxx

# 3. 比较 LTV/CAC 比率，判断营销效率
```

### 场景 3：准备融资材料

```bash
# 一键生成完整融资数据包
opc_finance action=generate_funding_datapack company_id=xxx

# 将返回的 JSON 数据发送给投资人或用于制作 BP
```

### 场景 4：优化商业模式

```bash
# 1. 分析单位经济学
opc_finance action=unit_economics_analysis company_id=xxx

# 2. 根据贡献率和盈亏平衡点优化定价或成本结构
```

---

## 性能优化建议

1. **定期缓存财务数据:**
   - 使用 `opc_financial_periods` 表缓存月度/季度汇总数据
   - 避免每次都从原始交易记录重新计算

2. **索引优化:**
   - 已为常用查询字段添加索引（`transaction_date`, `company_id` 等）
   - 大数据量场景下建议定期 `ANALYZE` 数据库

3. **分页查询:**
   - 对于历史数据分析，建议按月或按季度分批查询

---

## 错误处理

所有财务分析工具都包含以下错误处理机制：

1. **数据不足提示:**
   - 当交易记录、客户数据不足时，返回明确的提示信息
   - 示例：无交易记录无法生成利润表

2. **除零保护:**
   - 所有涉及除法的计算都包含除零检查
   - 返回 "N/A" 或 0 作为默认值

3. **边界情况处理:**
   - 负利润、零收入等边界情况都有专门处理逻辑

---

## 技术细节

### 数据迁移

新增功能通过 migration v14 自动创建所需表结构：

```typescript
{
  version: 14,
  description: "Financial reporting — financial_periods and payments tables for advanced analysis",
  up(_db) {
    // Tables created in initializeDatabase via OPC_TABLES
    // Indexes created via OPC_INDEXES
  },
}
```

### 计算精度

所有金额计算都使用 `Math.round(value * 100) / 100` 保留两位小数，确保财务数据精度。

---

## 验证标准

完成后应能：

✅ 调用 `opc_finance action=generate_income_statement company_id=xxx start_date=2026-01-01 end_date=2026-01-31` 返回完整 P&L

✅ 调用 `opc_finance action=calculate_customer_ltv company_id=xxx` 返回 LTV 分析

✅ 调用 `opc_finance action=generate_funding_datapack company_id=xxx` 返回可用于融资的完整数据包

---

## 下一步优化方向

1. **自动化报表生成:**
   - 定时生成月度/季度财务报表
   - 发送到飞书/企业微信

2. **可视化支持:**
   - 生成图表数据（收入趋势、成本分布等）
   - 与前端 Dashboard 集成

3. **预测分析:**
   - 基于历史数据预测未来 3-6 个月的财务状况
   - 现金流预警

4. **行业对标:**
   - 提供行业平均 LTV、CAC、利润率等对标数据
   - 帮助创业者了解自己的竞争力

---

## 联系与支持

如有问题或建议，请通过以下方式联系：

- GitHub Issues: [项目链接]
- 邮箱: [联系邮箱]

---

**版本:** v0.2.1
**更新日期:** 2026-02-28
**文档维护:** OPC 平台开发团队
