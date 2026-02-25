---
name: business-monitoring
description: |
  运营监控技能。当用户提到指标、KPI、告警、监控、运营看板、数据统计、业务指标时激活。
---

# 运营监控技能

使用 `opc_monitoring` 工具记录运营指标、管理告警和查看 KPI 汇总。

## 指标记录

### 记录运营指标

```json
{
  "action": "record_metric",
  "company_id": "公司ID",
  "name": "月收入",
  "value": 50000,
  "unit": "元",
  "category": "revenue",
  "recorded_at": "2025-03-31",
  "notes": "3月份总收入"
}
```

常用指标分类: revenue(收入), user(用户), conversion(转化), cost(成本), other

### 查询指标数据

```json
{
  "action": "get_metrics",
  "company_id": "公司ID",
  "name": "月收入",
  "category": "revenue",
  "start_date": "2025-01-01",
  "end_date": "2025-12-31"
}
```

## 告警管理

### 创建告警

```json
{
  "action": "create_alert",
  "company_id": "公司ID",
  "title": "现金流预警",
  "severity": "warning",
  "category": "finance",
  "message": "账户余额低于安全线，建议尽快回款"
}
```

告警严重度: info(提示), warning(警告), critical(严重)

### 查看告警列表

```json
{
  "action": "list_alerts",
  "company_id": "公司ID",
  "severity": "critical",
  "status": "active"
}
```

### 消除告警

```json
{
  "action": "dismiss_alert",
  "alert_id": "告警ID"
}
```

告警状态: `active` → `acknowledged` → `resolved`

## KPI 汇总

### 查看 KPI 看板

```json
{
  "action": "kpi_summary",
  "company_id": "公司ID"
}
```

返回跨表聚合数据:
- **财务**: 总收入/总支出/净利润
- **团队**: 活跃员工数
- **项目**: 总数/进行中/已完成
- **合同**: 总数/活跃数/活跃合同价值
- **客户**: 联系人总数
- **告警**: 活跃告警（按严重度分组）
- **最新指标**: 最近20条指标记录

## 常用指标参考

| 指标 | 单位 | 类别 | 建议记录频率 |
|------|------|------|-------------|
| 月收入 | 元 | revenue | 每月 |
| 月支出 | 元 | cost | 每月 |
| 注册用户数 | 人 | user | 每月 |
| 活跃用户数 | 人 | user | 每月 |
| 转化率 | % | conversion | 每月 |
| 客单价 | 元 | revenue | 每月 |
| 客户留存率 | % | user | 每月 |

## 使用建议

1. 每月固定日期 `record_metric` 记录核心指标
2. 发现异常数据时主动 `create_alert` 提醒用户
3. 每周查看 `kpi_summary` 了解公司整体状况
4. 对 critical 级别告警立即处理，warning 级别限期处理
5. 利用 `get_metrics` 对比历史数据，分析趋势
