// Every tax parameter The Number uses lives here, with its source.
// Money is in integer cents. Rates are in basis points (1 bp = 0.01%).
// Basic 2026 parameters checked against primary sources during the November 10, 2026 audit.
// This is not an independently reviewed tax policy. Personal estimates remain disabled in engine.ts.

export const TAX_YEAR = 2026;

export const SOURCES = {
  irs2026: "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill",
  ssWageBase: "https://www.ssa.gov/oact/cola/cbb.html",
  seTax: "https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes",
  youngEntrepreneurs: "https://www.irs.gov/ht/newsroom/when-the-lemonade-stand-makes-bank-young-entrepreneurs-and-taxes",
  estimatedTaxes: "https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes",
  soleProprietor: "https://www.irs.gov/businesses/small-businesses-self-employed/sole-proprietorships",
  qbi: "https://www.irs.gov/newsroom/qualified-business-income-deduction",
  smallBusiness: "https://www.irs.gov/publications/p334",
};

export const TAX_2026 = {
  // Self-employment tax: 12.4% Social Security + 2.9% Medicare, on 92.35% of net SE earnings.
  socialSecurityBps: 1240,
  medicareBps: 290,
  seEarningsFactorBps: 9235,
  // Social Security part stops at the wage base ($184,500 for 2026).
  ssWageBaseCents: 18_450_000,
  // You owe SE tax once net SE earnings reach $400, at any age.
  seThresholdCents: 40_000,
  // 2026 standard deduction, single filer: $16,100.
  standardDeductionCents: 1_610_000,
  // Sole proprietors: qualified business income (QBI) deduction, 20%, made permanent by the 2025 law (Section 199A).
  // Simplified example: capped at 20% of taxable income before the deduction.
  // The workspace gate limits profit to $100,000 and excludes other income; independent policy review is still required.
  qbiBps: 2000,
  // 2026 single-filer brackets (upper bound of each bracket, in cents).
  brackets: [
    { upToCents: 1_240_000, rateBps: 1000 },
    { upToCents: 5_040_000, rateBps: 1200 },
    { upToCents: 10_570_000, rateBps: 2200 },
    { upToCents: 20_177_500, rateBps: 2400 },
    { upToCents: 25_622_500, rateBps: 3200 },
    { upToCents: 64_060_000, rateBps: 3500 },
    { upToCents: Number.MAX_SAFE_INTEGER, rateBps: 3700 },
  ],
  // Estimated tax due dates for tax year 2026.
  quarterlyDueDates: [
    { quarter: "Q1", due: "2026-04-15", covers: "Jan 1 – Mar 31" },
    { quarter: "Q2", due: "2026-06-15", covers: "Apr 1 – May 31" },
    { quarter: "Q3", due: "2026-09-15", covers: "Jun 1 – Aug 31" },
    { quarter: "Q4", due: "2027-01-15", covers: "Sep 1 – Dec 31" },
  ],
} as const;

export const ASSUMPTIONS = [
  "Fictional example: adult U.S. taxpayer, single sole proprietor, cash basis, not a dependent, no other income and profit no greater than $100,000.",
  "Federal tax on recorded profit only. This is not an annual forecast, an IRS bill, a payment instruction or a safe-to-spend amount.",
  "Uses the 2026 standard deduction and a simplified 20% QBI deduction. Minimum-QBI rules, credits and other deductions still require independent review.",
  "Simple sample operating costs only. Equipment, inventory, vehicle costs, mixed use, meals, prepaid costs and refunds need separate tax-treatment review.",
  "State/local taxes, required installments, penalties, filing and payment execution are outside this model. Personal numeric tax estimates remain disabled pending qualified policy review.",
];
