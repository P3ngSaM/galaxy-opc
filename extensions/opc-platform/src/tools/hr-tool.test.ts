/**
 * 星环OPC中心 — hr-tool 核心计算函数单元测试
 */

import { describe, it, expect } from "vitest";

// 复制 hr-tool.ts 中的纯计算函数进行测试

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

describe("hr-tool calculations", () => {
  describe("calcSocialInsurance — 社保公积金计算", () => {
    it("should calculate social insurance for normal salary", () => {
      const result = calcSocialInsurance(10000);
      expect(result.base).toBe(10000);

      // 公司部分
      expect(result.company.pension).toBe(1600);       // 10000 × 16%
      expect(result.company.medical).toBe(950);         // 10000 × 9.5%
      expect(result.company.unemployment).toBe(50);     // 10000 × 0.5%
      expect(result.company.injury).toBe(40);           // 10000 × 0.4%
      expect(result.company.housing_fund).toBe(1200);   // 10000 × 12%

      // 个人部分
      expect(result.personal.pension).toBe(800);         // 10000 × 8%
      expect(result.personal.medical).toBe(200);         // 10000 × 2%
      expect(result.personal.unemployment).toBe(50);     // 10000 × 0.5%
      expect(result.personal.housing_fund).toBe(1200);   // 10000 × 12%
    });

    it("should apply lower bound for low salary", () => {
      const result = calcSocialInsurance(3000);
      expect(result.base).toBe(6377); // 下限
      expect(result.personal.pension).toBe(Math.round(6377 * 0.08 * 100) / 100);
    });

    it("should apply upper bound for high salary", () => {
      const result = calcSocialInsurance(50000);
      expect(result.base).toBe(31884); // 上限
      expect(result.company.pension).toBe(Math.round(31884 * 0.16 * 100) / 100);
    });

    it("should compute correct totals", () => {
      const result = calcSocialInsurance(10000);
      const expectedCompanyTotal = 1600 + 950 + 50 + 40 + 1200;
      const expectedPersonalTotal = 800 + 200 + 50 + 1200;
      expect(result.company_total).toBeCloseTo(expectedCompanyTotal, 2);
      expect(result.personal_total).toBeCloseTo(expectedPersonalTotal, 2);
    });

    it("should handle salary at lower boundary", () => {
      const result = calcSocialInsurance(6377);
      expect(result.base).toBe(6377);
    });

    it("should handle salary at upper boundary", () => {
      const result = calcSocialInsurance(31884);
      expect(result.base).toBe(31884);
    });
  });

  describe("calcPersonalTax — 个税计算", () => {
    it("should calculate tax at 3% bracket", () => {
      // 月应纳税所得额 2000，年 24000，3% 税率
      const result = calcPersonalTax(2000);
      expect(result.rate).toBe(0.03);
      expect(result.deduction).toBe(0);
      expect(result.tax).toBe(60); // 2000 × 3%
    });

    it("should calculate tax at 10% bracket", () => {
      // 月应纳税所得额 5000，年 60000，10% 税率
      const result = calcPersonalTax(5000);
      expect(result.rate).toBe(0.10);
      expect(result.deduction).toBe(2520);
      // (60000 × 0.10 - 2520) / 12 = (6000 - 2520) / 12 = 290
      expect(result.tax).toBe(290);
    });

    it("should calculate tax at 20% bracket", () => {
      // 月应纳税所得额 15000，年 180000
      const result = calcPersonalTax(15000);
      expect(result.rate).toBe(0.20);
      // (180000 × 0.20 - 16920) / 12 = (36000 - 16920) / 12 = 1590
      expect(result.tax).toBe(1590);
    });

    it("should return 0 for zero taxable income", () => {
      const result = calcPersonalTax(0);
      expect(result.tax).toBe(0);
      expect(result.rate).toBe(0.03);
    });

    it("should handle boundary at 3000/month (36000/year)", () => {
      const result = calcPersonalTax(3000);
      // annual = 36000, falls in first bracket (limit: 36000)
      expect(result.rate).toBe(0.03);
      expect(result.tax).toBe(90); // 3000 × 3%
    });

    it("should handle high income at 45% bracket", () => {
      // 月应纳税所得额 100000，年 1200000
      const result = calcPersonalTax(100000);
      expect(result.rate).toBe(0.45);
      // (1200000 × 0.45 - 181920) / 12 = (540000 - 181920) / 12 = 29840
      expect(result.tax).toBe(29840);
    });
  });
});
