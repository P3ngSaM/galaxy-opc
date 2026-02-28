/**
 * 星环OPC中心 — OpenClaw 插件入口
 *
 * 一人公司(OPC)孵化与赋能平台。
 * 零核心代码修改，全部通过 Plugin API 扩展。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { registerHttpRoutes } from "./src/api/routes.js";
import type { OpcDatabase } from "./src/db/index.js";
import { SqliteAdapter } from "./src/db/sqlite-adapter.js";
import { registerContextInjector } from "./src/opc/context-injector.js";
import { startProactiveService } from "./src/opc/proactive-service.js";
import { runIntelligenceScanForCompany } from "./src/opc/intelligence-engine.js";
import { detectMilestones } from "./src/opc/milestone-detector.js";
import { updateCompanyStage } from "./src/opc/stage-detector.js";
import {
  registerSpawnedSession,
  getSessionTaskMapping,
  removeSessionTaskMapping,
  clearAllSessionMappings,
} from "./src/opc/session-task-tracker.js";
import { registerAcquisitionTool } from "./src/tools/acquisition-tool.js";
import { registerAssetPackageTool } from "./src/tools/asset-package-tool.js";
import { registerFinanceTool } from "./src/tools/finance-tool.js";
import { registerHrTool } from "./src/tools/hr-tool.js";
import { registerInvestmentTool } from "./src/tools/investment-tool.js";
import { registerLegalTool } from "./src/tools/legal-tool.js";
import { registerLifecycleTool } from "./src/tools/lifecycle-tool.js";
import { registerMediaTool } from "./src/tools/media-tool.js";
import { registerMonitoringTool } from "./src/tools/monitoring-tool.js";
import { registerOpcTool } from "./src/tools/opc-tool.js";
import { registerOpbTool } from "./src/tools/opb-tool.js";
import { registerProcurementTool } from "./src/tools/procurement-tool.js";
import { registerProjectTool } from "./src/tools/project-tool.js";
import { registerSearchTool } from "./src/tools/search-tool.js";
import { registerStaffTool } from "./src/tools/staff-tool.js";
import { registerDocumentTool } from "./src/tools/document-tool.js";
import { registerOpcCommand } from "./src/commands/opc-command.js";
import { triggerEventRules } from "./src/opc/event-triggers.js";
import { registerConfigUi } from "./src/web/config-ui.js";
import { registerLandingPage } from "./src/web/landing-page.js";

/** 解析数据库路径，支持 ~ 前缀 */
function resolveDbPath(configured?: string): string {
  const defaultPath = path.join(os.homedir(), ".openclaw", "opc-platform", "opc.db");
  const dbPath = configured ?? defaultPath;
  if (dbPath.startsWith("~/")) {
    return path.join(os.homedir(), dbPath.slice(2));
  }
  return dbPath;
}

/** 从 sessionKey 中提取公司 ID（格式: agent:opc-{companyId}:subagent:...） */
function extractCompanyIdFromSession(sessionKey: string): string | null {
  const match = sessionKey.match(/agent:opc-([^:]+):/);
  return match ? match[1] : null;
}

let db: OpcDatabase | null = null;

