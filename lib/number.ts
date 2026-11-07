import { federalEstimate, formatUSD, type FederalEstimate } from "./tax";
import { TAX_2026, TAX_YEAR } from "./taxConfig";
import type { Profile, Txn } from "./types";

const dayNum = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;

export interface Line { key: string; label: string; amountCents: number; why: string; txnIds?: string[] }
export interface Alert { id: string; level: "critical" | "warning" | "info"; title: string; body: string }

export interface NumberResult {
  asOf: string;
  incomeCents: number;
  expensesCents: number;
  netProfitCents: number;
  reviewCount: number;
  fed: FederalEstimate;
  taxPaidCents: number;
  owedSoFarCents: number;
  cushionCents: number;
  billsCents: number;
  theNumberCents: number;
  balanceCents: number;
  safeToSpendCents: number;
  saveThisMonthCents: number;
  next: { quarter: string; due: string; daysLeft: number; amountCents: number };
  missed: { quarter: string; due: string }[];
  lines: Line[];
  monthly: { month: string; incomeCents: number; expensesCents: number }[];
  topCategories: { category: string; amountCents: number }[];
  alerts: Alert[];
}

export function computeNumber(txns: Txn[], profile: Profile): NumberResult {
  const asOf = profile.asOf;
  const inYear = txns.filter((t) => t.date.startsWith(String(TAX_YEAR)) && t.date <= asOf);
  const incomeTx = inYear.filter((t) => t.kind === "business_income" || (t.kind === "review" && t.amountCents > 0));
  const expenseTx = inYear.filter((t) => t.kind === "business_expense");
  const taxTx = inYear.filter((t) => t.kind === "tax_payment");
  const income = incomeTx.reduce((s, t) => s + t.amountCents, 0);
  const expenses = expenseTx.reduce((s, t) => s - t.amountCents, 0);
  const net = income - expenses;
  const fed = federalEstimate(net);
  const paid = taxTx.reduce((s, t) => s - t.amountCents, 0);
  const owed = Math.max(0, fed.totalTaxCents - paid);

  // One month of business costs = average monthly business spending so far this year.
  const daysElapsed = dayNum(asOf) - dayNum("2026-01-01") + 1;
  const monthsElapsed = daysElapsed / (365 / 12);
  const cushion = monthsElapsed > 0 ? Math.round(expenses / monthsElapsed) : 0;

  // Bills due in the next 45 days.
  const billsSoon = profile.bills.filter((b) => dayNum(b.due) >= dayNum(asOf) && dayNum(b.due) - dayNum(asOf) <= 45);
  const bills = billsSoon.reduce((s, b) => s + b.amountCents, 0);

  const theNumber = owed + cushion + bills;
  const balance = profile.balances.reduce((s, b) => s + b.balanceCents, 0);
  const safe = balance - theNumber;

  const upcoming = TAX_2026.quarterlyDueDates.find((q) => q.due >= asOf) ?? TAX_2026.quarterlyDueDates[3];
  const missed = paid === 0 ? TAX_2026.quarterlyDueDates.filter((q) => q.due < asOf).map((q) => ({ quarter: q.quarter, due: q.due })) : [];
  const daysLeft = Math.round(dayNum(upcoming.due) - dayNum(asOf));
  const monthsToDue = Math.max(1, Math.ceil(daysLeft / 30));
  const saveThisMonth = Math.round(owed / monthsToDue);

  const reviewCount = inYear.filter((t) => t.kind === "review").length;
  const seWhy = fed.se.belowThreshold
    ? `Your net self-employment earnings are under $400, so you don't owe self-employment tax yet.`
    : `You work for yourself, so no boss pays half your Social Security and Medicare. You pay both halves: 15.3% on 92.35% of your profit (${formatUSD(fed.se.netEarningsCents)}). That's ${formatUSD(fed.se.totalCents)}. Most young owners have never heard of this tax. It applies at any age once you clear $400.`;
  const itWhy = fed.taxableIncomeCents === 0
    ? `Your profit after the standard deduction (${formatUSD(fed.standardDeductionCents)}) is $0, so no federal income tax yet.`
    : `Profit ${formatUSD(net)} minus half your self-employment tax (${formatUSD(fed.halfSeDeductionCents)}) minus the ${formatUSD(fed.standardDeductionCents)} standard deduction leaves ${formatUSD(fed.taxableIncomeCents)} that gets taxed at 10%, then 12% above $12,400. That's ${formatUSD(fed.incomeTaxCents)}.`;

  const lines: Line[] = [
    { key: "se", label: "Self-employment tax", amountCents: fed.se.totalCents, why: seWhy },
    { key: "income", label: "Federal income tax", amountCents: fed.incomeTaxCents, why: itWhy },
    ...(paid > 0 ? [{ key: "paid", label: "Already paid to the IRS", amountCents: -paid, why: `You've sent ${formatUSD(paid)} in estimated payments this year. That comes off what you owe.`, txnIds: taxTx.map((t) => t.id) }] : []),
    { key: "cushion", label: "One month of business costs", amountCents: cushion, why: `You spend about ${formatUSD(cushion)} a month on the business (fuel, chemicals, insurance, phone). Keeping one month on hand means a slow month or a broken pump doesn't put you in a hole.`, txnIds: expenseTx.map((t) => t.id) },
    ...billsSoon.map((b) => ({ key: `bill-${b.name}`, label: `${b.name} (due ${b.due.slice(5).replace("-", "/")})`, amountCents: b.amountCents, why: `${b.name} is due ${b.due}. It's coming either way, so it's not money you can spend.` })),
  ];

  const months = Array.from({ length: Number(asOf.slice(5, 7)) }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
  const monthly = months.map((m) => ({
    month: m,
    incomeCents: incomeTx.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + t.amountCents, 0),
    expensesCents: expenseTx.filter((t) => t.date.startsWith(m)).reduce((s, t) => s - t.amountCents, 0),
  }));
  const catMap = new Map<string, number>();
  for (const t of expenseTx) catMap.set(t.category || "Other", (catMap.get(t.category || "Other") || 0) - t.amountCents);
  const topCategories = [...catMap.entries()].map(([category, amountCents]) => ({ category, amountCents })).sort((a, b) => b.amountCents - a.amountCents);

  const alerts: Alert[] = [];
  if (safe < 0) alerts.push({ id: "below", level: "critical", title: `You're ${formatUSD(-safe)} below your Number`, body: `You have ${formatUSD(balance)} across your accounts, but ${formatUSD(theNumber)} of it is already spoken for. Hold off on big purchases until you're back above it.` });
  if (missed.length) alerts.push({ id: "missed", level: "warning", title: `${missed.length} estimated tax payment${missed.length > 1 ? "s" : ""} missed`, body: `The IRS expected payments on ${missed.map((m) => m.due).join(", ")}. Paying soon keeps the underpayment penalty small. You can pay at irs.gov/payments.` });
  alerts.push({ id: "next", level: "info", title: `Next estimated tax: ${upcoming.due} (${daysLeft} days)`, body: `Set aside about ${formatUSD(saveThisMonth)} a month to cover the ${formatUSD(owed)} you owe so far.` });
  if (reviewCount) alerts.push({ id: "review", level: "info", title: `${reviewCount} payments need a quick answer`, body: `Tell us business or personal. Payment apps expect business money on a business profile, so sorting these keeps you legit.` });
  if (profile.parentRule && theNumber > profile.parentRule.amountCents) alerts.push({ id: "rule", level: "warning", title: `${profile.parentRule.label} is ${formatUSD(theNumber - profile.parentRule.amountCents)} too low`, body: `The rule of thumb is ${formatUSD(profile.parentRule.amountCents)}. Your actual Number is ${formatUSD(theNumber)}, mostly because of self-employment tax.` });

  return {
    asOf, incomeCents: income, expensesCents: expenses, netProfitCents: net, reviewCount, fed,
    taxPaidCents: paid, owedSoFarCents: owed, cushionCents: cushion, billsCents: bills, theNumberCents: theNumber,
    balanceCents: balance, safeToSpendCents: safe, saveThisMonthCents: saveThisMonth,
    next: { quarter: upcoming.quarter, due: upcoming.due, daysLeft, amountCents: owed }, missed,
    lines, monthly, topCategories, alerts,
  };
}
