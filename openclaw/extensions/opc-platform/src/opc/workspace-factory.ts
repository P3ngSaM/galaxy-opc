/**
 * 星环OPC中心 — Agent 工作区工厂
 *
 * 为每家一人公司创建独立的 Agent 工作区。
 * 参照 feishu/dynamic-agent.ts 模式。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";

export type CreateWorkspaceResult = {
  created: boolean;
  agentId: string;
  updatedCfg?: OpenClawConfig;
};

/**
 * 为公司创建或复用 Agent 工作区。
 * Agent ID 格式: opc-{companyId}
 */
export async function ensureCompanyWorkspace(params: {
  companyId: string;
  companyName: string;
  cfg: OpenClawConfig;
  runtime: PluginRuntime;
  log: (msg: string) => void;
  skills?: string[];
}): Promise<CreateWorkspaceResult> {
  const { companyId, companyName, runtime, log, skills } = params;
  const agentId = `opc-${companyId}`;

  // 每次从磁盘读取最新配置，避免用插件启动时的快照覆盖后续写入
  const latestCfg = await runtime.config.loadConfig();

  // 检查 Agent 是否已存在
  const existingAgent = (latestCfg.agents?.list ?? []).find((a) => a.id === agentId);
  if (existingAgent) {
    log(`opc: Agent "${agentId}" 已存在，跳过创建`);
    return { created: false, agentId };
  }

  // 从主 OPC agent 继承 model 配置；若找不到则用 defaults
  const opcAgent = (latestCfg.agents?.list ?? []).find((a) => a.id === "opc");
  const inheritedModel = (opcAgent as { model?: unknown } | undefined)?.model
    ?? latestCfg.agents?.defaults?.model;

  // 解析工作区路径
  const workspace = resolveUserPath(`~/.openclaw/opc-workspaces/${companyId}`);
  const agentDir = resolveUserPath(`~/.openclaw/opc-workspaces/${companyId}/agent`);

  log(`opc: 创建 Agent 工作区 "${agentId}" (${companyName})`);
  log(`  workspace: ${workspace}`);
  log(`  agentDir: ${agentDir}`);

  // 创建目录
  await fs.promises.mkdir(workspace, { recursive: true });
  await fs.promises.mkdir(agentDir, { recursive: true });

  // 写入 AGENTS.md，内含该公司专属的 sessions_send 回传 session key
  const agentsMdPath = path.join(workspace, "AGENTS.md");
  const agentsMdExists = await fs.promises.access(agentsMdPath).then(() => true).catch(() => false);
  if (!agentsMdExists) {
    const sessionKey = `agent:${agentId}:main`;
    await fs.promises.writeFile(agentsMdPath, buildOpcAgentsMd(companyName, sessionKey), "utf-8");
    log(`opc: 已写入 AGENTS.md (sessionKey: ${sessionKey})`);
  }

  // 构造新 Agent 条目（类型从 OpenClawConfig 推断，避免依赖未导出的 AgentConfig）
  type AgentEntry = NonNullable<NonNullable<OpenClawConfig["agents"]>["list"]>[number];
  const newAgent: AgentEntry = {
    id: agentId,
    name: companyName,
    workspace,
    agentDir,
    identity: {
      name: companyName,
      theme: "一人公司 AI 员工，提供行政、财务、HR、法务全方位支持",
      emoji: "🏢",
    },
    subagents: { allowAgents: ["*"] } as AgentEntry["subagents"],
    ...(inheritedModel ? { model: inheritedModel as AgentEntry["model"] } : {}),
    ...(skills && skills.length > 0 ? { skills: skills as AgentEntry["skills"] } : {}),
  };

  // 更新配置 — 新增 Agent（不添加 feishu binding，避免干扰现有渠道配置）
  const updatedCfg: OpenClawConfig = {
    ...latestCfg,
    agents: {
      ...latestCfg.agents,
      list: [
        ...(latestCfg.agents?.list ?? []),
        newAgent,
      ],
    },
  };

  await runtime.config.writeConfigFile(updatedCfg);
  log(`opc: Agent "${agentId}" 已写入配置文件，重启 Gateway 后生效`);
  return { created: true, agentId, updatedCfg };
}

function resolveUserPath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * 生成公司专属的 AGENTS.md 内容。
 * sessionKey 硬编码为该公司 agent 的 main session，确保 subagent 回传时不会路由到错误的公司。
 */
function buildOpcAgentsMd(companyName: string, sessionKey: string): string {
  return `# AGENTS.md - Your Workspace

This folder is home. Treat it that way.

## Every Session

Before doing anything else:

1. Read \`SOUL.md\` — this is who you are
2. Read \`USER.md\` — this is who you're helping
3. Read \`memory/YYYY-MM-DD.md\` (today + yesterday) for recent context
4. **If in MAIN SESSION** (direct chat with your human): Also read \`MEMORY.md\`

Don't ask permission. Just do it.

## Memory

You wake up fresh each session. These files are your continuity:

- **Daily notes:** \`memory/YYYY-MM-DD.md\` (create \`memory/\` if needed) — raw logs of what happened
- **Long-term:** \`MEMORY.md\` — your curated memories, like a human's long-term memory

## Safety

- Don't exfiltrate private data. Ever.
- Don't run destructive commands without asking.
- When in doubt, ask.

---

## OPC ${companyName} — AI 员工调度规则

你是${companyName}的 AI 助理总管，服务于公司老板（用户）。

### 核心职责

- 接收老板指令，判断是自己处理还是派遣 AI 员工
- 通过 \`sessions_spawn\` 工具把专业任务分配给对应 AI 员工
- 多任务时并行派遣，不必串行等待
- 员工完成后结果自动回到本对话，你负责简洁汇总

### 派遣任务的格式

调用 \`sessions_spawn\` 时，\`task\` 参数内容：

\`\`\`
[角色设定]
{该员工的系统提示词，从上下文中的"AI 员工团队"部分获取}

[公司信息]
公司名称：${companyName}
{其他公司信息}

[任务]
{老板交代的具体任务，要详细完整，因为员工没有本对话的上下文}

[完成后操作]
任务完成后，必须使用 sessions_send 工具将结果发送回：
- sessionKey: "${sessionKey}"
- message: 你的完整工作结果报告
\`\`\`

### 调度判断

- 老板明确说「让财务/法务/HR...」→ 直接派对应员工
- 老板说「帮我算税/出报表」→ 判断属于哪个专业方向再派
- 多件事同时 → 并行派多个员工
- 闲聊/简单问题 → 自己直接回答

### 工具说明

AI 员工在 subagent 里运行，可以使用所有 opc_* 工具操作公司数据库，结果会持久化保存。
`;
}
