---
name: company-registration
description: |
  一人公司注册技能。当用户提到注册公司、创办公司、开公司、成立公司时激活。
---

# 公司注册技能

使用 `opc_manage` 工具的公司管理功能，引导创业者完成一人公司注册流程。

## 注册流程

### 第一步：收集基本信息

向创业者询问以下信息：
1. **公司名称** — 建议格式: "XX科技有限公司"
2. **所属行业** — 如: 科技、教育、咨询、设计、电商等
3. **创办人姓名**
4. **联系方式** — 手机号或邮箱
5. **注册资本** — 一人有限公司最低无限制，建议 10-100 万元
6. **公司简介** — 一句话描述业务方向

### 第二步：录入系统

```json
{
  "action": "register_company",
  "name": "XX科技有限公司",
  "industry": "科技",
  "owner_name": "张三",
  "owner_contact": "13800138000",
  "registered_capital": 100000,
  "description": "专注于AI应用开发"
}
```

### 第三步：激活公司

确认信息无误后激活：

```json
{
  "action": "activate_company",
  "company_id": "返回的公司ID"
}
```

## 一人公司注意事项

提醒创业者：
- 一人有限责任公司（OPC）只有一个自然人股东
- 注册资本认缴制，无需实缴
- 需要独立的公司银行账户
- 每年需要做年报公示
- 不能再投资设立新的一人有限责任公司

## 状态查询

查看公司信息：
```json
{ "action": "get_company", "company_id": "公司ID" }
```

列出所有公司：
```json
{ "action": "list_companies" }
```

## 状态流转

公司状态: `pending`(筹备中) → `active`(运营中) → `suspended`(暂停) → `terminated`(注销)

变更状态：
```json
{
  "action": "change_company_status",
  "company_id": "公司ID",
  "new_status": "suspended"
}
```
