/**
 * 星环OPC中心 — HTTP API 路由注册
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { registerCompanyRoutes } from "./companies.js";
import { registerDashboardRoutes } from "./dashboard.js";

/**
 * 从 OpenClaw 配置中读取 gateway auth token。
 * 配置路径: gateway.auth.token
 */
function getGatewayToken(api: OpenClawPluginApi): string | undefined {
  try {
    const cfg = api.config as Record<string, unknown>;
    const gateway = cfg?.gateway as Record<string, unknown> | undefined;
    const auth = gateway?.auth as Record<string, unknown> | undefined;
    return auth?.token as string | undefined;
  } catch {
    return undefined;
  }
}

export function registerHttpRoutes(api: OpenClawPluginApi, db: OpcDatabase): void {
  const gatewayToken = getGatewayToken(api);

  registerCompanyRoutes(api, db, gatewayToken);
  registerDashboardRoutes(api, db, gatewayToken);
  api.logger.info("opc: 已注册 HTTP API 路由");
}
