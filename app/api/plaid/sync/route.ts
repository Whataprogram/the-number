import { cookies } from "next/headers";
import { notConfigured, plaidClient } from "@/lib/plaid";
import { syncAll } from "./sync";

export async function POST() {
  const plaid = plaidClient();
  if (!plaid) return notConfigured();
  const at = cookies().get("plaid_at")?.value;
  if (!at) return Response.json({ error: "Connect a bank first." }, { status: 401 });
  try {
    return Response.json(await syncAll(plaid, at));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
