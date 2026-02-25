---
name: basic-crm
description: |
  基础客户管理技能。当用户提到客户、联系人、CRM、客户管理、跟进时激活。
---

# 基础客户管理技能

使用 `opc_manage` 工具管理客户/联系人信息。

## 添加客户

```json
{
  "action": "add_contact",
  "company_id": "公司ID",
  "name": "李四",
  "phone": "13900139000",
  "email": "lisi@example.com",
  "company_name": "客户公司名称",
  "tags": "[\"VIP\", \"技术合作\"]",
  "notes": "通过行业峰会认识，对AI产品感兴趣"
}
```

## 查看客户列表

全部客户：
```json
{
  "action": "list_contacts",
  "company_id": "公司ID"
}
```

按标签筛选：
```json
{
  "action": "list_contacts",
  "company_id": "公司ID",
  "tag": "VIP"
}
```

## 更新客户信息

```json
{
  "action": "update_contact",
  "contact_id": "联系人ID",
  "notes": "已发送产品方案，等待回复",
  "last_contact_date": "2025-01-20"
}
```

## 删除客户

```json
{
  "action": "delete_contact",
  "contact_id": "联系人ID"
}
```

## 标签体系

建议使用以下标签分类客户：
- **客户类型**: `潜在客户`, `正式客户`, `VIP`, `合作伙伴`, `供应商`
- **行业**: `科技`, `金融`, `教育`, `制造`, `服务`
- **状态**: `跟进中`, `已成交`, `已流失`
- **来源**: `转介绍`, `线上获客`, `行业活动`

tags 字段使用 JSON 数组格式，例如: `["VIP", "科技", "跟进中"]`

## 客户跟进建议

在对话中帮助创业者：
1. 添加客户时，主动询问标签和备注
2. 更新跟进记录时，同步更新 `last_contact_date`
3. 如果用户提到与某客户的互动，提醒记录
4. 建议对长时间未联系的客户进行跟进
