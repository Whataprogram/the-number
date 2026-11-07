import type { Txn } from "./types";

// Rule-based tagging. Every tag carries a plain-English reason. Anything uncertain goes to "review".
const JOB_WORDS = /\b(wash|washing|driveway|house|deck|patio|siding|gutter|window|roof|fence|sidewalk|soft ?wash|pressure|job|quote|estimate|invoice|clean(ing)?)\b/i;
const PERSONAL_IN = /\b(birthday|bday|gift|allowance|from mom|from dad|refund|split|tickets?|concert|game|dinner|pizza|uber|lunch)\b/i;
const PERSONAL_OUT = /(chipotle|mcdonald|starbucks|taco bell|doordash|uber eats|netflix|spotify|steam|playstation|nike|amazon|target|movie|amc|concert|pizza|dinner|lunch|tickets?|split|gas money)/i;
const TAX = /(irs|eftps|us treasury|estimated tax|direct pay)/i;
const TRANSFER = /(transfer to|transfer from|cash out|instant transfer|standard transfer|online transfer|venmo cashout|cash app cash out)/i;

const BUSINESS_EXPENSE: [RegExp, string][] = [
  [/(home depot|lowe'?s|northern tool|harbor freight|sh supply|pool supply|chemical|surface cleaner|sodium hypochlorite|bleach)/i, "Supplies & chemicals"],
  [/(speedway|shell|bp |marathon|sunoco|kroger fuel|circle k|exxon|fuel)/i, "Fuel"],
  [/(next insurance|insurance|state farm|progressive)/i, "Insurance"],
  [/(verizon|t-mobile|at&t|phone)/i, "Phone"],
  [/(google ads|facebook ads|meta ads|canva|vistaprint|door hangers|yard signs|nextdoor)/i, "Marketing"],
  [/(small engine|repair|pump|hose|nozzle|equipment|pressure washer)/i, "Equipment & repairs"],
  [/(square fee|stripe fee|processing fee)/i, "Payment fees"],
];

export function classify(raw: Omit<Txn, "kind" | "reason">): Txn {
  const text = `${raw.description ?? ""} ${raw.counterparty ?? ""}`;
  const t = { ...raw } as Txn;
  if (TAX.test(text) && raw.amountCents < 0) return { ...t, kind: "tax_payment", category: "Estimated tax", reason: "Payment to the IRS. Counts toward what you owe." };
  if (TRANSFER.test(text)) return { ...t, kind: "transfer", category: "Transfer", reason: "Money moving between your own accounts. Not income or spending." };
  if (raw.amountCents > 0) {
    if (JOB_WORDS.test(text)) return { ...t, kind: "business_income", category: "Customer payment", reason: `The note mentions work ("${(raw.description || "").slice(0, 40)}"), so it's business income.` };
    if (/square|stripe|zelle (payment )?from|invoice/i.test(text)) return { ...t, kind: "business_income", category: "Customer payment", reason: "Came through a payment processor customers use, so it's business income." };
    if (PERSONAL_IN.test(text)) return { ...t, kind: "personal", category: "Personal", reason: "Looks like a gift, a refund or a friend paying you back. Not business income." };
    return { ...t, kind: "review", category: "Needs your answer", reason: "A payment with no clear note. Business or personal? Until you answer, we count it as business income so you don't come up short." };
  }
  for (const [re, cat] of BUSINESS_EXPENSE) {
    if (re.test(text)) return { ...t, kind: "business_expense", category: cat, reason: `${cat} for the business. Lowers your taxable profit.` };
  }
  if (PERSONAL_OUT.test(text)) return { ...t, kind: "personal", category: "Personal", reason: "Personal spending. Doesn't change your taxes." };
  return { ...t, kind: "review", category: "Needs your answer", reason: "We couldn't tell if this was for the business. Until you answer, we don't count it as a business expense." };
}
