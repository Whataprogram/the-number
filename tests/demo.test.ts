import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify } from "../lib/classify";
import { normalize } from "../lib/csv";
import { DEMO_PROFILE } from "../lib/demo";
import { computeNumber } from "../lib/number";
import { federalEstimate } from "../lib/tax";

const load = () =>
  ["chase", "cashapp", "venmo"].flatMap((f) => normalize(readFileSync(`public/demo/${f}.csv`, "utf8"), `${f}.csv`)).map(classify);

describe("demo dataset", () => {
  const txns = load();
  const r = computeNumber(txns, DEMO_PROFILE);

  it("reconciles: the Number equals the sum of its lines", () => {
    expect(r.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(r.theNumberCents);
    expect(r.theNumberCents).toBe(r.owedSoFarCents + r.cushionCents + r.billsCents);
  });
  it("reconciles: income and expenses sum from the tagged transactions", () => {
    const inc = txns.filter((t) => t.date <= r.asOf && (t.kind === "business_income" || (t.kind === "review" && t.amountCents > 0))).reduce((s, t) => s + t.amountCents, 0);
    expect(inc).toBe(r.incomeCents);
    expect(r.fed.totalTaxCents).toBe(federalEstimate(r.netProfitCents).totalTaxCents);
  });
  it("transfers between your own accounts are not income", () => {
    expect(txns.filter((t) => /cash out/i.test(t.description)).every((t) => t.kind === "transfer")).toBe(true);
  });
  it("demo story holds: $0 income tax but real self-employment tax, and below the Number", () => {
    console.log(JSON.stringify({ income: r.incomeCents, expenses: r.expensesCents, net: r.netProfitCents, se: r.fed.se.totalCents, incomeTax: r.fed.incomeTaxCents, owed: r.owedSoFarCents, cushion: r.cushionCents, bills: r.billsCents, number: r.theNumberCents, balance: r.balanceCents, safe: r.safeToSpendCents, review: r.reviewCount }));
    expect(r.fed.incomeTaxCents).toBe(0);
    expect(r.fed.se.totalCents).toBeGreaterThan(0);
    expect(r.incomeCents).toBeGreaterThan(1_000_000); // $10K–$20K range
    expect(r.incomeCents).toBeLessThan(2_000_000);
    expect(r.safeToSpendCents).toBeLessThan(0);
  });
});

describe("bad input", () => {
  it("explains an unreadable file", () => {
    expect(() => normalize("foo,bar\n1,2", "weird.csv")).toThrow(/couldn't read/);
  });
  it("explains an empty file", () => {
    expect(() => normalize("Posting Date,Description,Amount\n", "empty.csv")).toThrow(/no transactions/);
  });
});
