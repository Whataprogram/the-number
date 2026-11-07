import type { PlaidApi } from "plaid";
import { classify } from "@/lib/classify";
import { mapPlaidTxn } from "@/lib/plaid";
import { toCents } from "@/lib/tax";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pulls all transactions with /transactions/sync. Sandbox items can take a few seconds to be ready.
export async function syncAll(plaid: PlaidApi, access_token: string) {
  const accounts = (await plaid.accountsGet({ access_token })).data.accounts;
  const names = new Map(accounts.map((a) => [a.account_id, a.name]));
  let cursor: string | undefined;
  const added: Parameters<typeof mapPlaidTxn>[0][] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    let hasMore = true;
    while (hasMore) {
      const r = await plaid.transactionsSync({ access_token, cursor, count: 500 });
      added.push(...r.data.added);
      cursor = r.data.next_cursor;
      hasMore = r.data.has_more;
    }
    if (added.length) break;
    await sleep(1500);
  }
  const txns = added.map((t) => classify(mapPlaidTxn(t, names.get(t.account_id) || "Account")));
  const balances = accounts
    .filter((a) => a.type === "depository")
    .map((a) => ({ name: a.name, balanceCents: toCents((a.balances.available ?? a.balances.current ?? 0).toFixed(2)) }));
  return { txns, balances };
}
