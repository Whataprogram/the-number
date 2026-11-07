export type Kind = "business_income" | "business_expense" | "personal" | "transfer" | "tax_payment" | "review";

export interface Txn {
  id: string;
  date: string; // YYYY-MM-DD
  source: string; // Chase, Cash App, Venmo, Plaid
  description: string;
  counterparty?: string;
  amountCents: number; // money in > 0, money out < 0
  kind: Kind;
  category?: string;
  reason: string; // why it was tagged this way (shown to the user)
  userSet?: boolean;
}

export interface Bill {
  name: string;
  amountCents: number;
  due: string; // YYYY-MM-DD
}

export interface AccountBalance {
  name: string;
  balanceCents: number;
}

export interface Profile {
  ownerName: string;
  businessName: string;
  age: number;
  state: string;
  parentRule?: { label: string; amountCents: number };
  asOf: string;
  balances: AccountBalance[];
  bills: Bill[];
}
