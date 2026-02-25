/**
 * 星环OPC中心 — HTTP API 路由注册
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { registerCompanyRoutes } from "./companies.js";
import { registerDashboardRoutes } from "./dashboard.js";

export function registerHttpRoutes(api: OpenClawPluginApi, db: OpcDatabase): void {
  registerCompanyRoutes(api, db);
  registerDashboardRoutes(api, db);
  api.logger.info("opc: 已注册 HTTP API 路由");
}
