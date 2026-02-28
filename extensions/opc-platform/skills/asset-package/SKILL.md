---
name: asset-package
description: |
  资产打包与城投转让技能。当用户提到资产包、资产打包、城投、城投转让、科技贷、融资服务费、资金闭环时激活。
---

# 资产打包与城投转让技能

使用 `opc_asset_package` 工具完成资金闭环的后半段：将收购的公司打包为科技资产包，转让给城投公司，申请科技贷款，收取融资服务费。

## 资金闭环全流程

```
孵化 OPC → 经营不善 → 收购(opc_acquisition) → 资产打包 → 城投转让 → 科技贷 → 服务费
```

## 资产包管理

### 创建资产包

```json
{
  "action": "create_asset_package",
  "name": "2025年第一批科技资产包",
  "description": "含3家AI领域一人公司"
}
```

资产包状态: `assembling`(组装中) → `submitted`(已提交) → `approved`(已审批) → `transferred`(已转让)

### 添加公司到资产包

将已收购的公司加入资产包：

```json
{
  "action": "add_company_to_package",
  "package_id": "资产包ID",
  "company_id": "已收购的公司ID",
  "valuation": 500000
}
```

系统自动更新资产包总估值和公司数量。

### 查看资产包详情

```json
{
  "action": "get_package_detail",
  "package_id": "资产包ID"
}
```

返回: 资产包信息 + 包含的公司列表 + 关联的城投转让记录。

## 城投转让

### 发起城投转让

```json
{
  "action": "create_ct_transfer",
  "package_id": "资产包ID",
  "ct_company_name": "仁和区城市建设投资有限公司",
  "target_loan_amount": 10000000,
  "interest_rate": 3.5,
  "loan_term_months": 36,
  "notes": "科技贷款申请"
}
```

转让状态: `negotiating`(洽谈中) → `signed`(已签约) → `loan_approved`(贷款已批) → `completed`(已完成)

### 更新转让进度

```json
{
  "action": "update_ct_transfer",
  "transfer_id": "转让ID",
  "status": "loan_approved",
  "actual_loan_amount": 8000000
}
```

### 查看转让列表

```json
{
  "action": "list_ct_transfers",
  "status": "completed"
}
```

## 融资服务费

### 记录服务费

贷款完成后，按比例收取融资服务费：

```json
{
  "action": "record_financing_fee",
  "transfer_id": "转让ID",
  "fee_base": 8000000,
  "fee_rate": 2.5
}
```

系统自动计算: 8,000,000 x 2.5% = 200,000 元服务费。

### 更新服务费状态

```json
{
  "action": "update_financing_fee",
  "fee_id": "服务费ID",
  "invoice_status": "invoiced",
  "payment_status": "paid"
}
```

## 闭环总览

查看全平台资金闭环汇总：

```json
{
  "action": "closure_summary"
}
```

返回: 所有资产包 + 城投转让 + 服务费的完整闭环数据。

## 使用建议

1. 先通过 `opc_acquisition` 完成收购，确保公司状态为 `acquired`
2. 创建资产包，将多家已收购公司打包
3. 资产包提交审批后，申请科技资产认定
4. 与城投公司洽谈转让，发起科技贷申请
5. 贷款到账后记录融资服务费
6. 定期查看 `closure_summary` 掌握整体闭环进度
