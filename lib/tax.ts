import { TAX_2026 } from "./taxConfig";

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
function integer(value: number, label: string): bigint {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer.`);
  return BigInt(value);
}
function safeNumber(value: bigint): number {
  if (value > MAX_SAFE || value < -MAX_SAFE) throw new RangeError("Money amount exceeds the supported integer range.");
  return Number(value);
}
// Integer-only division; an exact half cent rounds away from zero.
function roundedRatio(value: bigint, denominator: bigint): bigint {
  const sign = value < 0n ? -1n : 1n;
  const magnitude = value < 0n ? -value : value;
  return sign * ((magnitude + denominator / 2n) / denominator);
}
export function pct(cents: number, bps: number): number {
  const amount = integer(cents, "Cents"), rate = integer(bps, "Basis points");
  if (rate < 0n) throw new RangeError("Basis points cannot be negative.");
  return safeNumber(roundedRatio(amount * rate, 10_000n));
}

export interface SETax {
  netEarningsCents: number; // net profit x 92.35%
  socialSecurityCents: number;
  medicareCents: number;
  totalCents: number;
  belowThreshold: boolean;
}

export function selfEmploymentTax(netProfitCents: number, cfg = TAX_2026): SETax {
  integer(netProfitCents, "Net profit");
  const netEarnings = pct(Math.max(0, netProfitCents), cfg.seEarningsFactorBps);
  if (netEarnings < cfg.seThresholdCents) {
    return { netEarningsCents: netEarnings, socialSecurityCents: 0, medicareCents: 0, totalCents: 0, belowThreshold: true };
  }
  const ss = pct(Math.min(netEarnings, cfg.ssWageBaseCents), cfg.socialSecurityBps);
  const medicare = pct(netEarnings, cfg.medicareBps);
  return { netEarningsCents: netEarnings, socialSecurityCents: ss, medicareCents: medicare, totalCents: safeNumber(BigInt(ss) + BigInt(medicare)), belowThreshold: false };
}

export function bracketTax(taxableCents: number, cfg = TAX_2026) {
  integer(taxableCents, "Taxable income");
  let remaining = Math.max(0, taxableCents);
  let lower = 0;
  let total = 0n;
  const lines: { rateBps: number; amountCents: number; taxCents: number }[] = [];
  for (const b of cfg.brackets) {
    if (remaining <= 0) break;
    const width = b.upToCents - lower;
    const inBracket = Math.min(remaining, width);
    const t = pct(inBracket, b.rateBps);
    lines.push({ rateBps: b.rateBps, amountCents: inBracket, taxCents: t });
    total += BigInt(t);
    remaining -= inBracket;
    lower = b.upToCents;
  }
  return { totalCents: safeNumber(total), lines };
}

export interface FederalEstimate {
  netProfitCents: number;
  se: SETax;
  halfSeDeductionCents: number;
  agiCents: number;
  standardDeductionCents: number;
  qbiDeductionCents: number;
  taxableIncomeCents: number;
  incomeTaxCents: number;
  incomeTaxLines: { rateBps: number; amountCents: number; taxCents: number }[];
  totalTaxCents: number;
}

export function federalEstimate(netProfitCents: number, cfg = TAX_2026): FederalEstimate {
  integer(netProfitCents, "Net profit");
  const se = selfEmploymentTax(netProfitCents, cfg);
  const halfSe = safeNumber(roundedRatio(BigInt(se.totalCents), 2n));
  const agi = Math.max(0, netProfitCents) > halfSe ? safeNumber(BigInt(netProfitCents) - BigInt(halfSe)) : 0;
  const beforeQbi = Math.max(0, agi - cfg.standardDeductionCents);
  // Sole-proprietor QBI deduction: 20% of (profit - half SE tax), but no more than 20% of taxable income before it.
  const qbi = Math.min(pct(agi, cfg.qbiBps), pct(beforeQbi, cfg.qbiBps));
  const taxable = Math.max(0, beforeQbi - qbi);
  const it = bracketTax(taxable, cfg);
  return {
    netProfitCents,
    se,
    halfSeDeductionCents: halfSe,
    agiCents: agi,
    standardDeductionCents: cfg.standardDeductionCents,
    qbiDeductionCents: qbi,
    taxableIncomeCents: taxable,
    incomeTaxCents: it.totalCents,
    incomeTaxLines: it.lines,
    totalTaxCents: safeNumber(BigInt(se.totalCents) + BigInt(it.totalCents)),
  };
}

export function formatUSD(cents: number, opts: { cents?: boolean } = {}) {
  const value = integer(cents, "Cents");
  const magnitude = value < 0n ? -value : value;
  const dollars = opts.cents ? magnitude / 100n : roundedRatio(magnitude, 100n);
  const whole = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = opts.cents ? `.${(magnitude % 100n).toString().padStart(2, "0")}` : "";
  return `${value < 0n ? "−" : ""}$${whole}${fraction}`;
}

export function toCents(value: string | number): number {
  if (typeof value !== "string" && typeof value !== "number") throw new TypeError("Enter a USD amount.");
  const text = String(value).trim();
  const match = text.match(/^([+-]?)\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error(`Not a money amount: ${text}`);
  const magnitude = BigInt(match[2].replace(/,/g, "")) * 100n + BigInt((match[3] || "").padEnd(2, "0"));
  return safeNumber(match[1] === "-" ? -magnitude : magnitude);
}
