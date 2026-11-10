import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV === "development";
  let authOrigin = "";
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (url.protocol === "https:") authOrigin = url.origin;
  } catch { /* Unconfigured installations still support the local workspace. */ }
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // React sets bounded numeric progress widths through style attributes.
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${authOrigin}${development ? " ws://127.0.0.1:3010 ws://localhost:3000" : ""}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|favicon.ico|transaction-template.csv).*)"],
};
