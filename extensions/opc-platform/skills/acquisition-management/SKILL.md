---
name: acquisition-management
description: |
  收并购管理技能。当用户提到收购、并购、收购亏损公司、税务优化、亏损抵扣、收并购时激活。
---

# 收并购管理技能

使用 `opc_acquisition` 工具管理一人公司收并购流程。当 OPC 经营不善时，星河数科依据参股协议发起收购，亏损可抵扣企业所得税，并为后续资产打包做准备。

## 收并购流程

### 第一步：发起收购

确认目标公司经营状况后，创建收购案例：

```json
{
  "action": "create_acquisition",
  "company_id": "目标公司ID",
  "trigger_reason": "连续亏损，营收不达预期",
  "acquisition_price": 50000,
  "loss_amount": 200000,
  "notes": "依据参股协议第8条发起收购"
}
```

系统自动完成：
- 创建收购案例（状态: evaluating）
- 将公司状态变更为 `acquired`（通过状态机校验）
- 计算税务抵扣估算：亏损 x 25% 企业所得税率

### 第二步：跟踪收购进度

查看所有收购案例：

```json
{
  "action": "list_acquisitions",
  "status": "evaluating"
}
```

案例状态流转: `evaluating`(评估中) → `approved`(已批准) → `closed`(已完成)，或 `rejected`(已拒绝)

### 第三步：更新收购信息

```json
{
  "action": "update_acquisition",
  "case_id": "案例ID",
  "status": "approved",
  "acquisition_price": 60000,
  "loss_amount": 180000
}
```

更新价格或亏损金额时，税务抵扣会自动重新计算。

### 第四步：平台汇总

查看全平台收并购概况：

```json
{
  "action": "acquisition_summary"
}
```

返回: 总收购数、累计亏损、累计税务抵扣优化总额。

## 税务优化说明

- 亏损抵扣公式: 亏损金额 x 25%（企业所得税率）
- 小微企业优惠税率下实际可抵扣更多
- 收购完成后可进入资产打包流程（使用 `opc_asset_package` 工具）

## 使用建议

1. 收购前先通过 `opc_manage` 查看公司财务状况
2. 确认亏损金额后发起收购
3. 收购完成后，将公司加入资产包（`opc_asset_package.add_company_to_package`）
4. 定期查看 `acquisition_summary` 了解平台整体税务优化效果
