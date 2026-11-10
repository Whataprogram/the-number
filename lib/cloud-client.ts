"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Workspace } from "./workspace-types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
function safePublicConfiguration() {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) return false;
    if (key.startsWith("sb_publishable_")) return true;
    return JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "anon";
  } catch { return false; }
}
export const cloudConfigured = safePublicConfiguration();
export const MAX_CLOUD_BYTES = 4 * 1024 * 1024;
let browserClient: SupabaseClient | null = null;

/** The public key identifies this app; authenticated database policies protect every row. */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (!cloudConfigured) return null;
  if (!browserClient) browserClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  return browserClient;
}

export interface CloudWorkspaceSummary { id: string; title: string; version: number; updated_at: string; }
export interface CloudWorkspaceDetail { id: string; workspace: Workspace; version: number; updated_at: string; }
export class CloudRequestError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = "CloudRequestError"; }
}

/** Only forwards the session token to this application's workspace API. */
export async function cloudFetch<T>(path: string, options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; expectedUserId?: string } = {}): Promise<T> {
  if (!/^\/api\/workspaces(?:\/[0-9a-f-]{36})?$/i.test(path)) throw new Error("Unsupported cloud endpoint.");
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new CloudRequestError(503, "not_configured", "Cloud saving is not configured for this deployment.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new CloudRequestError(401, "authentication_required", "Sign in again to access your saved workspaces.");
  if (options.expectedUserId && data.session.user.id !== options.expectedUserId) {
    throw new CloudRequestError(401, "session_changed", "The signed-in account changed. Reopen the workspace for the current account before saving.");
  }
  const encodedBody = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (encodedBody && new TextEncoder().encode(encodedBody).byteLength > MAX_CLOUD_BYTES + 2048) {
    throw new CloudRequestError(413, "too_large", "Cloud workspaces are limited to 4 MB. Download a local backup, then reduce long notes or split the records before saving.");
  }
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method || "GET", cache: "no-store", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${data.session.access_token}`, ...(options.body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(encodedBody === undefined ? {} : { body: encodedBody }),
    });
  } catch {
    throw new CloudRequestError(0, "network_error", "Could not reach cloud storage. Your current records are still in this tab; download a backup and retry.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new CloudRequestError(response.status, body?.error || "request_failed", body?.message || "Cloud request failed. Your current records have not been cleared.");
  return body as T;
}
