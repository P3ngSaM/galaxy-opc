/**
 * 星环OPC中心 — 公司 CRUD REST API
 *
 * 路由:
 *   GET    /opc/api/companies          — 列出所有公司
 *   GET    /opc/api/companies/:id      — 获取单个公司
 *   POST   /opc/api/companies          — 创建公司
 *   PUT    /opc/api/companies/:id      — 更新公司
 *   DELETE /opc/api/companies/:id      — 删除公司
 *   GET    /opc/api/companies/:id/transactions — 获取公司交易
 *   GET    /opc/api/companies/:id/contacts     — 获取公司客户
 *   GET    /opc/api/companies/:id/finance      — 获取公司财务摘要
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { CompanyManager } from "../opc/company-manager.js";
import type { OpcCompanyStatus } from "../opc/types.js";

const OPC_API_PREFIX = "/opc/api/companies";

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, status = 400): void {
  sendJson(res, { error: message }, status);
}

async function readBody(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseJson(body: string): Record<string, unknown> | null {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function registerCompanyRoutes(api: OpenClawPluginApi, db: OpcDatabase): void {
  const manager = new CompanyManager(db);

  api.registerHttpHandler(async (req, res) => {
    const rawUrl = req.url ?? "";
    const method = req.method?.toUpperCase() ?? "GET";

    // 解析 URL，分离路径和查询参数
    const urlObj = new URL(rawUrl, "http://localhost");
    const pathname = urlObj.pathname;

    // 只处理 /opc/api/companies 开头的请求
    if (!pathname.startsWith(OPC_API_PREFIX)) {
      return false;
    }

    const subPath = pathname.slice(OPC_API_PREFIX.length);

    try {
      // GET/POST /opc/api/companies
      if (subPath === "" || subPath === "/") {
        if (method === "GET") {
          const status = urlObj.searchParams.get("status") as OpcCompanyStatus | null;
          sendJson(res, manager.listCompanies(status ?? undefined));
          return true;
        }
        if (method === "POST") {
          const body = parseJson(await readBody(req));
          if (!body) {
            sendError(res, "Invalid JSON body");
            return true;
          }
          const name = body.name as string | undefined;
          const industry = body.industry as string | undefined;
          const owner_name = body.owner_name as string | undefined;
          if (!name || !industry || !owner_name) {
            sendError(res, "缺少必填字段: name, industry, owner_name");
            return true;
          }
          const company = manager.registerCompany({
            name,
            industry,
            owner_name,
            owner_contact: (body.owner_contact as string) ?? undefined,
            registered_capital: (body.registered_capital as number) ?? undefined,
            description: (body.description as string) ?? undefined,
          });
          sendJson(res, company, 201);
          return true;
        }
        sendError(res, "Method not allowed", 405);
        return true;
      }

      // 提取 ID 和子路径
      const match = subPath.match(/^\/([^/]+)(\/.*)?$/);
      if (!match) {
        sendError(res, "Invalid path", 404);
        return true;
      }

      const companyId = match[1];
      const tail = match[2] ?? "";

      // GET /opc/api/companies/:id/transactions
      if (tail === "/transactions" && method === "GET") {
        sendJson(res, db.listTransactions(companyId, { limit: 100 }));
        return true;
      }

      // GET /opc/api/companies/:id/contacts
      if (tail === "/contacts" && method === "GET") {
        sendJson(res, db.listContacts(companyId));
        return true;
      }

      // GET /opc/api/companies/:id/finance
      if (tail === "/finance" && method === "GET") {
        sendJson(res, db.getFinanceSummary(companyId));
        return true;
      }

      // 以下处理 /opc/api/companies/:id（无子路径）
      if (tail !== "") {
        sendError(res, "Not found", 404);
        return true;
      }

      switch (method) {
        // GET /opc/api/companies/:id
        case "GET": {
          const company = manager.getCompany(companyId);
          if (!company) {
            sendError(res, "公司不存在", 404);
          } else {
            sendJson(res, company);
          }
          return true;
        }

        // POST /opc/api/companies (companyId 在这种情况下是数据的一部分)
        // 实际的 POST 创建走 subPath === "" 分支，这里不需要处理

        // PUT /opc/api/companies/:id
        case "PUT": {
          const body = parseJson(await readBody(req));
          if (!body) {
            sendError(res, "Invalid JSON body");
            return true;
          }
          const updated = manager.updateCompany(companyId, body as Record<string, string>);
          if (!updated) {
            sendError(res, "公司不存在", 404);
          } else {
            sendJson(res, updated);
          }
          return true;
        }

        // DELETE /opc/api/companies/:id
        case "DELETE": {
          const deleted = manager.deleteCompany(companyId);
          sendJson(res, { deleted });
          return true;
        }

        default:
          sendError(res, "Method not allowed", 405);
          return true;
      }
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : String(err), 500);
      return true;
    }
  });
}
