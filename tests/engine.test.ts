import { describe, expect, it } from "vitest";
import { calculateWorkspace, createEmptyWorkspace, createSampleWorkspace, POLICY_REVIEWED, RULE_VERSION } from "../lib/engine";
import { federalEstimate, formatUSD, pct, selfEmploymentTax, toCents } from "../lib/tax";
import type { LedgerRow, Workspace } from "../lib/workspace-types";

const resolvedSample = () => {
  const workspace = createSampleWorkspace();
  workspace.rows = workspace.rows.map((row) => row.id === "sample-gift" ? { ...row, reviewed: true, treatment: "personal" as const } : row);
  return workspace;
};
const record = (overrides: Partial<LedgerRow> = {}): LedgerRow => ({
  id: "test-row", date: "2026-03-01", description: "Customer payment", amountCents: 500_000,
  source: "Independent fixture", treatment: "income", reviewed: true, ...overrides,
});
const fixture = (rows: LedgerRow[]): Workspace => ({ ...resolvedSample(), rows });
const codes = (workspace: Workspace) => calculateWorkspace(workspace).blockers.map((blocker) => blocker.code);

describe("review and scope gates", () => {
  it("starts the fixed sample with a genuine unresolved gift and unlocks the same ledger after review", () => {
    const before = calculateWorkspace(createSampleWorkspace());
    expect(before.status).toBe("blocked");
    expect(before.unresolvedCount).toBe(1);
    expect(before.federal).toBeNull();
    expect(before.blockers[0]).toMatchObject({ code: "review", rowId: "sample-gift" });
    const after = calculateWorkspace(resolvedSample());
    expect(after.status).toBe("ready");
    expect(after.incomeCents).toBe(3_250_000);
    expect(after.costsCents).toBe(250_000);
    expect(after.profitCents).toBe(3_000_000);
    expect(after.federal?.totalTaxCents).toBe(518_132);
    expect(after.paymentsCents).toBe(100_000);
    expect(after.remainingCents).toBe(418_132);
    expect(after.excessCents).toBe(0);
    expect(after.ruleVersion).toBe(RULE_VERSION);
  });

  it("does not let personal checkboxes override the missing independent policy review", () => {
    expect(POLICY_REVIEWED).toBe(false);
    const workspace = { ...resolvedSample(), mode: "personal" as const };
    const result = calculateWorkspace(workspace);
    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "policy-review-needed" }));
    expect(result.profitCents).toBe(3_000_000);
    expect(result.federal).toBeNull();
    expect(result.remainingCents).toBeNull();
    expect(result.excessCents).toBeNull();
  });

  it("does not let imported rows inherit the fictional sample exception", () => {
    const workspace = resolvedSample();
    workspace.imports = [{ id: "external-import", name: "my-records.csv", fingerprint: "file-123" }];
    expect(codes(workspace)).toContain("policy-review-needed");
    expect(calculateWorkspace(workspace).federal).toBeNull();
    workspace.imports = [];
    workspace.rows[0].batchId = "import-file-123";
    expect(calculateWorkspace(workspace).federal).toBeNull();
  });

  it.each(["adultUS", "singleSoleProprietor", "noOtherIncome", "notDependent", "cashBasis", "coverageComplete"] as const)("gates missing %s rather than inventing a zero estimate", (field) => {
    const workspace = resolvedSample();
    workspace.profile[field] = false;
    expect(calculateWorkspace(workspace).federal).toBeNull();
  });

  it("blocks unsupported years, excessive profit and empty records", () => {
    const workspace = resolvedSample(); workspace.profile.taxYear = 2027;
    expect(codes(workspace)).toContain("profile");
    expect(codes(fixture([record({ amountCents: 10_000_001 })]))).toContain("income-scope");
    expect(codes(fixture([]))).toContain("empty");
    expect(createEmptyWorkspace().mode).toBe("personal");
  });

  it("does not bless an unsupported cost just because the user marked it reviewed", () => {
    expect(codes(fixture([record({ treatment: "expense", amountCents: -100_000, expenseCategory: "other" })]))).toContain("unsupported-expense");
    expect(codes(fixture([record({ treatment: "unsupported" })]))).toContain("unsupported-treatment");
    expect(codes(fixture([record({ treatment: "expense", amountCents: 100_00, expenseCategory: "supplies" })]))).toContain("invalid-direction");
  });
});

