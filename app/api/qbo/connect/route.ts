import { cookies } from "next/headers";
import { QBO_AUTH, qboConfig, qboNotConfigured } from "@/lib/qbo";

// Step 1: send the user to Intuit to approve read access to their QuickBooks company.
export async function GET(req: Request) {
  const cfg = qboConfig(new URL(req.url).origin);
  if (!cfg) return qboNotConfigured();
  const state = crypto.randomUUID();
  cookies().set("qbo_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  const u = new URL(QBO_AUTH);
  u.searchParams.set("client_id", cfg.id);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "com.intuit.quickbooks.accounting");
  u.searchParams.set("redirect_uri", cfg.redirect);
  u.searchParams.set("state", state);
  return Response.redirect(u.toString(), 302);
}
