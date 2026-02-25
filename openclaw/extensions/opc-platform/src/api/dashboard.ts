/**
 * 星环OPC中心 — Dashboard 统计 API
 *
 * 路由:
 *   GET /opc/api/dashboard/stats — 平台整体统计
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";

export function registerDashboardRoutes(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerHttpRoute({
    path: "/opc/api/dashboard/stats",
    handler: (_req, res) => {
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
