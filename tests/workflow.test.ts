import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateWorkspace, createEmptyWorkspace } from "../lib/engine";
import { exportLedgerCSV, findDuplicates, parseCSV, restoreWorkspace, serializeWorkspace } from "../lib/workspace-io";
import type { LedgerRow, Workspace } from "../lib/workspace-types";

const provider = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: provider.createClient }));
import { createWorkspace, getWorkspace, updateWorkspace } from "../lib/cloud-server";

const completeProfile: Workspace["profile"] = {
  taxYear: 2026, throughDate: "2026-11-10", adultUS: true,
  singleSoleProprietor: true, noOtherIncome: true, notDependent: true,
  cashBasis: true, coverageComplete: true,
};
const activity = [
  "date,description,amount,account,transaction_id",
  '2026-10-01,"Wash, front and back",120.10,Checking,job-1',
  "2026-10-02,Cash customer,79.90,Cash,cash-1",
  "2026-10-03,Cleaning supplies,-30.25,Checking,cost-1",
  "2026-10-04,Birthday gift,100.00,Checking,gift-1",
  "2026-10-05,Own-account transfer,-200.00,Checking,move-1",
  "2026-10-06,Recorded federal payment,-15.00,Checking,tax-1",
].join("\n");

function importedWorkspace(csv = activity): Workspace {
  const parsed = parseCSV(csv, "owner-records.csv");
  expect(parsed.errors).toEqual([]);
  return {
    ...createEmptyWorkspace(), id: "independent-lifecycle-fixture", title: "Fictional test records",
    profile: { ...completeProfile }, rows: parsed.rows,
    imports: [{ id: `import-${parsed.fingerprint}`, name: "owner-records.csv", fingerprint: parsed.fingerprint }],
  };
}

function reviewActivity(): Workspace {
  const workspace = importedWorkspace();
  workspace.rows = workspace.rows.map(row => {
    const reviewed = { ...row, reviewed: true };
    switch (row.sourceId) {
      case "job-1": case "cash-1": return { ...reviewed, treatment: "income" };
      case "cost-1": return { ...reviewed, treatment: "expense", expenseCategory: "supplies" };
      case "gift-1": return { ...reviewed, treatment: "personal", note: "A birthday gift, not a customer payment." };
      case "move-1": return { ...reviewed, treatment: "transfer" };
      case "tax-1": return { ...reviewed, treatment: "tax_payment", paymentYear: 2026, paymentPurpose: "estimated" };
      default: throw new Error("Unexpected fixture row");
    }
  });
  workspace.revision = 6;
  return workspace;
}

function fictionalRow(id: string, cents: number, changes: Partial<LedgerRow> = {}): LedgerRow {
  return { id, date: "2026-06-01", description: `Fictional ${id}`, amountCents: cents,
    source: "Independent fictional fixture", treatment: cents > 0 ? "income" : "expense", reviewed: true,
    ...(cents < 0 ? { expenseCategory: "supplies" as const } : {}), ...changes };
}
function fictionalWorkspace(rows: LedgerRow[], throughDate = "2026-11-10"): Workspace {
  return { ...createEmptyWorkspace(), mode: "sample", title: "Independent fictional scenario", profile: { ...completeProfile, throughDate }, rows };
}

