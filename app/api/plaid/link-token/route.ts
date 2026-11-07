import { LINK_CONFIG, notConfigured, plaidClient } from "@/lib/plaid";

export async function POST() {
  const plaid = plaidClient();
  if (!plaid) return notConfigured();
  try {
    const r = await plaid.linkTokenCreate({
      ...LINK_CONFIG,
      // A fresh id each time so Plaid never skips straight to a bank used earlier: you always get the full bank list.
      user: { client_user_id: `the-number-${crypto.randomUUID()}` },
      ...(process.env.PLAID_WEBHOOK_URL ? { webhook: process.env.PLAID_WEBHOOK_URL } : {}),
    });
    return Response.json({ link_token: r.data.link_token });
  } catch (e) {
    const msg = (e as { response?: { data?: { error_message?: string } } }).response?.data?.error_message || (e as Error).message;
    return Response.json({ error: `Plaid couldn't start: ${msg}` }, { status: 502 });
  }
}
