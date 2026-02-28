/**
 * 星环OPC中心 — Dashboard 统计 API
 *
 * 路由:
 *   GET /opc/api/dashboard/stats — 平台整体统计
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { authenticateRequest, apiRateLimiter } from "./middleware.js";

export function registerDashboardRoutes(api: OpenClawPluginApi, db: OpcDatabase, gatewayToken?: string): void {
  api.registerHttpRoute({
    path: "/opc/api/dashboard/stats",
    handler: (req, res) => {
      // 限流检查
      if (!apiRateLimiter.check(req, res)) {
        return;
      }

      // 认证检查
      if (!authenticateRequest(req, res, gatewayToken)) {
        return;
      }

      try {
        const stats = db.getDashboardStats();
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(stats));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    },
  });
}