describe("import, human decisions and portable records", () => {
  it("moves uncertain real-format records through review without inventing personal tax output", () => {
    const before = importedWorkspace();
    expect(calculateWorkspace(before)).toMatchObject({ unresolvedCount: 6, incomeCents: 0, costsCents: 0, federal: null });
    const reviewed = reviewActivity();
    expect(calculateWorkspace(reviewed)).toMatchObject({
      incomeCents: 20_000, costsCents: 3_025, profitCents: 16_975,
      paymentsCents: 1_500, unresolvedCount: 0, status: "blocked", federal: null, remainingCents: null,
    });
    const restored = restoreWorkspace(serializeWorkspace(reviewed));
    expect(restored).toEqual(reviewed);
    const ledger = exportLedgerCSV(restored);
    expect(ledger).toContain('"Wash, front and back",120.10,"Checking","job-1","income","true"');
    expect(ledger).toContain('"Cleaning supplies",-30.25,"Checking","cost-1","expense","true","supplies"');
    expect(ledger).toContain('"Recorded federal payment",-15.00,"Checking","tax-1","tax_payment","true","",2026,"estimated"');
    expect(ledger).toContain("independent qualified reviewer");
    expect(ledger).not.toContain("totalTaxCents");
  });

  it("propagates a gift correction through the totals, backup and ledger without changing source facts", () => {
    const reviewed = reviewActivity();
    const incorrect = { ...reviewed, rows: reviewed.rows.map(row => row.sourceId === "gift-1" ? { ...row, treatment: "income" as const } : row) };
    expect(calculateWorkspace(incorrect).profitCents).toBe(26_975);
    const corrected = restoreWorkspace(serializeWorkspace(reviewed));
    expect(calculateWorkspace(corrected).profitCents).toBe(16_975);
    const gift = corrected.rows.find(row => row.sourceId === "gift-1")!;
    expect(gift).toMatchObject({ amountCents: 10_000, date: "2026-10-04", source: "Checking", sourceId: "gift-1", treatment: "personal" });
    expect(exportLedgerCSV(corrected)).toContain('"Birthday gift",100.00,"Checking","gift-1","personal"');
  });

  it("rejects a late invalid row without yielding any partial import or modifying prior work", () => {
    const previous = reviewActivity();
    const savedBefore = serializeWorkspace(previous);
    const rejected = parseCSV(`${activity}\n2026-02-30,Bad late row,20,Checking,bad-1`);
    expect(rejected.rows).toEqual([]);
    expect(rejected.errors).toContainEqual(expect.objectContaining({ row: 8 }));
    expect(serializeWorkspace(previous)).toBe(savedBefore);
  });

  it("retains two legitimate same-amount transactions after an explicit keep decision", () => {
    const parsed = parseCSV("date,description,amount,account,transaction_id\n2026-10-01,Job one,75,Checking,a\n2026-10-01,Job two,75,Checking,b");
    expect(parsed.errors).toEqual([]);
    const candidates = findDuplicates([], parsed.rows);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].reason).toContain("may be separate");
    const workspace = importedWorkspace();
    workspace.rows = parsed.rows.map(row => ({ ...row, reviewed: true, treatment: "income" }));
    expect(calculateWorkspace(workspace).incomeCents).toBe(15_000);
    expect(restoreWorkspace(serializeWorkspace(workspace)).rows.map(row => row.sourceId)).toEqual(["a", "b"]);
  });

  it("distinguishes an exact source duplicate from two accounts using the same external id", () => {
    const first = parseCSV("date,description,amount,account,transaction_id\n2026-10-01,Job,75,Checking,bank-1").rows;
    const exact = parseCSV("date,description,amount,account,transaction_id\n2026-10-01,Changed label,75,Checking,bank-1").rows;
    const anotherAccount = parseCSV("date,description,amount,account,transaction_id\n2026-10-02,Other job,80,Savings,bank-1").rows;
    expect(findDuplicates(first, exact)[0].reason).toContain("Same account and transaction ID");
    expect(findDuplicates(first, anotherAccount)).toEqual([]);
    const workspace = reviewActivity();
    workspace.rows = [...first, ...anotherAccount].map(row => ({ ...row, treatment: "income", reviewed: true }));
    expect(restoreWorkspace(serializeWorkspace(workspace)).rows).toHaveLength(2);
    expect(calculateWorkspace(workspace).incomeCents).toBe(15_500);
  });

  it("keeps unsupported refunds exportable without misrepresenting them as reviewed profit", () => {
    const workspace = importedWorkspace("date,description,amount\n2026-10-01,Refund to customer,-25.40");
    workspace.rows = workspace.rows.map(row => ({ ...row, treatment: "unsupported", reviewed: false, note: "Ask the preparer about this refund." }));
    const restored = restoreWorkspace(serializeWorkspace(workspace));
    expect(calculateWorkspace(restored)).toMatchObject({ unresolvedCount: 1, profitCents: 0, federal: null });
    expect(restored.rows[0].amountCents).toBe(-2540);
    expect(exportLedgerCSV(restored)).toContain('"Refund to customer",-25.40');
    expect(exportLedgerCSV(restored)).toContain("Ask the preparer about this refund.");
  });

  it("rejects a contradictory signed classification at the backup boundary", () => {
    const workspace = reviewActivity();
    workspace.rows[2] = { ...workspace.rows[2], treatment: "income" };
    expect(() => serializeWorkspace(workspace)).toThrow(/direction inconsistent/);
    expect(calculateWorkspace(workspace).blockers).toContainEqual(expect.objectContaining({ code: "invalid-direction", rowId: workspace.rows[2].id }));
  });

  it("retains Unicode, multiline descriptions and notes while making the CSV safe to open", () => {
    const workspace = importedWorkspace('date,description,amount\n2026-10-01,"=SUM(1,2)\nCafé 🚲",1.01');
    workspace.rows[0] = { ...workspace.rows[0], treatment: "personal", reviewed: true, note: "\t@SUM(A1:A2)" };
    const restored = restoreWorkspace(serializeWorkspace(workspace));
    expect(restored.rows[0]).toEqual(workspace.rows[0]);
    const exported = exportLedgerCSV(restored);
    expect(exported).toContain('"\'=SUM(1,2)\nCafé 🚲"');
    expect(exported).toContain('"\'\t@SUM(A1:A2)"');
    expect(exported).toContain(",1.01,");
  });

  it("rejects a ledger export as a backup import instead of silently dropping review fields", () => {
    const ledger = exportLedgerCSV(reviewActivity());
    const preview = parseCSV(ledger);
    expect(preview.rows).toEqual([]);
    expect(preview.errors.length).toBeGreaterThan(0);
  });

  it("preserves an overlapping source record for explicit removal, then clears that blocker", () => {
    const workspace = reviewActivity();
    workspace.rows.push({ ...workspace.rows[0], id: "separate-internal-id-for-the-same-event" });
    const restored = restoreWorkspace(serializeWorkspace(workspace));
    expect(restored.rows).toHaveLength(7);
    expect(calculateWorkspace(restored).blockers).toContainEqual(expect.objectContaining({ code: "duplicate-source-id" }));
    const resolved = { ...restored, revision: restored.revision + 1, rows: restored.rows.filter(row => row.id !== "separate-internal-id-for-the-same-event"), profile: { ...restored.profile, coverageComplete: false } };
    expect(calculateWorkspace(resolved).blockers.map(blocker => blocker.code)).not.toContain("duplicate-source-id");
    expect(calculateWorkspace(resolved).profitCents).toBe(16_975);
    expect(restoreWorkspace(serializeWorkspace(resolved)).rows).toHaveLength(6);
  });
});

