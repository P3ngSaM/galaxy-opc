/**
 * 星环OPC中心 — opc_hr 人力资源工具
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpcDatabase } from "../db/index.js";
import { json } from "../utils/tool-helper.js";

const HrSchema = Type.Union([
  Type.Object({
    action: Type.Literal("add_employee"),
    company_id: Type.String({ description: "公司 ID" }),
    employee_name: Type.String({ description: "员工姓名" }),
    position: Type.String({ description: "岗位" }),
    salary: Type.Number({ description: "月薪（元）" }),
    contract_type: Type.Optional(Type.String({ description: "用工类型: full_time/part_time/contractor/intern" })),
    start_date: Type.Optional(Type.String({ description: "入职日期 (YYYY-MM-DD)" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("list_employees"),
    company_id: Type.String({ description: "公司 ID" }),
    status: Type.Optional(Type.String({ description: "按状态筛选: active/resigned/terminated" })),
  }),
  Type.Object({
    action: Type.Literal("update_employee"),
    record_id: Type.String({ description: "员工记录 ID" }),
    salary: Type.Optional(Type.Number({ description: "新月薪" })),
    position: Type.Optional(Type.String({ description: "新岗位" })),
    status: Type.Optional(Type.String({ description: "新状态: active/resigned/terminated" })),
    end_date: Type.Optional(Type.String({ description: "离职日期" })),
    notes: Type.Optional(Type.String({ description: "备注" })),
  }),
  Type.Object({
    action: Type.Literal("calc_social_insurance"),
    salary: Type.Number({ description: "月薪基数（元）" }),
    city: Type.Optional(Type.String({ description: "城市，默认按一般标准" })),
  }),
  Type.Object({
    action: Type.Literal("calc_personal_tax"),
    monthly_salary: Type.Number({ description: "月薪（元）" }),
    social_insurance: Type.Optional(Type.Number({ description: "个人社保公积金合计（元）" })),
    special_deduction: Type.Optional(Type.Number({ description: "专项附加扣除合计（元/月）" })),
  }),
  Type.Object({
    action: Type.Literal("payroll_summary"),
    company_id: Type.String({ description: "公司 ID" }),
  }),
  Type.Object({
    action: Type.Literal("delete_employee"),
    record_id: Type.String({ description: "员工记录 ID" }),
  }),
]);

type HrParams = Static<typeof HrSchema>;

/** 社保公积金估算（一般城市标准） */
function calcSocialInsurance(salary: number) {
  const base = Math.max(Math.min(salary, 31884), 6377); // 一般上下限
  const company = {
    pension: Math.round(base * 0.16 * 100) / 100,
    medical: Math.round(base * 0.095 * 100) / 100,
    unemployment: Math.round(base * 0.005 * 100) / 100,
    injury: Math.round(base * 0.004 * 100) / 100,
    housing_fund: Math.round(base * 0.12 * 100) / 100,
  };
  const personal = {
    pension: Math.round(base * 0.08 * 100) / 100,
    medical: Math.round(base * 0.02 * 100) / 100,
    unemployment: Math.round(base * 0.005 * 100) / 100,
    housing_fund: Math.round(base * 0.12 * 100) / 100,
  };
  return {
    base,
    company_total: Object.values(company).reduce((a, b) => a + b, 0),
    personal_total: Object.values(personal).reduce((a, b) => a + b, 0),
    company,
    personal,
  };
}

/** 个税累进税率计算 */
function calcPersonalTax(monthlyTaxable: number): { tax: number; rate: number; deduction: number } {
  const annual = monthlyTaxable * 12;
  const brackets = [
    { limit: 36000, rate: 0.03, deduction: 0 },
    { limit: 144000, rate: 0.10, deduction: 2520 },
    { limit: 300000, rate: 0.20, deduction: 16920 },
    { limit: 420000, rate: 0.25, deduction: 31920 },
    { limit: 660000, rate: 0.30, deduction: 52920 },
    { limit: 960000, rate: 0.35, deduction: 85920 },
    { limit: Infinity, rate: 0.45, deduction: 181920 },
  ];
  for (const b of brackets) {
    if (annual <= b.limit) {
      const annualTax = Math.round((annual * b.rate - b.deduction) * 100) / 100;
      return { tax: Math.round(annualTax / 12 * 100) / 100, rate: b.rate, deduction: b.deduction };
    }
  }
  return { tax: 0, rate: 0, deduction: 0 };
}

