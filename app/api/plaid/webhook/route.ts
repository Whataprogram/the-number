// Plaid calls this when new transactions are ready (SYNC_UPDATES_AVAILABLE).
// Production: look up the item, run /transactions/sync, recompute the Number, and text the owner + parent
// if the balance dropped below it. This hackathon build acknowledges the webhook; the app re-syncs on open.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  console.log("plaid webhook", body?.webhook_type, body?.webhook_code, body?.item_id);
  return Response.json({ received: true });
}
