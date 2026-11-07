import type { Quarter } from "./number";

// IRS underpayment rate for individuals: 7% a year, compounded daily (Q4 2026, IRS newsroom).
// Q2 2026 was briefly 6%, so using 7% all year makes this a slightly high, conservative estimate.
export const UNDERPAYMENT_RATE = 0.07;
export const RATE_SOURCE = "https://www.irs.gov/newsroom/interest-rates-remain-the-same-for-the-fourth-quarter-of-2026";

const dayNum = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;

/** Estimated-tax penalty on one late amount, from its due date to `asOf`. Whole cents. */
export function latePenalty(amountCents: number, due: string, asOf: string, rate = UNDERPAYMENT_RATE) {
  const days = Math.max(0, Math.round(dayNum(asOf) - dayNum(due)));
  return Math.round(amountCents * (Math.pow(1 + rate / 365, days) - 1));
}

/** Penalty so far on every missed payment, plus what it grows to if nothing is paid by `until`. */
export function penaltySummary(quarters: Quarter[], asOf: string, until: string) {
  const late = quarters.filter((q) => q.status === "missed" && q.remainingCents > 0);
  const soFar = late.reduce((s, q) => s + latePenalty(q.remainingCents, q.due, asOf), 0);
  const byThen = late.reduce((s, q) => s + latePenalty(q.remainingCents, q.due, until), 0);
  const perWeek = late.reduce((s, q) => s + latePenalty(q.remainingCents, q.due, new Date(Date.parse(asOf + "T00:00:00Z") + 7 * 86_400_000).toISOString().slice(0, 10)), 0) - soFar;
  return { soFarCents: soFar, byThenCents: byThen, perWeekCents: perWeek, lateCount: late.length };
}
