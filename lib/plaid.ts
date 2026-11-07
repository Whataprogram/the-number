import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from "plaid";
import { toCents } from "./tax";
import type { Txn } from "./types";

// Server-only. Keys come from environment variables (never committed, never sent to the browser).
export function plaidClient() {
  // Trim in case a key was pasted with a stray space or newline.
  const id = process.env.PLAID_CLIENT_ID?.trim(), secret = process.env.PLAID_SECRET?.trim();
  const env = ((process.env.PLAID_ENV || "sandbox").trim() as keyof typeof PlaidEnvironments);
  if (!id || !secret) return null;
  return new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: { headers: { "PLAID-CLIENT-ID": id, "PLAID-SECRET": secret } },
  }));
}

export const LINK_CONFIG = { products: [Products.Transactions], country_codes: [CountryCode.Us], language: "en" as const, client_name: "The Number" };

// Plaid amounts are positive for money leaving the account. We store money in as positive cents.
export function mapPlaidTxn(t: { transaction_id: string; date: string; name: string; merchant_name?: string | null; amount: number; account_id: string }, accountName: string): Omit<Txn, "kind" | "reason"> {
  return {
    id: `plaid-${t.transaction_id}`,
    date: t.date,
    source: `Plaid · ${accountName}`,
    description: t.merchant_name || t.name,
    counterparty: t.name,
    amountCents: toCents((-t.amount).toFixed(2)),
  };
}

export const notConfigured = () =>
  Response.json({ error: "Bank connection isn't set up yet: add PLAID_CLIENT_ID and PLAID_SECRET in your environment settings. The demo still works." }, { status: 501 });