const plugin = {
  id: "galaxy-opc-plugin",
  name: "OPC Platform",
  description: "星环OPC中心 — 一人公司孵化与赋能平台",
  configSchema: Type.Object({
    dbPath: Type.Optional(Type.String({ description: "SQLite 数据库文件路径，默认 ~/.openclaw/opc-platform/opc.db" })),
  }, { additionalProperties: false }),

  register(api: OpenClawPluginApi) {
    // 解析数据库路径
    const dbPath = resolveDbPath(
      (api.pluginConfig as Record<string, unknown> | undefined)?.dbPath as string | undefined,
    );

    // 确保目录存在
    const dbDir = path.dirname(dbPath);
    fs.mkdirSync(dbDir, { recursive: true });

    // 初始化数据库
    db = new SqliteAdapter(dbPath);
    api.logger.info(`opc: 数据库已初始化 (${dbPath})`);

    // 读取工具启用配置（启动时一次性读取，修改后需重启生效）
    const isEnabled = (key: string): boolean => {
      const row = db!.queryOne(
        "SELECT value FROM opc_tool_config WHERE key = ?", key,
      ) as { value: string } | null;
      return row?.value !== "disabled";
    };

    // 注册核心工具（始终启用）
    registerOpcTool(api, db);
    registerStaffTool(api, db);
    registerOpbTool(api, db);
    registerSearchTool(api);

    // 注册 Phase 2 专业工具（可通过管理后台禁用）
    if (isEnabled("opc_finance"))  registerFinanceTool(api, db);
    if (isEnabled("opc_legal"))    registerLegalTool(api, db);
    if (isEnabled("opc_hr"))       registerHrTool(api, db);
    if (isEnabled("opc_media"))    registerMediaTool(api, db);
    if (isEnabled("opc_project"))  registerProjectTool(api, db);

    // 注册 Phase 3 业务闭环工具（可通过管理后台禁用）
    if (isEnabled("opc_investment"))  registerInvestmentTool(api, db);
    if (isEnabled("opc_procurement")) registerProcurementTool(api, db);
    if (isEnabled("opc_lifecycle"))   registerLifecycleTool(api, db);
    if (isEnabled("opc_monitoring"))  registerMonitoringTool(api, db);

    // 文档生成工具（始终启用）
    registerDocumentTool(api, db);

    // 资金闭环工具（始终启用，核心商业模式）
    registerAcquisitionTool(api, db);
    registerAssetPackageTool(api, db);

    api.logger.info("opc: 工具已按配置注册完毕（重启后生效）");

    // 注册上下文注入钩子
    registerContextInjector(api, db);

    // 注册 /opc 快捷命令（毫秒级仪表盘，不经 LLM）
    registerOpcCommand(api, db);

    // 读取 gateway token 用于 API 认证
    const gatewayToken = (() => {
      try {
        const cfg = api.config as Record<string, unknown>;
        const gw = cfg?.gateway as Record<string, unknown> | undefined;
        const auth = gw?.auth as Record<string, unknown> | undefined;
        return auth?.token as string | undefined;
      } catch { return undefined; }
    })();

    // 注册 HTTP API
    registerHttpRoutes(api, db);

    // 注册 Web UI
    registerConfigUi(api, db, gatewayToken);
    registerLandingPage(api);

    // ── 智能刷新器（共享函数，after_tool_call + subagent_ended 共用） ──
    const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
    function triggerIntelligenceRefresh(companyId: string): void {
      const existing = refreshTimers.get(companyId);
      if (existing) clearTimeout(existing);
      refreshTimers.set(companyId, setTimeout(() => {
        refreshTimers.delete(companyId);
        const l = (msg: string) => api.logger.info(msg);
        db!.execute(
          "DELETE FROM opc_insights WHERE company_id = ? AND insight_type = 'data_gap'",
          companyId,
        );
        updateCompanyStage(db!, companyId);
        runIntelligenceScanForCompany(db!, companyId, l);
        detectMilestones(db!, companyId, l);
      }, 5000));
    }

    // 注册 after_tool_call 钩子 — 工具调用后即时刷新洞察（5秒防抖）+ 拦截 sessions_spawn
    api.on("after_tool_call", (event, ctx) => {
      const aid = ctx.agentId;
      if (!aid?.startsWith("opc-")) return;
      const companyId = aid.slice(4);

      // ── 拦截 sessions_spawn：提取 taskId + childSessionKey 建立映射 ──
      const toolName = String((event as Record<string, unknown>).toolName ?? "");
      if (toolName === "sessions_spawn") {
        try {
          const taskParam = (event.params as Record<string, unknown>)?.task as string;
          const match = taskParam?.match(/## 任务 ID\n([a-z0-9-]+)/);
          if (match) {
            const taskId = match[1];
            const result = event.result as Record<string, unknown> | undefined;
            const childSessionKey = (result?.childSessionKey || result?.sessionKey) as string | undefined;
            if (childSessionKey) {
              // 从任务记录获取 staffRole 和 title
              const taskRow = db!.queryOne(
                "SELECT staff_role, title FROM opc_staff_tasks WHERE id = ?", taskId,
              ) as { staff_role: string; title: string } | null;

              registerSpawnedSession(childSessionKey, {
                taskId,
                companyId,
                staffRole: taskRow?.staff_role ?? "",
                title: taskRow?.title ?? "",
                runId: result?.runId as string | undefined,
                spawnedAt: new Date().toISOString(),
              });

              // 持久化 session_key 到数据库
              db!.execute(
                "UPDATE opc_staff_tasks SET session_key = ? WHERE id = ?",
                childSessionKey, taskId,
              );

              api.logger.info(
                `opc: 已追踪子会话 ${childSessionKey} → 任务 ${taskId} (${taskRow?.title ?? "?"})`,
              );
            }
          }
        } catch (err) {
          api.logger.info(`opc: sessions_spawn 追踪失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // ── 事件驱动触发引擎：OPC 工具写入数据后自动检查业务规则 ──
      if (toolName.startsWith("opc_")) {
        triggerEventRules(
          db!, companyId, toolName,
          event.params as Record<string, unknown> | undefined,
          event.result as Record<string, unknown> | undefined,
          (msg) => api.logger.info(msg),
        );
      }

      // ── 通用：刷新洞察 ──
      triggerIntelligenceRefresh(companyId);
    });

    // ── subagent_ended 钩子 — 子会话结束时自动更新任务状态 ──
    api.on("subagent_ended", (event) => {
      try {
        const ev = event as Record<string, unknown>;
        // 优先使用 targetSessionKey（SDK 标准字段），fallback 到 context 中的 childSessionKey
        const sessionKey = ev.targetSessionKey as string
          ?? (ev as Record<string, unknown>).childSessionKey as string
          ?? ev.sessionKey as string;
        if (!sessionKey) return;

        const mapping = getSessionTaskMapping(sessionKey);
        if (!mapping) {
          // 非 OPC 任务，也尝试从数据库查找（服务重启后内存映射丢失的情况）
          const dbTask = db!.queryOne(
            "SELECT id, company_id, staff_role, title, status FROM opc_staff_tasks WHERE session_key = ?",
            sessionKey,
          ) as { id: string; company_id: string; staff_role: string; title: string; status: string } | null;
          if (!dbTask) return;

          // 从数据库恢复映射并处理
          handleSubagentEnd(dbTask.id, dbTask.company_id, dbTask.status, event);
          return;
        }

        const task = db!.queryOne(
          "SELECT status FROM opc_staff_tasks WHERE id = ?", mapping.taskId,
        ) as { status: string } | null;
        if (!task) {
          removeSessionTaskMapping(sessionKey);
          return;
        }

        handleSubagentEnd(mapping.taskId, mapping.companyId, task.status, event);
        removeSessionTaskMapping(sessionKey);
      } catch (err) {
        api.logger.info(`opc: subagent_ended 处理失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    function handleSubagentEnd(
      taskId: string,
      companyId: string,
      currentStatus: string,
      event: Record<string, unknown>,
    ): void {
      const now = new Date().toISOString();
      const outcome = event.outcome as string | undefined;

      if (outcome === "ok" || outcome === "completed") {
        // 员工正常结束 — 如果任务仍 in_progress，说明员工忘了调 update_task
        if (currentStatus === "in_progress") {
          db!.execute(
            `UPDATE opc_staff_tasks SET status = 'completed', completed_at = ?,
             result_summary = CASE WHEN result_summary = '' THEN ? ELSE result_summary END
             WHERE id = ? AND status = 'in_progress'`,
            now,
            "[系统] 员工会话已正常结束但未提交工作报告",
            taskId,
          );
          api.logger.info(`opc: 子会话正常结束，自动标记任务 ${taskId} 为 completed`);
        }
      } else {
        // error/timeout/killed → 自动取消
        const errorDetail = event.error as string || "";
        db!.execute(
          `UPDATE opc_staff_tasks SET status = 'cancelled', completed_at = ?,
           result_summary = ? WHERE id = ? AND status IN ('in_progress', 'pending')`,
          now,
          `[系统] 员工会话异常终止（${outcome || "unknown"}: ${errorDetail})`,
          taskId,
        );
        api.logger.info(`opc: 子会话异常终止(${outcome})，自动取消任务 ${taskId}`);
      }

      triggerIntelligenceRefresh(companyId);
    }

    // ── before_tool_call 权限控制 + switch_company 注入 ──
    api.on("before_tool_call", (event, ctx) => {
      // ── switch_company 自动注入 channel/peer 信息 ──
      const btToolName0 = String((event as Record<string, unknown>).toolName ?? "");
      if (btToolName0 === "opc_manage") {
        const action = (event.params as Record<string, unknown>)?.action;
        if (action === "switch_company" && ctx.sessionKey) {
          const sessionKey = ctx.sessionKey;
          api.logger.info(`opc: switch_company sessionKey = "${sessionKey}"`);
          api.logger.info(`opc: switch_company agentId = "${ctx.agentId}", params = ${JSON.stringify(event.params)}`);
          // 提取 channel: ":direct:" 前面的标识（如 feishu）
          const channelMatch = sessionKey.match(/:([a-z_]+):direct:/);
          const peerMatch = sessionKey.match(/:direct:([^:]+)/);
          const channel = channelMatch?.[1] ?? "";
          const peerId = peerMatch?.[1] ?? "";
          api.logger.info(`opc: switch_company parsed channel="${channel}", peerId="${peerId}"`);
          if (channel && peerId) {
            return {
              params: {
                ...event.params as Record<string, unknown>,
                _channel: channel,
                _peer_id: peerId,
              },
            };
          }
        }
      }

      // ── 子会话权限控制 ──
      // 非子会话不拦截
      if (!ctx.sessionKey?.includes("subagent")) return;

      const btToolName = String((event as Record<string, unknown>).toolName ?? "");
      if (!btToolName.startsWith("opc_")) return; // 非 OPC 工具不拦截

      // 从 params 中提取 company_id
      const paramCompanyId = (event.params as Record<string, unknown>)?.company_id as string | undefined;
      if (!paramCompanyId) return;

      // 从父会话 agentId 或 sessionKey 提取公司 ID
      const parentCompanyId = extractCompanyIdFromSession(ctx.sessionKey);
      if (parentCompanyId && paramCompanyId !== parentCompanyId) {
        return {
          block: true,
          blockReason: `权限拒绝：你只能操作公司 ${parentCompanyId} 的数据，不能操作 ${paramCompanyId}`,
        };
      }
    });

    // 注册后台服务（数据库生命周期 + 主动智能）
    let stopProactive: (() => void) | null = null;
    api.registerService({
      id: "opc-db-lifecycle",
      start() {
        api.logger.info("opc: OPC 平台服务已启动");
        // 读取 Webhook 配置
        const webhookRow = db!.queryOne(
          "SELECT value FROM opc_tool_config WHERE key = ?", "webhook_url",
        ) as { value: string } | null;
        const webhookUrl = webhookRow?.value?.trim() || undefined;
        // 启动主动智能服务（每小时全量扫描）
        stopProactive = startProactiveService(
          db!,
          (msg) => api.logger.info(msg),
          webhookUrl,
        );
        api.logger.info(`opc: 主动智能服务已启动（每小时扫描${webhookUrl ? "，Webhook 已配置" : ""}）`);
      },
      stop() {
        stopProactive?.();
        stopProactive = null;
        // 清理防抖定时器
        for (const timer of refreshTimers.values()) clearTimeout(timer);
        refreshTimers.clear();
        // 清理会话映射
        clearAllSessionMappings();
        if (db) {
          db.close();
          db = null;
          api.logger.info("opc: 数据库连接已关闭");
        }
      },
    });

    api.logger.info("opc: 星环OPC中心插件注册完毕");
  },
};

export default plugin;
