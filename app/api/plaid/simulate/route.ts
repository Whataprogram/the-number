import { cookies } from "next/headers";
import { notConfigured, plaidClient } from "@/lib/plaid";

// Sandbox only: asks Plaid to fire a SYNC_UPDATES_AVAILABLE webhook, so we can show a live alert on stage.
export async function POST() {
  const plaid = plaidClient();
  if (!plaid) return notConfigured();
  if ((process.env.PLAID_ENV || "sandbox") !== "sandbox") return Response.json({ error: "Sandbox only" }, { status: 403 });
  const at = cookies().get("plaid_at")?.value;
  if (!at) return Response.json({ error: "Connect a bank first." }, { status: 401 });
  try {
    await plaid.sandboxItemFireWebhook({ access_token: at, webhook_code: "SYNC_UPDATES_AVAILABLE" as never });
    return Response.json({ fired: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
