/**
 * 星环OPC中心 — 数据库抽象层
 */

import type {
  OpcCompany,
  OpcCompanyStatus,
  OpcContact,
  OpcEmployee,
  OpcTransaction,
} from "../opc/types.js";

export interface OpcDatabase {
  close(): void;

  // Companies
  createCompany(data: Omit<OpcCompany, "id" | "created_at" | "updated_at">): OpcCompany;
  getCompany(id: string): OpcCompany | null;
  listCompanies(status?: OpcCompanyStatus): OpcCompany[];
  updateCompany(id: string, data: Partial<OpcCompany>): OpcCompany | null;
  deleteCompany(id: string): boolean;

  // Employees
  createEmployee(data: Omit<OpcEmployee, "id" | "created_at">): OpcEmployee;
  getEmployee(id: string): OpcEmployee | null;
  listEmployees(companyId: string): OpcEmployee[];

  // Transactions
  createTransaction(data: Omit<OpcTransaction, "id" | "created_at">): OpcTransaction;
  getTransaction(id: string): OpcTransaction | null;
  listTransactions(
    companyId: string,
    opts?: { type?: string; startDate?: string; endDate?: string; limit?: number },
  ): OpcTransaction[];
  getFinanceSummary(
    companyId: string,
    startDate?: string,
    endDate?: string,
  ): { total_income: number; total_expense: number; net: number; count: number };

  // Contacts
  createContact(data: Omit<OpcContact, "id" | "created_at" | "updated_at">): OpcContact;
  getContact(id: string): OpcContact | null;
  listContacts(companyId: string, tag?: string): OpcContact[];
  updateContact(id: string, data: Partial<OpcContact>): OpcContact | null;
  deleteContact(id: string): boolean;

  // Dashboard
  getDashboardStats(): {
    total_companies: number;
    active_companies: number;
    total_transactions: number;
    total_contacts: number;
    total_revenue: number;
    total_expense: number;
  };

  // Generic (Phase 2)
  query(sql: string, ...params: unknown[]): unknown[];
  queryOne(sql: string, ...params: unknown[]): unknown | null;
  execute(sql: string, ...params: unknown[]): { changes: number };
  genId(): string;
}
