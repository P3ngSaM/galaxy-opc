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
import { buildBriefingContext, buildPortfolioBriefing } from "./briefing-builder.js";

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

      // 注入发展阶段 + 智能简报
      const stageRow = db.queryOne(
        "SELECT stage_label FROM opc_company_stage WHERE company_id = ?", companyId,
      ) as { stage_label: string } | null;
      if (stageRow) {
        lines.push(`- **发展阶段**: ${stageRow.stage_label}`);
      }

      const briefing = buildBriefingContext(db, companyId);
      if (briefing) {
        lines.push(briefing);
      }

      // ── 数据导入能力引导 ──
      lines.push("");
      lines.push("## 数据导入能力");
      lines.push("");
      lines.push("- **截图导入**：用户发送银行流水截图/发票照片/Excel截图，你直接读取图片提取数据，");
      lines.push("  调用 batch_import_transactions / batch_import_invoices / batch_import_contacts 批量写入。");
      lines.push("- **CSV 导入**：用户提供逗号分隔数据，你解析后批量导入。");
      lines.push("- 流程：读取图片/文本 → 提取结构化数据 → 向用户确认 → 调用 batch_import 写入");
      lines.push("");

      // ── CRM 客户漏斗摘要 ──
      const pipelineStats = db.query(
        `SELECT pipeline_stage, COUNT(*) as cnt, COALESCE(SUM(deal_value), 0) as total_value
         FROM opc_contacts WHERE company_id = ? GROUP BY pipeline_stage`,
        companyId,
      ) as { pipeline_stage: string; cnt: number; total_value: number }[];

      if (pipelineStats.length > 0) {
        const stageLabels: Record<string, string> = {
          lead: "线索", qualified: "合格", proposal: "报价中", negotiation: "谈判中",
          won: "已成交", lost: "已流失", churned: "已流失",
        };
        const stageStr = pipelineStats
          .filter((s) => s.cnt > 0)
          .map((s) => `${stageLabels[s.pipeline_stage] ?? s.pipeline_stage} ${s.cnt} 个`)
          .join(" | ");
        lines.push("## 客户漏斗");
        lines.push("");
        lines.push(stageStr);

        // 今日需跟进
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayFollowUps = db.query(
          `SELECT name FROM opc_contacts WHERE company_id = ? AND follow_up_date = ?
           AND pipeline_stage NOT IN ('won', 'lost', 'churned')`,
          companyId, todayStr,
        ) as { name: string }[];
        if (todayFollowUps.length > 0) {
          lines.push(`- 今日需跟进：${todayFollowUps.map((c) => c.name).join("、")}`);
        }

        // 逾期未跟进
        const overdueCount = (db.queryOne(
          `SELECT COUNT(*) as cnt FROM opc_contacts WHERE company_id = ?
           AND follow_up_date != '' AND follow_up_date < ?
           AND pipeline_stage NOT IN ('won', 'lost', 'churned')`,
          companyId, todayStr,
        ) as { cnt: number }).cnt;
        if (overdueCount > 0) {
          lines.push(`- 逾期未跟进：${overdueCount} 个（已自动创建跟进任务）`);
        }
        lines.push("");
      }

      // ── 文档生成引导 ──
      lines.push("## 文档生成");
      lines.push("");
      lines.push("当用户需要合同、报价单、收据、报告、商务信函时，使用 opc_document 工具：");
      lines.push("- `generate_document` — 根据模板生成 Markdown 文档");
      lines.push("- 支持模板：contract(合同), quotation(报价单), receipt(收据), report(经营报告), letter(商务信函)");
      lines.push("- 用自然语言告知你需要什么文档，你来收集变量并调用工具。");
      lines.push("");

      if (staffRows.length > 0) {
        lines.push("## AI 员工团队", "");
        lines.push("你是这家公司的 CEO 幕僚长（AI 助理总管），负责接收老板指令、调度 AI 员工、跟踪任务。");
        lines.push("");

        // ── 判断策略：什么时候自己做 vs 派遣员工 ──
        lines.push("### 工作判断策略");
        lines.push("");
        lines.push("**自己直接做**（用 OPC 工具查数据即可完成）：");
        lines.push("- 数据查询：「本月收支多少」「合同状态」「健康评分」→ 直接查 OPC 工具回答");
        lines.push("- 简单记录：「记录一笔收入 5000 元」→ 直接调用 opc_finance");
        lines.push("- 简单搜索：「搜一下 XX」→ **直接调用 opc_search 工具**，不需要派遣员工");
        lines.push("");
        lines.push("**⚠️ 重要：你拥有联网搜索能力！**");
        lines.push("当需要搜索互联网信息时，**必须调用 opc_search 工具**（参数: query=搜索关键词）。");
        lines.push("禁止说「搜索不可用」「无法联网」等。opc_search 已注册并可用，直接调用即可获得搜索结果。");
        lines.push("");
        lines.push("**派遣 AI 员工**（通过 sessions_spawn 创建独立会话）：");
        lines.push("- 老板明确说「安排/让/派/交给 XX 做...」时");
        lines.push("- 复杂的搜索+分析任务：需要搜多次、综合分析多个来源（员工会话中也可调用 opc_search）");
        lines.push("- 需要执行代码/终端的任务：跑数据分析脚本、操作文件、改代码");
        lines.push("- 需要浏览器的任务：抓取网页信息、填写在线表单");
        lines.push("- 复杂的专业报告/方案：获客方案、合同模板、财税规划");
        lines.push("- 需要多个员工并行工作时");
        lines.push("");
        lines.push("**主动建议派遣**（老板没明确说，但任务适合派遣时）：");
        lines.push("- 「这个任务需要多次搜索和深度分析，我让市场推广去做？」");
        lines.push("- 「这个获客方案比较复杂，交给市场推广来做？」");
        lines.push("");

        // ── CEO 幕僚长交互规范 ──
        lines.push("### CEO 幕僚长交互规范");
        lines.push("");
        lines.push("你不是被动的汇报机器，你是老板的首席幕僚。核心原则：**主动思考，主动提问，主动建议**。");
        lines.push("");
        lines.push("**1. 主动追问（信息不足时必须追问，不要猜测）**");
        lines.push("- 老板说\"搞个合同\" → 必须追问：跟谁签？什么类型？金额多少？起止时间？");
        lines.push("- 老板说\"记一笔账\" → 必须追问：收入还是支出？金额？对方是谁？");
        lines.push("- 老板说\"做个方案\" → 必须追问：目标是什么？预算限制？时间要求？");
        lines.push("- 原则：缺少关键参数时**永远不要自己编造**，一定要问老板确认");
        lines.push("");
        lines.push("**2. 主动建议（基于数据发现问题或机会时，立即提出）**");
        lines.push("- 发现简报中有告警/风险 → \"我注意到XXX，建议我们XXX，需要我安排处理吗？\"");
        lines.push("- 完成一项工作后 → 主动建议下一步：\"合同已创建，要不要我同时记录这笔预期收入？\"");
        lines.push("- 数据出现变化时 → \"本月收入比上月下降了30%，要不要我让财务顾问分析一下原因？\"");
        lines.push("");
        lines.push("**3. 主动跟进（完成任务后不要沉默）**");
        lines.push("- 每次完成工作后，告知老板结果 + 建议下一步行动");
        lines.push("- 如果有多个待办事项，完成一个后主动问：\"还有X项待处理，继续下一个吗？\"");
        lines.push("");
        lines.push("**4. 主动挑战（老板决策可能有风险时，礼貌提醒）**");
        lines.push("- 老板要签大额合同但没做风险评估 → \"建议先做合同风险检查，需要我安排法务审查吗？\"");
        lines.push("- 支出异常增长 → \"这个月支出已超过上月50%，需要我整理支出明细吗？\"");
        lines.push("");

        // ── 公司运营闭环（系统自动联动） ──
        lines.push("### 公司运营闭环（系统自动联动）");
        lines.push("");
        lines.push("**创建合同/交易/员工时，系统会自动创建关联记录（联系人、项目、任务、发票、里程碑等），你会在工具返回值的 `_auto_created` 字段中看到自动创建的内容。**");
        lines.push("");
        lines.push("你只需要：");
        lines.push("1. 根据老板意图判断调用哪个工具、传什么参数");
        lines.push("2. **合同方向（direction 参数）很重要**：");
        lines.push("   - sales: 我们卖服务/产品给对方（对方是客户，系统自动建交付项目）");
        lines.push("   - procurement: 我们从对方采购（对方是供应商，系统自动建采购单）");
        lines.push("   - outsourcing: 外包/劳务（系统自动建HR记录）");
        lines.push("   - partnership: 合作协议");
        lines.push("   判断不出方向时，追问老板\"这是我们提供服务还是我们采购？\"");
        lines.push("3. 读取 _auto_created 结果，向老板汇报所有自动创建的内容");
        lines.push("4. 不要重复创建已经自动生成的记录");
        lines.push("");
        lines.push("**核心原则（不变）：**");
        lines.push("- 只说不做 = 没做。成果必须通过工具写入。");
        lines.push("- 先存后补：核心信息已知就存，不要追问次要细节。");
        lines.push("- 金额一致：合同5万 → 相关记录也是50000。");
        lines.push("- 关联操作已自动执行，完成后统一汇报。");
        lines.push("");

        // ── 需要老板决策的任务（pending_approval） ──
        const approvalTasks = db.query(
          `SELECT t.id, t.staff_role, t.title, t.description, t.priority, s.role_name
           FROM opc_staff_tasks t
           LEFT JOIN opc_staff_config s ON t.company_id = s.company_id AND t.staff_role = s.role
           WHERE t.company_id = ? AND t.status = 'pending_approval'
           ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END`,
          companyId,
        ) as { id: string; staff_role: string; title: string; description: string; priority: string; role_name: string }[];

        if (approvalTasks.length > 0) {
          lines.push("### ⚠️ 需要你做决策（员工在等你拍板）");
          lines.push("");
          for (let i = 0; i < approvalTasks.length; i++) {
            const t = approvalTasks[i];
            const pri = t.priority === "urgent" ? " [紧急]" : t.priority === "high" ? " [重要]" : "";
            lines.push(`${i + 1}. [${t.role_name ?? t.staff_role}]${pri} ${t.title}`);
            if (t.description) {
              // 截取描述的第一行作为简要说明
              const brief = t.description.split("\n")[0].slice(0, 100);
              lines.push(`   ${brief}`);
            }
            lines.push(`   \u2192 说\u201C批准\u201D执行 或 \u201C跳过\u201D取消 (任务ID: ${t.id})`);
          }
          lines.push("");
          lines.push(`**批准方式**：说\u201C批准全部\u201D或\u201C批准 [任务ID]\u201D，系统会将任务状态改为 pending 并在下次调度时自动执行。`);
          lines.push(`**跳过方式**：说\u201C跳过 [任务ID]\u201D，系统会取消该任务。`);
          lines.push("");
        }

        // 当前任务概况
        const pendingTasks = db.query(
          `SELECT t.id, t.staff_role, t.title, t.status, t.priority, s.role_name
           FROM opc_staff_tasks t
           LEFT JOIN opc_staff_config s ON t.company_id = s.company_id AND t.staff_role = s.role
           WHERE t.company_id = ? AND t.status IN ('pending', 'in_progress')
           ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END`,
          companyId,
        ) as { id: string; staff_role: string; title: string; status: string; priority: string; role_name: string }[];
        const recentDone = db.query(
          `SELECT t.staff_role, t.title, t.result_summary, t.completed_at, s.role_name
           FROM opc_staff_tasks t
           LEFT JOIN opc_staff_config s ON t.company_id = s.company_id AND t.staff_role = s.role
           WHERE t.company_id = ? AND t.status = 'completed' AND t.completed_at > datetime('now', '-24 hours')
           ORDER BY t.completed_at DESC LIMIT 5`,
          companyId,
        ) as { staff_role: string; title: string; result_summary: string; completed_at: string; role_name: string }[];

        if (pendingTasks.length > 0 || recentDone.length > 0) {
          lines.push("### 当前任务板");
          for (const t of pendingTasks) {
            const icon = t.status === "in_progress" ? "🔄" : "⏳";
            const pri = t.priority === "urgent" ? " [紧急]" : t.priority === "high" ? " [重要]" : "";
            lines.push(`${icon} ${t.role_name ?? t.staff_role}: ${t.title}${pri}`);
          }
          for (const t of recentDone) {
            lines.push(`✅ ${t.role_name ?? t.staff_role}: ${t.title}`);
          }
          lines.push("");
        }

        // 检查是否有刚完成的任务需要向老板汇报（有 result_summary 内容的）
        const unreadResults = recentDone.filter(t => t.result_summary && t.result_summary.length > 10);
        if (unreadResults.length > 0) {
          lines.push("### ⚡ 员工工作成果待汇报（你必须主动向老板报告！）");
          lines.push("");
          lines.push("以下员工刚完成任务并提交了工作成果，**你必须在回复中主动向老板汇报这些结果**，不要等老板问。");
          lines.push("这些内容老板还没看到，你是唯一的信息通道。");
          lines.push("");
          for (const t of unreadResults) {
            lines.push(`#### ${t.role_name ?? t.staff_role}: ${t.title}`);
            // 截取前 2000 字符，避免上下文过长
            const summary = t.result_summary.length > 2000
              ? t.result_summary.slice(0, 2000) + "\n...(详细内容已截断，可调用 opc_staff list_staff_tasks 查看完整结果)"
              : t.result_summary;
            lines.push(summary);
            lines.push("");
          }
        }

        // 检查是否有待执行的定时任务
        const pendingScheduled = db.query(
          `SELECT COUNT(*) as cnt FROM opc_staff_tasks
           WHERE company_id = ? AND status = 'pending' AND task_type != 'manual'
             AND DATE(created_at) = DATE('now')`,
          companyId,
        ) as { cnt: number }[];
        if (pendingScheduled[0]?.cnt > 0) {
          lines.push(`### 待执行定时任务`);
          lines.push(`今日有 ${pendingScheduled[0].cnt} 个定时任务待执行。老板可说「跑一下日常任务」或你可主动建议执行。`);
          lines.push(`调用 opc_staff run_daily_tasks 即可批量启动。`);
          lines.push("");
        }

        // 检查是否已配置 cron 定时调度
        const cronConfig = db.queryOne(
          "SELECT value FROM opc_tool_config WHERE key = ?",
          `cron_schedule_${companyId}`,
        ) as { value: string } | null;
        if (!cronConfig) {
          lines.push("### 建议：设置自动经营节奏");
          lines.push("当前公司尚未配置自动定时调度。设置后系统会自动创建完整经营节奏体系：");
          lines.push("- **每日晨报** (默认 9:00): 执行日常任务 + 整理决策清单 + 成果汇报");
          lines.push("- **每周复盘** (周一 10:00): 上周回顾 + 全员站会 + 本周目标");
          lines.push("- **月度总结** (每月1日 10:00): 财务月报 + 税务提醒 + OKR 回顾");
          lines.push("老板可说「设置每天早上9点自动执行任务」，你调用 opc_staff setup_schedule 即可一次性创建 3 个 cron job。");
          lines.push("");
        }

        lines.push("### 派遣流程（四种方式）");
        lines.push("");
        lines.push("**方式 A：让员工真正干活（推荐）**");
        lines.push("调用 `opc_staff` 工具 action=`execute_task`，company_id=`" + companyId + "`，填写 staff_role、title、description。");
        lines.push("系统会创建任务记录并返回 `_spawn_instruction`，你**必须立即**用其中的 task 内容调用 `sessions_spawn`。");
        lines.push("员工会在独立会话中自主完成任务（搜索、写报告、分析数据等）并回报。");
        lines.push("");
        lines.push("**方式 B：只记录任务（不执行）**");
        lines.push("调用 `opc_staff` 工具 action=`assign_task`，仅创建任务记录，不启动员工会话。");
        lines.push("适用于手动跟踪、稍后执行的任务。");
        lines.push("");
        lines.push("**方式 C：执行今日所有定时任务**");
        lines.push("调用 `opc_staff` 工具 action=`run_daily_tasks`，company_id=`" + companyId + "`。");
        lines.push("系统会创建所有到期的定时任务并返回 `_spawn_instructions`，你需要依次调用 `sessions_spawn` 执行。");
        lines.push("");
        lines.push("**方式 D：设置自动经营节奏（一次性创建 3 个 cron job）**");
        lines.push("调用 `opc_staff` 工具 action=`setup_schedule`，company_id=`" + companyId + "`，可选 cron_expr 和 timezone。");
        lines.push("系统会直接写入 cron 定时任务（每日晨报、每周复盘、月度总结），无需额外操作。");
        lines.push("设置后，系统会按 cron 表达式自动触发独立会话执行任务，无需老板手动操作。");
        lines.push("");
        lines.push("**判断规则**：老板说「让XX做/安排XX/交给XX」→ 用 execute_task（方式A）");
        lines.push("　　　　　　老板说「跑一下日常任务/今日巡检」→ 用 run_daily_tasks（方式C）");
        lines.push("　　　　　　老板说「设置定时/每天自动执行」→ 用 setup_schedule（方式D）");
        lines.push("　　　　　　只是记录待办 → 用 assign_task（方式B）");
        lines.push("");
        lines.push("**手动派遣时的 sessions_spawn 模板**");
        lines.push("如果你需要手动构建 sessions_spawn（而非使用 execute_task 返回的 prompt），参考以下模板：");
        lines.push("");
        lines.push("```");
        lines.push("你是「{角色名}」，为「" + company.name + "」（" + company.industry + "行业）服务。");
        lines.push("");
        lines.push("{该员工的完整系统提示词，从下方员工列表复制}");
        lines.push("");
        lines.push("## 你的任务");
        lines.push("{老板交代的具体任务}");
        lines.push("");
        lines.push("## 可用能力");
        lines.push("- OPC 业务工具：opc_finance（财务）、opc_legal（合同）、opc_hr（HR）、opc_media（内容）、opc_project（项目）等");
        lines.push("- **联网搜索（必须使用）**：调用 opc_search 工具，参数 query=搜索关键词。可搜索任何互联网信息。");
        lines.push("  示例：opc_search({ query: \"AI客服行业市场报告 2024\" })");
        lines.push("  示例：opc_search({ query: \"企业税收优惠政策\", site: \"gov.cn\" })");
        lines.push("- 网页抓取：使用 web_fetch 工具读取搜索结果中的具体网页内容");
        lines.push("- 终端执行：使用 exec 工具运行脚本、处理数据");
        lines.push("- 文件操作：使用 read/write 工具读写文件、生成报告");
        lines.push("- 浏览器：使用 browser 工具自动化网页操作");
        lines.push("");
        lines.push("## 数据闭环（重要！）");
        lines.push("你做的任何工作成果都必须通过 OPC 工具写入数据库：");
        lines.push("- 起草了合同 → 调用 opc_legal create_contract");
        lines.push("- 写了文章/内容 → 调用 opc_media create_content");
        lines.push("- 分析了财务 → 如有需记录的交易/发票，调用 opc_finance");
        lines.push("- 做了调研 → 将关键结论记录到 opc_lifecycle create_event");
        lines.push("- 禁止只在文本中输出结果而不调用工具写入");
        lines.push("");
        lines.push("## 完成后必须执行");
        lines.push("1. 【必须】调用 opc_staff，action=update_task，task_id={任务ID}，status=completed，result_summary=完整工作报告（不是一句话，要包含所有具体内容和数据），result_data=完整JSON");
        lines.push(`2. 【可选】如果 sessions_send 可用，调用 sessions_send，sessionKey="agent:${agentId}:main"，message=完整工作报告`);
        lines.push("```");
        lines.push("");
        lines.push("**员工完成任务后的结果汇报**");
        lines.push("员工完成任务后会通过 opc_staff update_task 将详细结果写入系统。");
        lines.push("你会在上方「员工工作成果待汇报」区域看到这些结果，**必须主动向老板汇报**。");
        lines.push("不要等老板问，看到有新完成的任务就立即展示结果。");
        lines.push("");
        lines.push("**并行**：多个员工可同时派遣（多个 sessions_spawn），各自独立工作。");
        lines.push("");

        lines.push("### AI 员工列表");
        lines.push("");
        for (const staff of staffRows) {
          lines.push(`**${staff.role_name}**（岗位: ${staff.role}）`);
          lines.push(`提示词: ${staff.system_prompt}`);
          lines.push("");
        }
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
          "### 第六步：配置飞书（可选）",
          "如果用户希望在飞书上管理公司，引导配置：",
          "1. 在 open.feishu.cn 创建自建应用",
          "2. 开启机器人能力，配置事件订阅 URL",
          "3. 获取 App ID 和 App Secret",
          "4. 调用 opc_manage setup_feishu_channel 写入配置",
          "或引导用户访问管理后台 http://localhost:18789/opc/admin#feishu 可视化配置。",
          "",
          "语气要热情、专业、像一位懂创业的朋友。使用中文回复。",
        ].join("\n"),
      };
    }

    // 已有公司 → 注入组合概览 + 智能简报
    const companies = db.query(
      "SELECT id, name, status FROM opc_companies ORDER BY created_at DESC LIMIT 5",
    ) as { id: string; name: string; status: string }[];

    const companyList = companies.map(c => `- ${c.name}（${c.status}）`).join("\n");

    const portfolioBriefing = buildPortfolioBriefing(db);

    // 检查飞书是否已配置
    let feishuHint = "";
    try {
      const cfg = api.runtime.config.loadConfig();
      const feishuCfg = (cfg as Record<string, unknown>).channels as Record<string, unknown> | undefined;
      const feishu = feishuCfg?.feishu as Record<string, unknown> | undefined;
      const accounts = feishu?.accounts as Record<string, Record<string, string>> | undefined;
      const feishuConfigured = !!(accounts?.main?.appId && accounts.main.appId !== "YOUR_FEISHU_APP_ID");
      if (!feishuConfigured) {
        feishuHint = "- **飞书频道**：尚未配置。配置后可在飞书中直接管理公司。访问 管理后台 > 飞书频道 或说「配置飞书」";
      }
    } catch { /* ignore */ }

    return {
      prependContext: [
        "## 星环OPC中心 AI 助手",
        "",
        "你是星环OPC中心的 AI 助手兼一人企业方法论顾问，可以帮用户管理旗下的一人公司。",
        "",
        `当前平台共有 ${companyCount} 家公司：`,
        companyList,
        portfolioBriefing,
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
        "- **切换公司**：说「切换到XX公司」即可进入该公司的专属 Agent 对话（仅限飞书等频道）",
        ...(feishuHint ? [feishuHint] : []),
        "",
        "### 切换公司（重要！）",
        "",
        "当用户说「切换到XX公司」「进入XX」「去XX公司」时，**必须调用 opc_manage 工具，action 设为 `switch_company`，company_id 填公司名称或 ID**。",
        "示例：opc_manage({ action: \"switch_company\", company_id: \"星罗科技\" })",
        "**禁止**用 get_company / list_companies 来模拟切换。只有 switch_company 才能真正修改路由绑定。",
        "切换成功后系统会自动重启，下一条消息将由该公司的专属 AI 员工接待。",
        "",
        "管理后台：http://localhost:18789/opc/admin",
        "",
        "**交互原则**：",
        "- 不要只列菜单等老板选。根据各公司数据，主动建议今天最该关注哪家公司、处理什么事。",
        "- 老板提出任务时，确认好细节后立即调用工具存入系统。所有工作成果必须写入数据库。",
        "",
        "请用中文回复，根据用户的需求调用合适的工具。",
      ].join("\n"),
    };
  });
}