export function registerHrTool(api: OpenClawPluginApi, db: OpcDatabase): void {
  api.registerTool(
    {
      name: "opc_hr",
      label: "OPC 人力资源",
      description:
        "人力资源管理工具。操作: add_employee(添加员工), list_employees(员工列表), " +
        "update_employee(更新员工), calc_social_insurance(社保公积金计算), " +
        "calc_personal_tax(个税计算), payroll_summary(薪酬汇总), delete_employee(删除员工记录)",
      parameters: HrSchema,
      async execute(_toolCallId, params) {
        const p = params as HrParams;
        try {
          switch (p.action) {
            case "add_employee": {
              const id = db.genId();
              const now = new Date().toISOString();
              const si = calcSocialInsurance(p.salary);
              db.execute(
                `INSERT INTO opc_hr_records (id, company_id, employee_name, position, salary, social_insurance, housing_fund, start_date, contract_type, status, notes, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
                id, p.company_id, p.employee_name, p.position, p.salary,
                si.personal.pension + si.personal.medical + si.personal.unemployment,
                si.personal.housing_fund,
                p.start_date ?? now.slice(0, 10),
                p.contract_type ?? "full_time",
                p.notes ?? "", now, now,
              );
              return json(db.queryOne("SELECT * FROM opc_hr_records WHERE id = ?", id));
            }

            case "list_employees": {
              let sql = "SELECT * FROM opc_hr_records WHERE company_id = ?";
              const params2: unknown[] = [p.company_id];
              if (p.status) { sql += " AND status = ?"; params2.push(p.status); }
              sql += " ORDER BY created_at DESC";
              return json(db.query(sql, ...params2));
            }

            case "update_employee": {
              const fields: string[] = [];
              const values: unknown[] = [];
              if (p.salary !== undefined) { fields.push("salary = ?"); values.push(p.salary); }
              if (p.position) { fields.push("position = ?"); values.push(p.position); }
              if (p.status) { fields.push("status = ?"); values.push(p.status); }
              if (p.end_date) { fields.push("end_date = ?"); values.push(p.end_date); }
              if (p.notes) { fields.push("notes = ?"); values.push(p.notes); }
              fields.push("updated_at = ?"); values.push(new Date().toISOString());
              values.push(p.record_id);
              db.execute(`UPDATE opc_hr_records SET ${fields.join(", ")} WHERE id = ?`, ...values);
              return json(db.queryOne("SELECT * FROM opc_hr_records WHERE id = ?", p.record_id) ?? { error: "记录不存在" });
            }

            case "calc_social_insurance":
              return json(calcSocialInsurance(p.salary));

            case "calc_personal_tax": {
              const si = p.social_insurance ?? calcSocialInsurance(p.monthly_salary).personal_total;
              const special = p.special_deduction ?? 0;
              const taxable = Math.max(0, p.monthly_salary - 5000 - si - special);
              const result = calcPersonalTax(taxable);
              return json({
                monthly_salary: p.monthly_salary,
                threshold: 5000,
                social_insurance_deduction: si,
                special_deduction: special,
                taxable_income: taxable,
                monthly_tax: result.tax,
                rate: `${result.rate * 100}%`,
                take_home: Math.round((p.monthly_salary - si - result.tax) * 100) / 100,
              });
            }

            case "payroll_summary": {
              const employees = db.query(
                "SELECT * FROM opc_hr_records WHERE company_id = ? AND status = 'active'",
                p.company_id,
              ) as { salary: number; social_insurance: number; housing_fund: number }[];
              const totalSalary = employees.reduce((s, e) => s + e.salary, 0);
              const totalSI = employees.reduce((s, e) => s + e.social_insurance, 0);
              const totalHF = employees.reduce((s, e) => s + e.housing_fund, 0);
              return json({
                active_count: employees.length,
                total_salary: totalSalary,
                total_social_insurance: totalSI,
                total_housing_fund: totalHF,
                total_cost: totalSalary + totalSI + totalHF,
              });
            }

            case "delete_employee": {
              db.execute("DELETE FROM opc_hr_records WHERE id = ?", p.record_id);
              return json({ ok: true });
            }

            default:
              return json({ error: `未知操作: ${(p as { action: string }).action}` });
          }
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    { name: "opc_hr" },
  );

  api.logger.info("opc: 已注册 opc_hr 工具");
}
