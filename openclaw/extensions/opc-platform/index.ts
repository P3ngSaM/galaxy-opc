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
import { startReminderService } from "./src/opc/reminder-service.js";
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
import { registerStaffTool } from "./src/tools/staff-tool.js";
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

let db: OpcDatabase | null = null;

const plugin = {
  id: "opc-platform",
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

    // 资金闭环工具（始终启用，核心商业模式）
    registerAcquisitionTool(api, db);
    registerAssetPackageTool(api, db);

    api.logger.info("opc: 工具已按配置注册完毕（重启后生效）");

    // 注册上下文注入钩子
    registerContextInjector(api, db);

    // 注册 HTTP API
    registerHttpRoutes(api, db);

    // 注册 Web UI
    registerConfigUi(api, db);
    registerLandingPage(api);

    // 注册后台服务（数据库生命周期 + 自动提醒）
    let stopReminder: (() => void) | null = null;
    api.registerService({
      id: "opc-db-lifecycle",
      start() {
        api.logger.info("opc: OPC 平台服务已启动");
        // 读取 Webhook 配置
        const webhookRow = db!.queryOne(
          "SELECT value FROM opc_tool_config WHERE key = ?", "webhook_url",
        ) as { value: string } | null;
        const webhookUrl = webhookRow?.value?.trim() || undefined;
        // 启动自动提醒服务（每小时扫描一次）
        stopReminder = startReminderService(
          db!,
          (msg) => api.logger.info(msg),
          webhookUrl,
        );
        api.logger.info(`opc: 自动提醒服务已启动（每小时扫描${webhookUrl ? "，Webhook 已配置" : ""}）`);
      },
      stop() {
        stopReminder?.();
        stopReminder = null;
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
