/**
 * 星环OPC中心 — 公司管理器
 *
 * 负责公司 CRUD、状态流转和后台服务。
 */

import type { OpcDatabase } from "../db/index.js";
import type { OpcCompany, OpcCompanyStatus } from "./types.js";

/** 合法的状态流转规则 */
const VALID_TRANSITIONS: Record<OpcCompanyStatus, OpcCompanyStatus[]> = {
  pending: ["active", "terminated"],
  active: ["suspended", "acquired", "packaged", "terminated"],
  suspended: ["active", "terminated"],
  acquired: ["terminated"],
  packaged: ["terminated"],
  terminated: [],
};

export class CompanyManager {
  constructor(private db: OpcDatabase) {}

  /** 注册新公司（状态为 pending） */
  registerCompany(data: {
    name: string;
    industry: string;
    owner_name: string;
    owner_contact?: string;
    registered_capital?: number;
    description?: string;
  }): OpcCompany {
    return this.db.createCompany({
      name: data.name,
      industry: data.industry,
      owner_name: data.owner_name,
      owner_contact: data.owner_contact ?? "",
      status: "pending",
      registered_capital: data.registered_capital ?? 0,
      description: data.description ?? "",
    });
  }

  /** 激活公司 */
  activateCompany(companyId: string): OpcCompany | null {
    return this.transitionStatus(companyId, "active");
  }

  /** 变更公司状态（校验合法流转） */
  transitionStatus(companyId: string, newStatus: OpcCompanyStatus): OpcCompany | null {
    const company = this.db.getCompany(companyId);
    if (!company) return null;

    const allowed = VALID_TRANSITIONS[company.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `不允许从 "${company.status}" 变更为 "${newStatus}"。` +
          `允许的目标状态: ${allowed.join(", ") || "无（终态）"}`,
      );
    }

    return this.db.updateCompany(companyId, { status: newStatus });
  }

  getCompany(id: string): OpcCompany | null {
    return this.db.getCompany(id);
  }

  listCompanies(status?: OpcCompanyStatus): OpcCompany[] {
    return this.db.listCompanies(status);
  }

  updateCompany(
    id: string,
    data: { name?: string; industry?: string; description?: string; owner_contact?: string },
  ): OpcCompany | null {
    return this.db.updateCompany(id, data);
  }

  deleteCompany(id: string): boolean {
    return this.db.deleteCompany(id);
  }
}
