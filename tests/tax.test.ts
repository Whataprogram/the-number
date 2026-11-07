import { describe, expect, it } from "vitest";
import { bracketTax, federalEstimate, selfEmploymentTax, toCents } from "../lib/tax";

describe("self-employment tax", () => {
  it("is zero below the $400 threshold (any age)", () => {
    const r = selfEmploymentTax(toCents("400.00")); // 400 x 92.35% = 369.40 < 400
    expect(r.totalCents).toBe(0);
    expect(r.belowThreshold).toBe(true);
  });
  it("hand-checked: $30,000 profit -> $4,238.87", () => {
    // 30,000 x 0.9235 = 27,705.00; x 12.4% = 3,435.42; x 2.9% = 803.45 (803.445 rounds half up)
    const r = selfEmploymentTax(toCents("30000"));
    expect(r.netEarningsCents).toBe(2_770_500);
    expect(r.socialSecurityCents).toBe(343_542);
    expect(r.medicareCents).toBe(80_345);
    expect(r.totalCents).toBe(423_887);
  });
  it("caps the Social Security part at the 2026 wage base", () => {
    const r = selfEmploymentTax(toCents("300000"));
    expect(r.socialSecurityCents).toBe(Math.round(18_450_000 * 0.124));
  });
  it("never goes negative on a loss", () => {
    expect(selfEmploymentTax(toCents("-5000")).totalCents).toBe(0);
  });
});

describe("income tax brackets (2026 single)", () => {
  it("10% up to $12,400 then 12%", () => {
    // 15,000 taxable = 1,240.00 + 2,600 x 12% = 312.00 -> 1,552.00
    expect(bracketTax(toCents("15000")).totalCents).toBe(155_200);
  });
});

describe("federal estimate", () => {
  it("hand-checked: $30,000 profit", () => {
    const r = federalEstimate(toCents("30000"));
    // half SE = 2,119.44 (211,943.5 rounds to 211,944); AGI = 27,880.56; taxable = 11,780.56; tax = 1,178.06
    expect(r.halfSeDeductionCents).toBe(211_944);
    expect(r.taxableIncomeCents).toBe(1_178_056);
    expect(r.incomeTaxCents).toBe(117_806);
    expect(r.totalTaxCents).toBe(423_887 + 117_806);
  });
  it("no income tax when profit is under the standard deduction", () => {
    expect(federalEstimate(toCents("10000")).incomeTaxCents).toBe(0);
  });
});

describe("money parsing", () => {
  it("parses dollars to integer cents", () => {
    expect(toCents("$1,234.5")).toBe(123_450);
    expect(toCents("-85.10")).toBe(-8_510);
    expect(() => toCents("abc")).toThrow();
  });
});
