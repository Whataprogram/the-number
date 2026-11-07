import type { Txn } from "./types";

/**
 * Sample data only: scales a sample business up or down so every demo load shows a different, realistic size.
 * Income scales by `factor`; business costs grow more slowly (sqrt), like a real business that gets more efficient.
 * Personal spending and transfers are left alone. Amounts stay in whole cents.
 */
export function scaleBusiness(txns: Txn[], factor: number): Txn[] {
  const costF = Math.sqrt(factor);
  return txns.map((t) => {
    if (t.kind === "business_income" || (t.kind === "review" && t.amountCents > 0)) return { ...t, amountCents: Math.round(t.amountCents * factor) };
    if (t.kind === "business_expense") return { ...t, amountCents: Math.round(t.amountCents * costF) };
    return t;
  });
}

/** Random factor for the sample business: lands what's owed in the ~$2.5K to ~$13K range. */
export const randomFactor = () => Math.round((1.2 + Math.random() * 2.8) * 100) / 100;
