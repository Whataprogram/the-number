// Setup check: reports whether the Plaid settings look the right shape. Never returns the values.
export const dynamic = "force-dynamic";

export async function GET() {
  const id = process.env.PLAID_CLIENT_ID?.trim() || "";
  const secret = process.env.PLAID_SECRET?.trim() || "";
  const env = (process.env.PLAID_ENV || "").trim();
  return Response.json({
    env: env || "(missing, defaults to sandbox)",
    clientIdSet: !!id,
    clientIdLooksRight: /^[a-f0-9]{24}$/.test(id),
    clientIdLength: id.length,
    secretSet: !!secret,
    secretLooksRight: /^[a-f0-9]{30}$/.test(secret),
    secretLength: secret.length,
    sameValueInBoth: !!id && id === secret,
  });
}
