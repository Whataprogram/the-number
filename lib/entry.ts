import type { Kind } from "./types";

export interface Entry { amountCents: number; kind: Extract<Kind, "business_income" | "business_expense" | "personal">; description: string; direction: "in" | "out" }

const OUT = /\b(spent|spend|bought|buy|purchased?|paid for|cost|ordered|got (?:a|an|some|new)\b)/i;
const IN = /\b(got paid|got|made|earned|received|paid me|customer|client|job|sold|tip|gained|income|cash app from|venmo from)\b/i;
const BIZ = /\b(gas|fuel|supplies|chemicals?|soap|bleach|degreaser|gear|equipment|tools?|hose|nozzle|wand|pump|surface cleaner|ladder|insurance|phone bill|ads?|flyers?|marketing|repairs?|parts|trailer|mower|blower|trimmer|business|for work|for the business)\b/i;

/** Parses plain sentences like "got $350 for a house wash" or "spent 180 on sneakers". */
export function parseEntry(text: string): Entry | { error: string } {
  const t = text.trim();
  const m = t.match(/\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/);
  if (!m) return { error: "Add an amount, like \"got $350 for a house wash\"." };
  const amountCents = Number(m[1].replace(/,/g, "")) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0);
  if (amountCents <= 0) return { error: "The amount has to be more than $0." };
  if (amountCents > 5_000_000) return { error: "That's over $50,000. Double-check the amount." };
  const out = OUT.test(t), inn = IN.test(t);
  if (!out && !inn) return { error: "Start with \"got\" or \"spent\" so we know which way the money went." };
  const direction = out ? "out" : "in";
  const what = (t.match(/\b(?:for|on|at)\s+(?:a |an |the |some )?(.+)$/i)?.[1] || t.replace(m[0], "")).replace(/[.!]+$/, "").trim().slice(0, 40) || (direction === "in" ? "customer payment" : "purchase");
  const kind = direction === "in" ? "business_income" : BIZ.test(t) ? "business_expense" : "personal";
  return { amountCents, kind, description: what, direction };
}
