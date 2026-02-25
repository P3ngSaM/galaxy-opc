/**
 * 星环OPC中心 — 上下文注入钩子
 *
 * 通过 before_prompt_build 钩子，在每次 Agent 会话中
 * 自动注入公司信息 + AI 员工岗位配置，让 AI 员工了解自己
 * 服务的公司和自己承担的角色职责。
 *
 * 同时提供新手引导：
 * - 数据库无公司时：注入完整的首次使用引导，主动带领用户走 SOP 第一步
 * - 数据库有公司但在普通对话（非 opc-xxx agent）时：注入简短功能菜单提示
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";

type StaffRow = { role: string; role_name: string; system_prompt: string };

/**
 * 注册上下文注入钩子。
 * 当 agentId 以 "opc-" 开头时，自动注入公司上下文 + 启用的 AI 员工岗位提示词。
 * 当 agentId 不以 "opc-" 开头时，注入新手引导或功能菜单。
 */
export function registerContextInjector(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.on("before_prompt_build", (_event, ctx) => {
    const agentId = ctx.agentId;

    // ── 公司专属 Agent：注入公司上下文 ─────────────────────────
    if (agentId && agentId.startsWith("opc-")) {
      const companyId = agentId.slice(4);
      const company = db.getCompany(companyId);
      if (!company) return;

      const finance = db.getFinanceSummary(companyId);
      const staffRows = db.query(
        `SELECT role, role_name, system_prompt FROM opc_staff_config
         WHERE company_id = ? AND enabled = 1 AND system_prompt != ''
         ORDER BY role`,
        companyId,
      ) as StaffRow[];

      const lines = [
        "## 当前服务的公司信息",
        "",
        `- **公司名称**: ${company.name}`,
        `- **所属行业**: ${company.industry}`,
        `- **公司状态**: ${company.status}`,
        `- **创办人**: ${company.owner_name}`,
        `- **注册资本**: ${company.registered_capital.toLocaleString()} 元`,
        `- **简介**: ${company.description || "暂无"}`,
        "",
        "## 财务概况",
        "",
        `- **总收入**: ${finance.total_income.toLocaleString()} 元`,
        `- **总支出**: ${finance.total_expense.toLocaleString()} 元`,
        `- **净收支**: ${finance.net.toLocaleString()} 元`,
        `- **交易笔数**: ${finance.count}`,
      ];

      if (staffRows.length > 0) {
        lines.push("", "## AI 员工团队", "");
        lines.push("你是这家公司的 AI 助理总管，负责接收老板指令并调度 AI 员工完成任务。");
        lines.push("");
        lines.push("**调度方式**：当老板要你安排某个员工去处理某件事时，使用 `sessions_spawn` 工具：");
        lines.push("- `task` 字段：先写员工的角色设定（system prompt），再写具体任务，格式如下：");
        lines.push("  ```");
        lines.push("  [角色设定]");
        lines.push("  {员工的系统提示词}");
        lines.push("");
        lines.push("  [公司信息]");
        lines.push("  {公司名称、行业等基本信息}");
        lines.push("");
        lines.push("  [任务]");
        lines.push("  {老板交代的具体任务}");
        lines.push("");
        lines.push("  [完成后操作]");
        lines.push(`  任务完成后，必须使用 sessions_send 工具将结果发送回请求者：`);
        lines.push(`  - sessionKey: "agent:${agentId}:main"`);
        lines.push("  - message: 你的完整工作结果");
        lines.push("  ```");
        lines.push("- 多个员工可以同时派遣，并行工作");
        lines.push("");
        lines.push("**当前公司 AI 员工列表**：");
        lines.push("");
        for (const staff of staffRows) {
          lines.push(`### ${staff.role_name}（岗位代号：${staff.role}）`);
          lines.push("**系统提示词**：");
          lines.push(staff.system_prompt);
          lines.push("");
        }
        lines.push("**使用示例**：");
        lines.push("- 老板说「让财务帮我查一下本月收支」→ 你调用 sessions_spawn，task 里先写财务顾问的角色设定，再写查询任务");
        lines.push("- 老板说「让法务和HR同时处理...」→ 你同时发起两个 sessions_spawn，两个员工并行工作");
        lines.push("- 老板直接问你问题（不涉及具体员工）→ 你直接回答，不需要派遣");
      } else {
        lines.push("", "你是这家一人公司的 AI 员工。请基于以上信息为创业者提供专业服务。");
        lines.push("提示：可在管理后台的 AI员工 Tab 点「一键初始化默认岗位」来配置专业 AI 员工团队。");
      }

      lines.push("使用中文回复。");
      return { prependContext: lines.join("\n") };
    }

    // ── 普通对话：检测是否需要新手引导 ─────────────────────────
    const companyCount = (db.query("SELECT COUNT(*) as cnt FROM opc_companies") as { cnt: number }[])[0]?.cnt ?? 0;

    if (companyCount === 0) {
      // 全新安装，没有任何公司 → OPB 方法论新手引导
      return {
        prependContext: [
          "## 你是星环OPC中心的 AI 助手兼一人企业方法论顾问",
          "",
          "用户刚刚安装了「星环OPC中心」插件，这是第一次使用。",
          "",
          "**你的任务：主动引导用户用 OPB 方法论规划他的一人企业，然后帮他注册第一家公司。**",
          "",
          "请按以下步骤引导用户：",
          "",
          "### 第一步：热情介绍",
          "用一段话介绍星环OPC能做什么：",
          "- 帮助规划和运营一人企业（基于《一人企业方法论2.0》框架）",
          "- 提供公司管理、财税、合同、HR、项目等全套工具",
          "- 有 AI 员工团队，可以派遣财务顾问、法务助手、HR专员等",
          "",
          "### 第二步：了解用户现状",
          "询问用户：",
          "- 目前是否已经有业务方向/想法？",
          "- 是否还在职（side project 阶段）还是已经全职创业？",
          "- 主要的专业技能或资源优势是什么？",
          "",
          "### 第三步：根据用户回答给出建议",
          "- 如果有想法 → 用赛道选择框架分析（小众强需求 vs 大众刚需，建议聚焦小众强需求）",
          "- 如果没想法 → 引导发现副产品优势（工作副产品、生活副产品、兴趣副产品）",
          "- 提示：一人企业核心是「以小博大」，找到结构性优势",
          "",
          "### 第四步：引导填写 OPB Canvas（简化版）",
          "告诉用户，在注册公司之前，先用几个问题帮他梳理商业模式：",
          "1. **价值主张**：你能为客户解决什么核心问题？",
          "2. **目标客群**：谁是你最精准的客户（越具体越好）？",
          "3. **竞争策略**：你打算用什么方式避开直接竞争（加入生态/差异化/创造新品类）？",
          "4. **收入来源**：初期通过什么方式变现？",
          "",
          "### 第五步：注册公司",
          "Canvas 梳理完后，帮用户注册第一家公司，调用 opc_manage 工具，action 为 register_company。",
          "",
          "语气要热情、专业、像一位懂创业的朋友。使用中文回复。",
        ].join("\n"),
      };
    }

    // 已有公司 → 注入简短功能提示，让 AI 知道自己有哪些能力
    const companies = db.query(
      "SELECT id, name, status FROM opc_companies ORDER BY created_at DESC LIMIT 5",
    ) as { id: string; name: string; status: string }[];

    const companyList = companies.map(c => `- ${c.name}（${c.status}）`).join("\n");

    return {
      prependContext: [
        "## 星环OPC中心 AI 助手",
        "",
        "你是星环OPC中心的 AI 助手兼一人企业方法论顾问，可以帮用户管理旗下的一人公司。",
        "",
        `当前平台共有 ${companyCount} 家公司：`,
        companyList,
        "",
        "**本月 OPB 月报**：建议每月初回顾 MRR（月经常性收入）、资产变化、用户池数据。需要我帮你生成月报吗？",
        "",
        "你能做的事情包括（用户直接用自然语言告诉你即可）：",
        "- **公司管理**：注册公司、激活公司、查询公司信息",
        "- **收支记录**：记录收入/支出、查看财务概况",
        "- **合同管理**：创建合同、查询合同、到期提醒",
        "- **AI 员工**：为公司初始化 AI 员工团队（财务/HR/法务/市场等岗位）",
        "- **税务管理**：创建税务申报记录、查询纳税情况",
        "- **投融资**：创建融资轮次、记录投资人",
        "- **项目管理**：创建项目、跟踪任务进度",
        "- **监控告警**：查看系统自动生成的风险告警",
        "- **OPB方法论咨询**：赛道选择、竞争策略、基础设施规划、月报生成",
        "",
        "管理后台：http://localhost:18789/opc/admin",
        "",
        "请用中文回复，根据用户的需求调用合适的工具。",
      ].join("\n"),
    };
  });
}

