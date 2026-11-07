import { cookies } from "next/headers";
import { notConfigured, plaidClient } from "@/lib/plaid";
import { syncAll } from "../sync/sync";

// Exchanges the one-time public token for an access token, keeps it in an httpOnly cookie
// (sandbox demo only; production would store it encrypted server-side), then pulls transactions.
export async function POST(req: Request) {
  const plaid = plaidClient();
  if (!plaid) return notConfigured();
  const { public_token } = await req.json();
  if (typeof public_token !== "string") return Response.json({ error: "Missing public_token" }, { status: 400 });
  try {
    const ex = await plaid.itemPublicTokenExchange({ public_token });
    cookies().set("plaid_at", ex.data.access_token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 6 });
    return Response.json(await syncAll(plaid, ex.data.access_token));
  } catch (e) {
    const msg = (e as { response?: { data?: { error_message?: string } } }).response?.data?.error_message || (e as Error).message;
    return Response.json({ error: `Couldn't connect the bank: ${msg}` }, { status: 502 });
  }
}