describe("independent financial regressions", () => {
  it("recomputes marginal tax instead of multiplying by the historical average", () => {
    const first = calculateWorkspace(fixture([record({ amountCents: 3_000_000 })]));
    const next = calculateWorkspace(fixture([record({ amountCents: 3_100_000 })]));
    expect(first.federal?.totalTaxCents).toBe(518_132);
    expect(next.federal?.totalTaxCents).toBe(539_695);
    expect(next.federal!.totalTaxCents - first.federal!.totalTaxCents).toBe(21_563);
  });

  it("reconciles a later expense without keeping a fictional fixed earlier tax amount", () => {
    const result = calculateWorkspace(fixture([
      record({ id: "march", amountCents: 3_000_000 }),
      record({ id: "april", date: "2026-04-01", amountCents: -2_000_000, treatment: "expense", expenseCategory: "supplies" }),
    ]));
    expect(result.profitCents).toBe(1_000_000);
    expect(result.federal?.totalTaxCents).toBe(141_296);
    expect(result.remainingCents).toBe(141_296);
  });

  it("never interprets First Watch or any description as a confirmed tax payment", () => {
    const result = calculateWorkspace(fixture([
      record(), record({ id: "breakfast", description: "First Watch breakfast", amountCents: -6000, treatment: "personal" }),
    ]));
    expect(result.paymentsCents).toBe(0);
    expect(result.federal?.totalTaxCents).toBe(70_648);
    expect(result.blockers).toEqual([]);
    expect(result).not.toHaveProperty("quarters");
  });

  it("shows excess recorded payments separately from remaining estimated tax", () => {
    const result = calculateWorkspace(fixture([
      record(), record({ id: "payment", amountCents: -100_000, treatment: "tax_payment", paymentYear: 2026, paymentPurpose: "estimated" }),
    ]));
    expect(result.remainingCents).toBe(0);
    expect(result.excessCents).toBe(29_352);
    expect(result.paymentsCents).toBe(result.federal!.totalTaxCents + result.excessCents!);
  });

  it("uses the designated year and purpose while respecting payment date", () => {
    const workspace = fixture([
      record({ amountCents: 3_000_000 }),
      record({ id: "old-income", date: "2025-12-31", amountCents: 1_000_000 }),
      record({ id: "prior-year", date: "2026-04-15", treatment: "tax_payment", amountCents: -100_000, paymentYear: 2025, paymentPurpose: "balance" }),
      record({ id: "q4", date: "2027-01-15", treatment: "tax_payment", amountCents: -100_000, paymentYear: 2026, paymentPurpose: "estimated" }),
      record({ id: "same-year-balance", treatment: "tax_payment", amountCents: -10_000, paymentYear: 2026, paymentPurpose: "balance" }),
    ]);
    expect(calculateWorkspace(workspace).incomeCents).toBe(3_000_000);
    expect(calculateWorkspace(workspace).paymentsCents).toBe(0);
    workspace.profile.throughDate = "2027-01-15";
    const later = calculateWorkspace(workspace);
    expect(later.paymentsCents).toBe(100_000);
    expect(later.remainingCents).toBe(418_132);
  });

  it("requires complete payment details, including purpose", () => {
    expect(codes(fixture([record({ treatment: "tax_payment", amountCents: -100_000 })]))).toContain("invalid-payment");
  });

  it("treats a loss as a zero restricted estimate, not a negative tax or guaranteed refund", () => {
    const result = calculateWorkspace(fixture([record({ treatment: "expense", expenseCategory: "supplies", amountCents: -10_000 })]));
    expect(result.profitCents).toBe(-10_000);
    expect(result.federal?.totalTaxCents).toBe(0);
    expect(result.excessCents).toBe(0);
  });
});

describe("untrusted numeric and ledger input", () => {
  it.each([NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, "100", null, 0])("rejects invalid cent value %s without throwing", (amountCents) => {
    const result = calculateWorkspace(fixture([record({ amountCents: amountCents as number })]));
    expect(result.status).toBe("blocked");
    expect(result.federal).toBeNull();
    expect(result.blockers.some((item) => item.code === "invalid-amount")).toBe(true);
  });
  it.each(["2026-02-30", "2026-13-01", "11/10/2026", "bad", null])("rejects invalid date %s", (date) => {
    expect(codes(fixture([record({ date: date as string })]))).toContain("invalid-date");
  });
  it("blocks duplicate IDs but preserves genuinely distinct equal-value rows", () => {
    expect(codes(fixture([record(), record()]))).toContain("duplicate-id");
    expect(calculateWorkspace(fixture([record(), record({ id: "different" })])).incomeCents).toBe(1_000_000);
    expect(codes(fixture([record({ sourceId: "bank-1" }), record({ id: "other", sourceId: "bank-1" })]))).toContain("duplicate-source-id");
  });
  it("handles invalid workspace/record shapes as blockers", () => {
    expect(calculateWorkspace(null as unknown as Workspace).status).toBe("blocked");
    expect(codes(fixture([null as unknown as LedgerRow]))).toContain("invalid-row");
    const workspace = resolvedSample(); workspace.profile = null as unknown as Workspace["profile"];
    expect(codes(workspace)).toContain("profile");
  });
  it("is deterministic and does not mutate the supplied ledger", () => {
    const workspace = resolvedSample(), before = JSON.stringify(workspace);
    expect(calculateWorkspace(workspace)).toEqual(calculateWorkspace(workspace));
    expect(JSON.stringify(workspace)).toBe(before);
    expect(createSampleWorkspace()).toEqual(createSampleWorkspace());
  });
});

describe("integer-cent primitives", () => {
  it("rounds basis points exactly even when the intermediate product is beyond safe Number range", () => {
    expect(pct(Number.MAX_SAFE_INTEGER, 5000)).toBe(4_503_599_627_370_496);
    expect(pct(1, 5000)).toBe(1);
    expect(pct(-1, 5000)).toBe(-1);
    expect(() => pct(1.1, 1000)).toThrow();
  });
  it("parses and formats exact cents without floating-point multiplication", () => {
    expect(toCents("$1,234.50")).toBe(123_450);
    expect(toCents("+1.05")).toBe(105);
    expect(toCents("-0.01")).toBe(-1);
    expect(formatUSD(-123_450, { cents: true })).toBe("−$1,234.50");
    expect(formatUSD(150)).toBe("$2");
    for (const bad of ["1e3", "NaN", "1.001", "1,2", "1 000", "90071992547409.92"]) expect(() => toCents(bad)).toThrow();
  });
  it("keeps the SE earnings threshold distinct from the profit amount", () => {
    expect(selfEmploymentTax(40_000).totalCents).toBe(0);
    expect(selfEmploymentTax(43_312).totalCents).toBe(0);
    expect(selfEmploymentTax(43_313).totalCents).toBe(6120);
    expect(federalEstimate(3_000_000).totalTaxCents).toBe(518_132);
  });
});
