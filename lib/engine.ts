import { federalEstimate } from "./tax";
import type { EstimateBlocker, LedgerRow, Workspace, WorkspaceResult } from "./workspace-types";

export const RULE_VERSION = "2026-prototype-2.0.0";
// Release control, not a user preference. See docs/math-review.md before changing this.
export const POLICY_REVIEWED = false;
const MAX_ROW_CENTS = 1_000_000_000_000;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const SUPPORTED_COSTS = new Set(["supplies", "advertising", "fees", "software"]);
const TREATMENTS = new Set(["review", "income", "expense", "personal", "transfer", "tax_payment", "unsupported"]);

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** One calculation source for screens and exports. Never guesses a transaction's meaning. */
export function calculateWorkspace(workspace: Workspace): WorkspaceResult {
  const blockers: EstimateBlocker[] = [];
  const unresolved = new Set<number>();
  const block = (code: string, message: string, rowId?: string, index?: number) => {
    blockers.push({ code, message, ...(rowId ? { rowId } : {}) });
    if (index !== undefined) unresolved.add(index);
  };
  let income = 0n, costs = 0n, payments = 0n, absoluteTotal = 0n;
  const finish = (): WorkspaceResult => {
    const profit = income - costs;
    if (absoluteTotal > MAX_SAFE || [income, costs, payments, profit].some((value) => value > MAX_SAFE || value < -MAX_SAFE)) {
      block("invalid-amount", "The combined amounts exceed the supported range. Split or correct the workspace.");
      income = costs = payments = 0n;
    }
    const safeProfit = income - costs;
    if (safeProfit > 10_000_000n) block("income-scope", "Profit above $100,000 is outside this prototype's reviewed example scope. You can still export the ledger.");
    const ready = blockers.length === 0;
    const federal = ready ? federalEstimate(Number(safeProfit)) : null;
    const due = federal ? BigInt(federal.totalTaxCents) - payments : null;
    return {
      status: ready ? "ready" : "blocked", blockers, unresolvedCount: unresolved.size,
      incomeCents: Number(income), costsCents: Number(costs), profitCents: Number(safeProfit), paymentsCents: Number(payments),
      federal, remainingCents: due === null ? null : Number(due > 0n ? due : 0n),
      excessCents: due === null ? null : Number(due < 0n ? -due : 0n), ruleVersion: RULE_VERSION,
      reviewStatus: POLICY_REVIEWED ? "Policy review recorded; supported scope only." : "Independent tax-policy review pending. Numeric tax output is limited to the fictional sample.",
    };
  };

  if (!workspace || typeof workspace !== "object" || workspace.schemaVersion !== 1 || !Array.isArray(workspace.rows)) {
    block("invalid-workspace", "This workspace is not a supported version. Restore a valid workspace file.");
    return finish();
  }
  if (workspace.mode !== "sample" && workspace.mode !== "personal") block("invalid-workspace", "The workspace mode is not supported.");
  if (workspace.mode === "sample" && (!Array.isArray(workspace.imports) || workspace.imports.length > 0 || workspace.rows.some((row) => row && typeof row === "object" && row.batchId !== undefined))) {
    block("policy-review-needed", "Imported records cannot use the fictional sample calculation. Start a personal workspace to review and export your records.");
  }
  if (workspace.mode !== "sample" && !POLICY_REVIEWED) {
    block("policy-review-needed", "Your ledger is available, but personal tax estimates are disabled until an independent qualified reviewer approves this policy. Export your reviewed records for a preparer.");
  }
  const profile = workspace.profile;
  if (!profile || typeof profile !== "object") {
    block("profile", "Complete the supported tax profile before calculating an estimate.");
    return finish();
  }
  if (profile.taxYear !== 2026) block("profile", "Only the 2026 example tax rules are available.");
  const throughValid = validDate(profile.throughDate);
  if (!throughValid || profile.throughDate < "2026-01-01" || profile.throughDate > "2027-12-31") {
    block("profile", "Choose a valid through-date in 2026 or 2027 for the 2026 records and payments.");
  }
  const checks = [
    ["adultUS", "The supported example is an adult U.S. taxpayer."],
    ["singleSoleProprietor", "The supported example is a single filer operating as a sole proprietor."],
    ["noOtherIncome", "Other income, including wages, is outside this example model."],
    ["notDependent", "Dependent tax situations are outside this example model."],
    ["cashBasis", "The supported example uses cash-basis records of money received and paid."],
  ] as const;
  for (const [key, message] of checks) if (profile[key] !== true) block("profile", message);
  if (profile.coverageComplete !== true) block("coverage", "Confirm coverage of all business activity through the selected date, including cash and other accounts.");
  if (workspace.rows.length === 0) block("empty", "Add or import records before calculating an estimate.");
  if (workspace.rows.length > 5000) block("invalid-workspace", "A workspace can contain at most 5,000 records.");

  const ids = new Set<string>(), sourceIds = new Set<string>();
  workspace.rows.slice(0, 5000).forEach((row: LedgerRow, index) => {
    if (!row || typeof row !== "object") {
      block("invalid-row", `Record ${index + 1} is malformed.`, undefined, index); return;
    }
    const id = typeof row.id === "string" && row.id.trim() ? row.id : undefined;
    if (!id || typeof row.description !== "string" || !row.description.trim() || typeof row.source !== "string" || !row.source.trim()) {
      block("invalid-row", `Record ${index + 1} needs an ID, description and source.`, id, index); return;
    }
    if (ids.has(id)) block("duplicate-id", "Two records share an ID. Resolve the duplicate before calculating.", id, index);
    ids.add(id);
    if (row.sourceId !== undefined) {
      if (typeof row.sourceId !== "string" || !row.sourceId.trim()) block("invalid-row", "The source transaction ID is invalid.", id, index);
      else {
        const key = JSON.stringify([row.source, row.sourceId]);
        if (sourceIds.has(key)) block("duplicate-source-id", "Two records share a source transaction ID. Review the overlap.", id, index);
        sourceIds.add(key);
      }
    }
    if (typeof row.amountCents !== "number" || !Number.isSafeInteger(row.amountCents) || Math.abs(row.amountCents) > MAX_ROW_CENTS || row.amountCents === 0) {
      block("invalid-amount", "Record amounts must be nonzero whole cents within the supported range.", id, index); return;
    }
    absoluteTotal += BigInt(Math.abs(row.amountCents));
    if (!validDate(row.date)) { block("invalid-date", "Use a real calendar date in YYYY-MM-DD format.", id, index); return; }
    if (!TREATMENTS.has(row.treatment)) { block("invalid-row", "Choose a supported record treatment.", id, index); return; }
    if (row.reviewed !== true || row.treatment === "review") {
      block("review", "Confirm the financial treatment of this record.", id, index); return;
    }
    if (row.treatment === "unsupported") {
      block("unsupported-treatment", "This record needs tax-treatment review. It remains available in the ledger export.", id, index); return;
    }
    if (row.treatment === "income" && row.amountCents < 0) {
      block("invalid-direction", "A negative income adjustment or refund needs separate tax-treatment review.", id, index); return;
    }
    if (row.treatment === "expense") {
      if (row.amountCents > 0) { block("invalid-direction", "An expense refund needs separate tax-treatment review.", id, index); return; }
      if (!SUPPORTED_COSTS.has(row.expenseCategory || "")) {
        block("unsupported-expense", "Only the sample's simple supplies, advertising, processing fees and software costs are modeled. Other costs need review.", id, index); return;
      }
    }
    if (row.treatment === "tax_payment") {
      if (row.amountCents >= 0 || !Number.isInteger(row.paymentYear) || (row.paymentYear as number) < 1900 || (row.paymentYear as number) > 2100 || !["estimated", "balance", "other"].includes(row.paymentPurpose || "")) {
        block("invalid-payment", "Record the money-out amount, designated tax year and payment purpose.", id, index); return;
      }
      if (throughValid && row.date <= profile.throughDate && row.paymentYear === profile.taxYear && row.paymentPurpose === "estimated") payments -= BigInt(row.amountCents);
      return;
    }
    // Cash activity belongs to its own tax year; payment attribution above is deliberately separate.
    if (!throughValid || row.date > profile.throughDate || !row.date.startsWith(`${profile.taxYear}-`)) return;
    if (row.treatment === "income") income += BigInt(row.amountCents);
    if (row.treatment === "expense") costs -= BigInt(row.amountCents);
  });
  return finish();
}

