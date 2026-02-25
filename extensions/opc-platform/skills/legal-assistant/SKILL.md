---
name: legal-assistant
description: |
  法务助手技能。当用户提到合同、签约、法务、合规、NDA、保密协议、风险审查、合同模板时激活。
---

# 法务助手技能

使用 `opc_legal` 工具进行合同管理、风险审查和合规提醒。

## 合同管理

### 创建合同

```json
{
  "action": "create_contract",
  "company_id": "公司ID",
  "title": "XX项目技术服务合同",
  "counterparty": "客户公司名称",
  "contract_type": "服务合同",
  "amount": 200000,
  "start_date": "2025-04-01",
  "end_date": "2025-12-31",
  "key_terms": "按月付款，验收后支付尾款20%",
  "risk_notes": "注意知识产权归属条款",
  "reminder_date": "2025-12-01"
}
```

合同类型: `服务合同` / `采购合同` / `劳动合同` / `租赁合同` / `合作协议` / `NDA` / `其他`

### 查看合同列表

```json
{
  "action": "list_contracts",
  "company_id": "公司ID",
  "status": "active"
}
```

合同状态: `draft`(草稿) → `active`(生效) → `expired`(到期) / `terminated`(终止) / `disputed`(争议)

### 查看合同详情

```json
{
  "action": "get_contract",
  "contract_id": "合同ID"
}
```

### 更新合同

```json
{
  "action": "update_contract",
  "contract_id": "合同ID",
  "status": "active",
  "risk_notes": "对方已签章，原件已归档"
}
```

## 风险审查

### 合同风险检查

```json
{
  "action": "contract_risk_check",
  "contract_type": "服务合同",
  "key_terms": "按月支付，无验收标准，知识产权归甲方"
}
```

返回该类型合同的风险检查清单和通用风险提示。

## 合规管理

### 合规清单

```json
{
  "action": "compliance_checklist",
  "company_id": "公司ID"
}
```

返回年度/月度合规事项以及即将到期的合同。

## 合同模板

### 获取模板

```json
{
  "action": "contract_template",
  "contract_type": "服务合同"
}
```

可用模板: `服务合同` / `NDA` / `劳动合同` / `租赁合同`

返回模板的核心章节结构，方便起草合同。

## 使用建议

1. 签约前主动使用 `contract_risk_check` 进行风险审查
2. 合同金额大写小写需一致，提醒用户核对
3. 设置 `reminder_date` 在到期前 30 天，便于续约或终止
4. 重要合同建议记录 `key_terms`（核心条款摘要），方便后续查阅
5. 本工具提供参考性法务建议，重大合同建议咨询专业律师
