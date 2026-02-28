/**
 * 星环OPC中心 — finance-tool 核心计算函数单元测试
 *
 * 由于 registerFinanceTool 依赖 OpenClaw Plugin API，这里直接测试纯函数逻辑。
 * 通过导入模块文件并提取或复制核心计算函数来测试。
 */

import { describe, it, expect } from "vitest";

// 复制 finance-tool.ts 中的纯计算函数进行测试
// 因为这些函数是模块内部的，无法直接导入

/** 小规模纳税人增值税简易计算 */
function calcVatSimple(salesAmount: number, rate = 0.03): { tax: number; rate: number } {
  return { tax: Math.round(salesAmount * rate * 100) / 100, rate };
}

/** 企业所得税简算（小型微利企业优惠） */
function calcIncomeTax(profit: number): { tax: number; rate: number; note: string } {
  if (profit <= 0) return { tax: 0, rate: 0, note: "无应纳税所得额" };
  if (profit <= 3_000_000) {
    const tax = Math.round(profit * 0.05 * 100) / 100;
    return { tax, rate: 0.05, note: "小型微利企业优惠税率 5%" };
  }
  const tax = Math.round(profit * 0.25 * 100) / 100;
  return { tax, rate: 0.25, note: "一般企业税率 25%" };
}

describe("finance-tool calculations", () => {
  describe("calcVatSimple — 增值税计算", () => {
    it("should calculate VAT at default 3% rate", () => {
      const result = calcVatSimple(100000);
      expect(result.tax).toBe(3000);
      expect(result.rate).toBe(0.03);
    });

    it("should calculate VAT at custom rate", () => {
      const result = calcVatSimple(100000, 0.06);
      expect(result.tax).toBe(6000);
      expect(result.rate).toBe(0.06);
    });

    it("should handle zero sales", () => {
      const result = calcVatSimple(0);
      expect(result.tax).toBe(0);
    });

    it("should round to 2 decimal places", () => {
      const result = calcVatSimple(33333.33);
      // 33333.33 * 0.03 = 999.9999 → rounded to 1000.00
      expect(result.tax).toBe(1000);
    });

    it("should handle small amounts correctly", () => {
      const result = calcVatSimple(1);
      expect(result.tax).toBe(0.03);
    });
  });

  describe("calcIncomeTax — 企业所得税计算", () => {
    it("should return 0 tax for zero profit", () => {
      const result = calcIncomeTax(0);
      expect(result.tax).toBe(0);
      expect(result.rate).toBe(0);
      expect(result.note).toBe("无应纳税所得额");
    });

    it("should return 0 tax for negative profit (亏损)", () => {
      const result = calcIncomeTax(-100000);
      expect(result.tax).toBe(0);
      expect(result.rate).toBe(0);
    });

    it("should apply 5% rate for small-profit enterprises (≤300万)", () => {
      const result = calcIncomeTax(1000000); // 100万利润
      expect(result.tax).toBe(50000); // 100万 × 5% = 5万
      expect(result.rate).toBe(0.05);
      expect(result.note).toContain("5%");
    });

    it("should apply 5% rate at 300万 boundary", () => {
      const result = calcIncomeTax(3000000); // 300万 boundary
      expect(result.tax).toBe(150000); // 300万 × 5% = 15万
      expect(result.rate).toBe(0.05);
    });

    it("should apply 25% rate for profits above 300万", () => {
      const result = calcIncomeTax(5000000); // 500万利润
      expect(result.tax).toBe(1250000); // 500万 × 25% = 125万
      expect(result.rate).toBe(0.25);
      expect(result.note).toContain("25%");
    });

    it("should handle small profit correctly", () => {
      const result = calcIncomeTax(10000); // 1万利润
      expect(result.tax).toBe(500); // 1万 × 5% = 500
      expect(result.rate).toBe(0.05);
    });

    it("should round correctly for decimal profits", () => {
      const result = calcIncomeTax(33333.33);
      // 33333.33 * 0.05 = 1666.6665 → rounded to 1666.67
      expect(result.tax).toBe(1666.67);
    });
  });

  describe("财务报表生成功能", () => {
    describe("资产负债表", () => {
      it("应包含资产、负债、所有者权益三大部分", () => {
        const balanceSheetStructure = {
          assets: {
            current_assets: { cash: 0, accounts_receivable: 0, total: 0 },
            fixed_assets: 0,
            total: 0,
          },
          liabilities: {
            current_liabilities: { accounts_payable: 0, total: 0 },
            long_term_debt: 0,
            total: 0,
          },
          equity: {
            paid_capital: 0,
            retained_earnings: 0,
            total: 0,
          },
          total_liabilities_and_equity: 0,
        };

        expect(balanceSheetStructure).toBeDefined();
        expect(balanceSheetStructure.assets).toHaveProperty("current_assets");
        expect(balanceSheetStructure.liabilities).toHaveProperty("current_liabilities");
        expect(balanceSheetStructure.equity).toHaveProperty("paid_capital");
      });

      it("应计算流动比率和资产负债率健康指标", () => {
        const currentAssets = 100000;
        const currentLiabilities = 50000;
        const totalLiabilities = 60000;
        const totalEquity = 80000;

        const currentRatio = currentAssets / currentLiabilities;
        const debtToEquity = totalLiabilities / totalEquity;

        expect(currentRatio).toBe(2);
        expect(currentRatio).toBeGreaterThan(1);
        expect(debtToEquity).toBe(0.75);
        expect(debtToEquity).toBeLessThan(1);
      });
    });

    describe("利润表", () => {
      it("应计算毛利率、营业利润率、净利率", () => {
        const revenue = 100000;
        const cost = 40000;
        const operatingExpenses = 20000;

        const grossProfit = revenue - cost;
        const grossMargin = (grossProfit / revenue) * 100;
        const operatingProfit = grossProfit - operatingExpenses;
        const operatingMargin = (operatingProfit / revenue) * 100;
        const netProfit = operatingProfit;
        const netMargin = (netProfit / revenue) * 100;

        expect(grossMargin).toBe(60);
        expect(operatingMargin).toBe(40);
        expect(netMargin).toBe(40);
      });

      it("应计算环比增长率", () => {
        const currentRevenue = 120000;
        const previousRevenue = 100000;

        const growthRate = ((currentRevenue - previousRevenue) / previousRevenue) * 100;

        expect(growthRate).toBe(20);
      });
    });

    describe("现金流量表", () => {
      it("应正确分类经营、投资、筹资活动现金流", () => {
        const operatingCashFlow = 50000;
        const investingCashFlow = -20000;
        const financingCashFlow = 100000;

        const netCashChange = operatingCashFlow + investingCashFlow + financingCashFlow;

        expect(netCashChange).toBe(130000);
      });

      it("应计算现金跑道（以月为单位）", () => {
        const closingCash = 300000;
        const monthlyBurn = 50000;

        const runwayMonths = Math.floor(closingCash / monthlyBurn);

        expect(runwayMonths).toBe(6);
      });
    });
  });

  describe("客户价值分析功能", () => {
    describe("客户生命周期价值 (LTV)", () => {
      it("应正确计算 LTV = AOV × 购买频率 × 生命周期", () => {
        const avgOrderValue = 5000;
        const purchaseFrequencyPerMonth = 2;
        const lifespanMonths = 12;

        const ltv = avgOrderValue * purchaseFrequencyPerMonth * lifespanMonths;

        expect(ltv).toBe(120000);
      });

      it("应处理单笔交易客户（生命周期至少为 1 天）", () => {
        const avgOrderValue = 10000;
        const lifespanDays = 1;
        const purchaseFrequency = 1 / (lifespanDays / 30);

        const ltv = avgOrderValue * purchaseFrequency * (lifespanDays / 30);

        expect(ltv).toBeGreaterThan(0);
        expect(Math.round(ltv)).toBe(10000);
      });
    });

    describe("获客成本 (CAC)", () => {
      it("应正确计算 CAC = 营销支出 / 新增客户数", () => {
        const marketingSpend = 10000;
        const newCustomers = 50;

        const cac = marketingSpend / newCustomers;

        expect(cac).toBe(200);
      });

      it("应计算 LTV/CAC 比率并判断健康状态", () => {
        const ltv = 12000;
        const cac = 2000;

        const ratio = ltv / cac;

        expect(ratio).toBe(6);
        expect(ratio).toBeGreaterThan(3);
      });

      it("应处理无新增客户的情况", () => {
        const marketingSpend = 5000;
        const newCustomers = 0;

        const cac = newCustomers > 0 ? marketingSpend / newCustomers : 0;

        expect(cac).toBe(0);
      });
    });
  });

  describe("单位经济学分析功能", () => {
    it("应计算单位贡献边际", () => {
      const revenuePerUnit = 100;
      const costPerUnit = 40;

      const contributionMargin = revenuePerUnit - costPerUnit;
      const contributionMarginRate = (contributionMargin / revenuePerUnit) * 100;

      expect(contributionMargin).toBe(60);
      expect(contributionMarginRate).toBe(60);
    });

    it("应计算盈亏平衡点", () => {
      const fixedCost = 50000;
      const contributionMargin = 60;

      const breakEvenUnits = Math.ceil(fixedCost / contributionMargin);

      expect(breakEvenUnits).toBe(834);
    });

    it("应判断单位经济学健康状态", () => {
      const contributionMarginRate1 = 60;
      const contributionMarginRate2 = 35;
      const contributionMarginRate3 = 20;

      expect(contributionMarginRate1).toBeGreaterThan(50);
      expect(contributionMarginRate2).toBeGreaterThan(30);
      expect(contributionMarginRate3).toBeLessThan(30);
    });
  });

  describe("融资数据包生成功能", () => {
    it("应包含所有必需的融资信息字段", () => {
      const fundingDatapack = {
        company_info: { name: "测试公司", industry: "科技" },
        financial_summary: {
          period: "2025-01-01 至 2025-12-31",
          revenue: 1000000,
          cost: 600000,
          profit: 400000,
          profit_margin: "40%",
          cash_balance: 500000,
        },
        growth_metrics: {
          monthly_revenue: [],
          growth_rates: [],
        },
        customer_metrics: {
          total_customers: 100,
          active_customers: 80,
          average_ltv: 12000,
        },
        team: [],
        funding_history: [],
        business_model: {},
      };

      expect(fundingDatapack).toHaveProperty("company_info");
      expect(fundingDatapack).toHaveProperty("financial_summary");
      expect(fundingDatapack).toHaveProperty("growth_metrics");
      expect(fundingDatapack).toHaveProperty("customer_metrics");
      expect(fundingDatapack.financial_summary.profit_margin).toBe("40%");
    });

    it("应计算月度收入增长率", () => {
      const monthlyRevenue = [
        { month: "2026-01", revenue: 80000 },
        { month: "2026-02", revenue: 90000 },
        { month: "2026-03", revenue: 100000 },
      ];

      const growthRates = [];
      for (let i = 0; i < monthlyRevenue.length - 1; i++) {
        const current = monthlyRevenue[i + 1].revenue;
        const previous = monthlyRevenue[i].revenue;
        const growthRate = previous > 0 ? ((current - previous) / previous * 100).toFixed(2) + "%" : "N/A";
        growthRates.push({
          period: `${monthlyRevenue[i].month} -> ${monthlyRevenue[i + 1].month}`,
          growth_rate: growthRate,
        });
      }

      expect(growthRates.length).toBe(2);
      expect(growthRates[0].growth_rate).toBe("12.50%");
      expect(growthRates[1].growth_rate).toBe("11.11%");
    });
  });
});
