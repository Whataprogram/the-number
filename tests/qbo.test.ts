import { describe, expect, it } from "vitest";
import { plToTxns } from "../lib/qbo";

// Shape of a QuickBooks ProfitAndLoss report summarized by month (trimmed).
const report = {
  Columns: { Column: [
    { ColTitle: "", MetaData: [] },
    { ColTitle: "Jan 2026", MetaData: [{ Name: "StartDate", Value: "2026-01-01" }, { Name: "EndDate", Value: "2026-01-31" }] },
    { ColTitle: "Feb 2026", MetaData: [{ Name: "StartDate", Value: "2026-02-01" }, { Name: "EndDate", Value: "2026-02-28" }] },
    { ColTitle: "Total", MetaData: [] },
  ] },
  Rows: { Row: [
    { group: "Income", Summary: { ColData: [{ value: "Total Income" }, { value: "1200.50" }, { value: "800" }, { value: "2000.50" }] } },
    { group: "COGS", Summary: { ColData: [{ value: "Total COGS" }, { value: "100" }, { value: "" }, { value: "100" }] } },
    { group: "Expenses", Summary: { ColData: [{ value: "Total Expenses" }, { value: "50.25" }, { value: "75" }, { value: "125.25" }] } },
    { group: "NetIncome", Summary: { ColData: [{ value: "Net Income" }, { value: "1050.25" }, { value: "725" }, { value: "1775.25" }] } },
  ] },
};

describe("QuickBooks Profit & Loss", () => {
  it("turns monthly totals into income and expense entries that match net income", () => {
    const t = plToTxns(report, "2026-11-07");
    const inc = t.filter((x) => x.kind === "business_income").reduce((s, x) => s + x.amountCents, 0);
    const exp = t.filter((x) => x.kind === "business_expense").reduce((s, x) => s - x.amountCents, 0);
    expect(inc).toBe(200_050);
    expect(exp).toBe(22_525);
    expect(inc - exp).toBe(177_525); // = QuickBooks Net Income
    expect(t.every((x) => x.source === "QuickBooks")).toBe(true);
  });
});
