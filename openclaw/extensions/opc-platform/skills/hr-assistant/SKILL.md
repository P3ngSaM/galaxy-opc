---
name: hr-assistant
description: |
  人力资源技能。当用户提到员工、招聘、入职、离职、薪资、社保、公积金、个税、工资时激活。
---

# 人力资源技能

使用 `opc_hr` 工具进行员工管理、社保公积金计算和薪酬汇总。

## 员工管理

### 添加员工

```json
{
  "action": "add_employee",
  "company_id": "公司ID",
  "employee_name": "张三",
  "position": "前端开发工程师",
  "salary": 15000,
  "contract_type": "full_time",
  "start_date": "2025-04-01",
  "notes": "试用期3个月，薪资80%"
}
```

用工类型: `full_time`(全职) / `part_time`(兼职) / `contractor`(外包) / `intern`(实习)

### 查看员工列表

```json
{
  "action": "list_employees",
  "company_id": "公司ID",
  "status": "active"
}
```

员工状态: `active`(在职) / `resigned`(离职) / `terminated`(解雇)

### 更新员工信息

```json
{
  "action": "update_employee",
  "record_id": "员工记录ID",
  "salary": 18000,
  "position": "高级前端工程师",
  "notes": "转正调薪"
}
```

### 办理离职

```json
{
  "action": "update_employee",
  "record_id": "员工记录ID",
  "status": "resigned",
  "end_date": "2025-06-30",
  "notes": "个人原因离职"
}
```

## 社保公积金计算

### 计算社保

```json
{
  "action": "calc_social_insurance",
  "salary": 15000
}
```

返回:
- 缴费基数（含上下限调整）
- 公司缴纳: 养老16% + 医疗9.5% + 失业0.5% + 工伤0.4% + 公积金12%
- 个人缴纳: 养老8% + 医疗2% + 失业0.5% + 公积金12%

### 计算个税

```json
{
  "action": "calc_personal_tax",
  "monthly_salary": 15000,
  "special_deduction": 2000
}
```

- 起征点: 5000 元/月
- 自动扣除社保公积金（也可手动指定 `social_insurance` 参数）
- `special_deduction`: 专项附加扣除（子女教育/住房贷款/赡养老人等）

返回: 应纳税所得额、适用税率、月缴税额、实发工资。

## 薪酬汇总

```json
{
  "action": "payroll_summary",
  "company_id": "公司ID"
}
```

返回: 在职人数、工资总额、社保总额、公积金总额、用工总成本。

## 个税税率表

| 月应纳税所得额(年) | 税率 | 速算扣除数 |
|---|---|---|
| ≤ 36,000 | 3% | 0 |
| ≤ 144,000 | 10% | 2,520 |
| ≤ 300,000 | 20% | 16,920 |
| ≤ 420,000 | 25% | 31,920 |
| ≤ 660,000 | 30% | 52,920 |
| ≤ 960,000 | 35% | 85,920 |
| > 960,000 | 45% | 181,920 |

## 使用建议

1. 添加员工时系统自动计算社保公积金，无需手动输入
2. 薪资变动时提醒用户同步更新社保基数
3. 一人公司创始人也建议缴纳社保公积金（享受医保和公积金贷款）
4. 兼职/外包人员无需缴纳社保，但需代扣个税
5. 试用期工资不低于约定工资的 80%