export function createEmptyWorkspace(): Workspace {
  return {
    schemaVersion: 1, id: "personal-workspace", mode: "personal", title: "My business records", revision: 0, imports: [], rows: [],
    profile: { taxYear: 2026, throughDate: new Date().toISOString().slice(0, 10), adultUS: false, singleSoleProprietor: false, noOtherIncome: false, notDependent: false, cashBasis: false, coverageComplete: false },
  };
}

export function createSampleWorkspace(): Workspace {
  const row = (id: string, date: string, description: string, amountCents: number, treatment: LedgerRow["treatment"], extra: Partial<LedgerRow> = {}): LedgerRow =>
    ({ id, date, description, amountCents, treatment, source: "Fictional sample", reviewed: true, ...extra });
  return {
    schemaVersion: 1, id: "avery-detailing-2026-v1", mode: "sample", title: "Avery's Detailing", revision: 0, imports: [],
    profile: { taxYear: 2026, throughDate: "2026-11-10", adultUS: true, singleSoleProprietor: true, noOtherIncome: true, notDependent: true, cashBasis: true, coverageComplete: true },
    rows: [
      row("sample-income-1", "2026-03-31", "Winter detailing receipts", 1_500_000, "income"),
      row("sample-income-2", "2026-07-31", "Spring detailing receipts", 1_000_000, "income"),
      row("sample-income-3", "2026-10-31", "Summer detailing receipts", 750_000, "income"),
      row("sample-cost-1", "2026-04-15", "Cleaning supplies used this season", -150_000, "expense", { expenseCategory: "supplies" }),
      row("sample-cost-2", "2026-08-20", "Local advertising this season", -100_000, "expense", { expenseCategory: "advertising" }),
      row("sample-gift", "2026-09-01", "Birthday gift from sister", 10_000, "review", { reviewed: false, note: "Personal gift, not a customer payment. Choose Personal to finish the sample review." }),
      row("sample-transfer", "2026-09-10", "Transfer between Avery's accounts", -50_000, "transfer"),
      row("sample-payment", "2026-09-15", "Recorded federal estimated payment", -100_000, "tax_payment", { paymentYear: 2026, paymentPurpose: "estimated", note: "Fictional payment; not verified with the IRS." }),
    ],
  };
}