describe("independent fictional calculation scenarios", () => {
  it("reconciles a separately derived $20,000 profit example, then disables tax on backup restore", () => {
    const workspace = fictionalWorkspace([
      fictionalRow("receipts", 2_200_000), fictionalRow("supplies", -200_000),
      fictionalRow("gift", 50_000, { treatment: "personal" }),
      fictionalRow("payment", -100_000, { treatment: "tax_payment", paymentYear: 2026, paymentPurpose: "estimated" }),
    ]);
    // Independent worksheet: SE base $18,470; SS $2,290.28 + Medicare $535.63;
    // half-SE $1,412.96; AGI $18,587.04; pre-QBI $2,487.04;
    // QBI $497.41; taxable $1,989.63; income tax $198.96.
    const result = calculateWorkspace(workspace);
    expect(result.status).toBe("ready");
    expect(result.federal).toMatchObject({
      netProfitCents: 2_000_000, se: { totalCents: 282_591 }, halfSeDeductionCents: 141_296,
      agiCents: 1_858_704, qbiDeductionCents: 49_741, taxableIncomeCents: 198_963,
      incomeTaxCents: 19_896, totalTaxCents: 302_487,
    });
    expect(result.remainingCents).toBe(202_487);
    const restored = restoreWorkspace(serializeWorkspace(workspace));
    expect(restored.rows).toEqual(workspace.rows);
    expect(calculateWorkspace(restored)).toMatchObject({ profitCents: 2_000_000, paymentsCents: 100_000, federal: null });
  });

  it("separates calendar-year business activity from designated-year payments and payment purposes", () => {
    const workspace = fictionalWorkspace([
      fictionalRow("receipts", 2_200_000), fictionalRow("supplies", -200_000),
      fictionalRow("prior-job", 900_000, { date: "2025-12-31" }),
      fictionalRow("next-job", 800_000, { date: "2027-01-10" }),
      fictionalRow("january-2026-payment", -100_000, { date: "2027-01-15", treatment: "tax_payment", paymentYear: 2026, paymentPurpose: "estimated" }),
      fictionalRow("late-payment", -50_000, { date: "2027-01-16", treatment: "tax_payment", paymentYear: 2026, paymentPurpose: "estimated" }),
      fictionalRow("prior-balance", -30_000, { treatment: "tax_payment", paymentYear: 2025, paymentPurpose: "balance" }),
      fictionalRow("uncertain-payment", -20_000, { treatment: "tax_payment", paymentYear: 2026, paymentPurpose: "other" }),
    ], "2027-01-15");
    expect(calculateWorkspace(workspace)).toMatchObject({ profitCents: 2_000_000, paymentsCents: 100_000, remainingCents: 202_487 });
    const restored = restoreWorkspace(serializeWorkspace(workspace));
    expect(restored.rows).toHaveLength(8);
    expect(calculateWorkspace(restored)).toMatchObject({ profitCents: 2_000_000, paymentsCents: 100_000 });
    expect(exportLedgerCSV(restored)).toContain('"Fictional prior-balance",-300.00');
  });

  it("keeps a loss and excess recorded payment distinct from negative tax", () => {
    const workspace = fictionalWorkspace([
      fictionalRow("receipts", 10_000), fictionalRow("supplies", -20_000),
      fictionalRow("payment", -5_000, { treatment: "tax_payment", paymentYear: 2026, paymentPurpose: "estimated" }),
    ]);
    expect(calculateWorkspace(workspace)).toMatchObject({ profitCents: -10_000, federal: { totalTaxCents: 0 }, remainingCents: 0, excessCents: 5_000 });
    expect(restoreWorkspace(serializeWorkspace(workspace)).rows).toEqual(workspace.rows);
  });
});

