/**
 * 星环OPC中心 — 内存滑动窗口请求限流器
 *
 * Per-IP 限流，默认 100 req/min。
 */

import type { IncomingMessage, ServerResponse } from "node:http";

interface WindowEntry {
  timestamps: number[];
}

export class RateLimiter {
  private windows = new Map<string, WindowEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 100, windowMs = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // 每 5 分钟清理过期条目，防止内存泄漏
    setInterval(() => this.cleanup(), 300_000).unref();
  }

  /**
   * 检查请求是否超过限流。
   * 返回 true 表示允许通过，false 表示被限流（已发送 429 响应）。
   */
  check(req: IncomingMessage, res: ServerResponse): boolean {
    const ip = this.getClientIp(req);
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let entry = this.windows.get(ip);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(ip, entry);
    }

    // 移除窗口外的旧记录
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= this.maxRequests) {
      const retryAfter = Math.ceil((entry.timestamps[0] + this.windowMs - now) / 1000);
      res.writeHead(429, {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": String(retryAfter),
      });
      res.end(JSON.stringify({
        error: "请求过于频繁，请稍后再试",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter,
      }));
      return false;
    }

    entry.timestamps.push(now);
    return true;
  }

  private getClientIp(req: IncomingMessage): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      return forwarded.split(",")[0].trim();
    }
    return req.socket.remoteAddress ?? "unknown";
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    for (const [ip, entry] of this.windows) {
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) {
        this.windows.delete(ip);
      }
    }
  }
}
