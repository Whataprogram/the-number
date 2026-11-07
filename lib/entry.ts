import type { Kind } from "./types";

export interface Entry { amountCents: number; kind: Extract<Kind, "business_income" | "business_expense" | "personal">; description: string; direction: "in" | "out" }

// Money going out: any spending word.
const OUT = /\b(spent|spend|spending|bought|buy|buying|purchased?|paid for|pay for|paid (?:my|the|a|an)|cost|costs|ordered|expense|bill|fee|fees|withdrew|withdrawal|lost|gave|sent|rent|subscription|refunded (?:a|the) customer)\b/i;
// Money coming in: any earning word.
const IN = /\b(earned|earn|made|make|received|receive|got paid|got|get paid|paid me|customer paid|client paid|sold|sale|tip|tips|gained|income|revenue|charged|invoiced|deposit|deposited|collected|brought in|job|gig|booked|paid by)\b/i;
// Words that make a cost a business cost (so it lowers your taxes).
const BIZ = /\b(gas|fuel|supplies|supply|chemicals?|soap|bleach|degreaser|gear|equipment|tools?|hose|nozzle|wand|pump|surface cleaner|ladder|insurance|phone bill|ads?|advertising|flyers?|marketing|repairs?|parts|trailer|mower|blower|trimmer|business|for work|for the business|software|website|domain|uniform|license|permit|mileage|oil change)\b/i;
// Words that sound like a job, for entries with no verb ("350 house wash").
const JOBISH = /\b(wash|washing|mow|mowing|lawn|detail|detailing|clean|cleaning|tutor|tutoring|lesson|haircut|shoot|commission|delivery|install|repair job|customer|client)\b/i;

/** Parses plain sentences like "earned $350 washing a house", "spent 180 on sneakers", "+120 tip", "-45 gas". */
export function parseEntry(text: string): Entry | { error: string } {
  const t = text.trim();
  const m = t.match(/([+-])?\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(k)?\b/i);
  if (!m) return { error: "Add an amount, like \"earned $350 on a house wash\"." };
  let amountCents = Number(m[2].replace(/,/g, "")) * 100 + (m[3] ? Number(m[3].padEnd(2, "0")) : 0);
  if (m[4]) amountCents *= 1000;
  if (amountCents <= 0) return { error: "The amount has to be more than $0." };
  if (amountCents > 5_000_000) return { error: "That's over $50,000. Double-check the amount." };

  let direction: "in" | "out" | null = m[1] === "-" ? "out" : m[1] === "+" ? "in" : null;
  if (!direction) {
    const out = OUT.test(t), inn = IN.test(t);
    direction = out && !/\b(paid me|customer paid|client paid|got paid|paid by)\b/i.test(t) ? "out" : inn ? "in" : out ? "out" : null;
  }
  if (!direction) direction = BIZ.test(t) ? "out" : JOBISH.test(t) ? "in" : null;
  if (!direction) return { error: "Did money come in or go out? Try \"earned $350…\" or \"spent $180…\"." };

  const what = (t.match(/\b(?:for|on|at|from|washing|mowing|cleaning|detailing)\s+(?:a |an |the |some |my )?(.+)$/i)?.[1] || t.replace(m[0], "").replace(IN, "").replace(OUT, ""))
    .replace(/[.!]+$/, "").replace(/\s+/g, " ").trim().slice(0, 40) || (direction === "in" ? "customer payment" : "purchase");
  const kind = direction === "in" ? "business_income" : BIZ.test(t) ? "business_expense" : "personal";
  return { amountCents, kind, description: what, direction };
}