describe("record lifecycle through the cloud API normalization boundary", () => {
  const id = "8c053a14-f0fa-44ef-a08f-400f2bc1fc44";
  const userId = "4bc90140-6984-4866-b45f-ea38c3087e6b";
  let stored: { id: string; data: Workspace; version: number; updated_at: string } | null;
  const request = (method: string, body?: unknown) => new Request("https://workflow.example/api/workspaces", {
    method, headers: { Authorization: "Bearer verified-fictional-session", Origin: "https://workflow.example", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  beforeEach(() => {
    stored = null;
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fictional.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fixture");
    vi.stubEnv("APP_URL", "https://workflow.example");
    provider.getUser.mockResolvedValue({ data: { user: { id: userId, email: "fictional@example.com", email_confirmed_at: "2026-11-10", is_anonymous: false } }, error: null });
    provider.rpc.mockImplementation(async (_name: string, input: { p_data: Workspace; p_expected_version: number | null }) => {
      if (stored && input.p_expected_version !== stored.version) return { data: null, error: { code: "40001" } };
      stored = { id, data: structuredClone(input.p_data), version: (stored?.version || 0) + 1, updated_at: "2026-11-10T15:00:00Z" };
      return { data: [structuredClone(stored)], error: null };
    });
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: structuredClone(stored), error: null })) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); provider.from.mockReturnValue(query);
    provider.createClient.mockReturnValue({ auth: { getUser: provider.getUser }, rpc: provider.rpc, from: provider.from });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("preserves reviewed cents, provenance and decisions across create, reopen and correction", async () => {
    const original = reviewActivity();
    const created = await createWorkspace(request("POST", { workspace: original }));
    expect(created.status).toBe(201);
    expect((await created.json()).workspace).toEqual(original);
    const reopened = await (await getWorkspace(request("GET"), id)).json();
    expect(reopened.workspace).toEqual(original);
    expect(calculateWorkspace(reopened.workspace)).toMatchObject({ profitCents: 16_975, paymentsCents: 1_500, federal: null });
    const corrected = { ...reopened.workspace, revision: 7, rows: reopened.workspace.rows.map((row: LedgerRow) => row.sourceId === "cash-1" ? { ...row, treatment: "personal", note: "Actually an owner contribution." } : row) };
    const updated = await updateWorkspace(request("PATCH", { workspace: corrected, expectedVersion: reopened.version }), id);
    expect(updated.status).toBe(200);
    const after = await updated.json();
    expect(after.version).toBe(2);
    expect(calculateWorkspace(after.workspace).profitCents).toBe(8_985);
    expect(restoreWorkspace(serializeWorkspace(after.workspace))).toEqual(corrected);
  });

  it("does not overwrite the prior save on malformed financial data or a stale version", async () => {
    const original = reviewActivity();
    await createWorkspace(request("POST", { workspace: original }));
    const malformed = { ...original, rows: original.rows.map((row, index) => index === 0 ? { ...row, amountCents: "12010" } : row) };
    const invalid = await updateWorkspace(request("PATCH", { workspace: malformed, expectedVersion: 1 }), id);
    expect(invalid.status).toBe(400);
    expect(provider.rpc).toHaveBeenCalledTimes(1);
    const latest = { ...original, title: "Latest title", revision: 7 };
    expect((await updateWorkspace(request("PATCH", { workspace: latest, expectedVersion: 1 }), id)).status).toBe(200);
    const stale = await updateWorkspace(request("PATCH", { workspace: { ...original, title: "Stale title" }, expectedVersion: 1 }), id);
    expect(stale.status).toBe(409);
    const reopened = await (await getWorkspace(request("GET"), id)).json();
    expect(reopened.workspace.title).toBe("Latest title");
    expect(reopened.workspace.rows).toEqual(original.rows);
  });

  it("rejects injected derived results before storing otherwise valid reviewed records", async () => {
    const response = await createWorkspace(request("POST", { workspace: { ...reviewActivity(), taxTotal: 1, isEligible: true } }));
    expect(response.status).toBe(400);
    expect(provider.rpc).not.toHaveBeenCalled();
  });

  it("keeps a valid large local backup usable when it is too large for cloud storage", async () => {
    const workspace = { ...reviewActivity(), imports: [], rows: Array.from({ length: 2100 }, (_, index) => ({
      id: `local-${index}`, date: "2026-10-01", description: "Fictional test record", amountCents: 1,
      source: "Manual", treatment: "personal" as const, reviewed: true, note: "n".repeat(2000),
    })) };
    const backup = serializeWorkspace(workspace);
    expect(new TextEncoder().encode(JSON.stringify(workspace)).byteLength).toBeGreaterThan(4 * 1024 * 1024);
    expect(new TextEncoder().encode(backup).byteLength).toBeLessThanOrEqual(5 * 1024 * 1024);
    const response = await createWorkspace(request("POST", { workspace }));
    expect(response.status).toBe(413);
    expect(provider.rpc).not.toHaveBeenCalled();
    expect(restoreWorkspace(backup).rows).toEqual(workspace.rows);
  });
});
