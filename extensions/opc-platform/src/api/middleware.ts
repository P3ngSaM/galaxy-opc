/**
 * 星环OPC中心 — API 中间件（认证 + 限流）
 *
 * 独立模块，避免 routes.ts ↔ companies.ts/dashboard.ts 循环依赖。
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { RateLimiter } from "./rate-limiter.js";

/**
 * 验证请求的 Authorization header 中的 Bearer token。
 * 返回 true 表示认证通过，false 表示认证失败（已发送 401 响应）。
 */
export function authenticateRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedToken: string | undefined,
): boolean {
  // 如果未配置 token，跳过认证（开发模式）
  if (!expectedToken) return true;

  // 允许 OPTIONS 预检请求通过
  if (req.method === "OPTIONS") return true;

  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "未提供认证令牌", code: "AUTH_REQUIRED" }));
    return false;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];
  if (token !== expectedToken) {
    res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "认证令牌无效", code: "AUTH_INVALID" }));
    return false;
  }

  return true;
}

// 共享限流器实例（100 req/min per IP）
export const apiRateLimiter = new RateLimiter(100, 60_000);
