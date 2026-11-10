import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { restoreWorkspace } from "./workspace-io";
import type { Workspace } from "./workspace-types";

// Leave room below Vercel's 4.5 MB request/response limit. Local backups allow 5 MB.
const MAX_CLOUD_BYTES = 4 * 1024 * 1024;
export const MAX_REQUEST_BYTES = MAX_CLOUD_BYTES + 2048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Authorization, Origin", "X-Content-Type-Options": "nosniff" };
class CloudError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
type Context = { client: SupabaseClient; userId: string; email: string };
type DbError = { code?: string; message?: string } | null;

function json(value: unknown, status = 200) { return Response.json(value, { status, headers: PRIVATE_HEADERS }); }
function publicError(error: unknown) {
  if (error instanceof CloudError) {
    const response = json({ error: error.code, message: error.message }, error.status);
    if (error.status === 429) response.headers.set("Retry-After", "60");
    return response;
  }
  // Deliberately do not log tokens, request bodies, database errors, or financial records.
  return json({ error: "storage_unavailable", message: "Cloud storage is temporarily unavailable. Keep your current records and try again." }, 503);
}
function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return; // Non-browser clients still require an explicitly verified Bearer token.
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  let allowed: string;
  try {
    if (configured) allowed = new URL(configured).origin;
    else if (process.env.NODE_ENV !== "production") {
      const local = new URL(request.url);
      if (!["localhost", "127.0.0.1", "[::1]"].includes(local.hostname)) throw new Error("Unconfigured origin");
      allowed = local.origin;
    } else throw new Error("Unconfigured origin");
  } catch { throw new CloudError(503, "origin_not_configured", "The deployment origin has not been configured."); }
  // Never use Host or X-Forwarded-Host as a production allowlist.
  if (origin !== allowed) throw new CloudError(403, "origin_forbidden", "This request origin is not allowed.");
}
function publicKeyAllowed(key: string): boolean {
  if (key.startsWith("sb_publishable_")) return true;
  if (key.startsWith("sb_secret_")) return false;
  try { return JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")).role === "anon"; }
  catch { return false; }
}
async function authenticate(request: Request): Promise<Context> {
  checkOrigin(request);
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer [^\s,]+$/i.test(authorization) || authorization.length > 8192) {
    throw new CloudError(401, "authentication_required", "Sign in to access your saved workspaces.");
  }
  const token = authorization.slice(7);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !publicKeyAllowed(key)) throw new CloudError(503, "not_configured", "Cloud storage is not configured for this deployment.");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) throw new Error("Invalid protocol");
  } catch { throw new CloudError(503, "not_configured", "Cloud storage is not configured for this deployment."); }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, {
      ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    }) },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error && (error.name === "AuthRetryableFetchError" || (error.status && error.status >= 500))) throw new CloudError(503, "authentication_unavailable", "Sign-in verification is temporarily unavailable. Keep your current records and try again.");
  if (error?.status === 429) throw new CloudError(429, "rate_limit", "Too many requests. Wait a minute before retrying.");
  if (error || !data.user) throw new CloudError(401, "authentication_required", "Your session has expired. Sign in again.");
  if (data.user.is_anonymous || !data.user.email || !data.user.email_confirmed_at) {
    throw new CloudError(403, "email_verification_required", "Verify your email before saving financial records to your account.");
  }
  return { client, userId: data.user.id, email: data.user.email };
}
async function handle(request: Request, action: (context: Context) => Promise<Response>) {
  try { return await action(await authenticate(request)); }
  catch (error) { return publicError(error); }
}
function databaseError(error: DbError): void {
  if (!error) return;
  if (error.code === "P0429") throw new CloudError(429, "write_rate_limit", "Too many changes in a short time. Your current work is still in this tab; wait a minute before saving again.");
  if (error.code === "PT409" || error.code === "40001" || error.code === "23505") throw new CloudError(409, "version_conflict", "This workspace changed in another tab. Download your current work, then reopen the saved version before retrying.");
  if (error.code === "42501" || error.code === "PGRST116") throw new CloudError(404, "not_found", "This workspace is unavailable or does not belong to your account.");
  if (["22023", "23514", "22P02"].includes(error.code || "")) throw new CloudError(400, "invalid_workspace", "The workspace does not meet storage requirements.");
  if (error.code === "54000") throw new CloudError(409, "workspace_limit", "Your account has reached the workspace limit. Export and remove an old workspace before creating another.");
  throw new CloudError(503, "storage_unavailable", "Cloud storage is temporarily unavailable. Keep your current records and try again.");
}
function requireId(id: string) {
  if (!UUID.test(id)) throw new CloudError(400, "invalid_id", "Use a valid workspace identifier.");
}
function requireVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2147483646) throw new CloudError(400, "invalid_version", "A current workspace version is required.");
  return value;
}
async function readBody(request: Request, maxBytes = MAX_REQUEST_BYTES): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) throw new CloudError(415, "unsupported_media_type", "Send the workspace as application/json.");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new CloudError(413, "too_large", "The request exceeds the supported size.");
  if (!request.body) throw new CloudError(400, "invalid_json", "A JSON request body is required.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "", size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new CloudError(413, "too_large", "The request exceeds the supported size.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof CloudError) throw error;
    throw new CloudError(400, "invalid_json", "The request is not valid UTF-8 JSON.");
  } finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new CloudError(400, "invalid_json", "The request is not valid JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new CloudError(400, "invalid_json", "The request must be a JSON object.");
  return body as Record<string, unknown>;
}
function allowedFields(body: Record<string, unknown>, fields: string[]) {
  if (Object.keys(body).some(key => !fields.includes(key))) throw new CloudError(400, "invalid_request", "The request contains unsupported fields.");
}
function validatedWorkspace(value: unknown): Workspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CloudError(400, "invalid_workspace", "A valid workspace is required.");
  // Reject sample saves, rather than silently mixing fictional records into an account.
  if ((value as { mode?: unknown }).mode !== "personal") throw new CloudError(400, "sample_not_saved", "Start a personal workspace before saving to your account. The sample stays separate.");
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).byteLength > MAX_CLOUD_BYTES) throw new CloudError(413, "too_large", "Cloud workspaces are limited to 4 MB. Download a local backup and reduce the records before saving.");
  try { return restoreWorkspace(text); }
  catch { throw new CloudError(400, "invalid_workspace", "The workspace contains invalid records or exceeds the supported limits. Export a local backup and correct the records."); }
}
function detail(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid database response");
  const row = value as { id: unknown; data: unknown; version: unknown; updated_at: unknown };
  if (typeof row.id !== "string" || !UUID.test(row.id) || typeof row.version !== "number" || !Number.isSafeInteger(row.version) || row.version < 1 || typeof row.updated_at !== "string") throw new Error("Invalid database response");
  const workspace = validatedWorkspace(row.data);
  return { id: row.id, workspace, version: row.version, updated_at: row.updated_at };
}

export function listWorkspaces(request: Request) {
  return handle(request, async ({ client, userId }) => {
    const { data, error } = await client.from("workspaces").select("id,title,version,updated_at").eq("owner_id", userId).order("updated_at", { ascending: false }).limit(100);
    databaseError(error);
    return json({ workspaces: data || [] });
  });
}
export function createWorkspace(request: Request) {
  return handle(request, async ({ client }) => {
    const body = await readBody(request); allowedFields(body, ["workspace", "id"]);
    if (body.id !== undefined && (typeof body.id !== "string" || !UUID.test(body.id))) throw new CloudError(400, "invalid_id", "Use a valid workspace identifier.");
    const workspace = validatedWorkspace(body.workspace);
    const { data, error } = await client.rpc("save_workspace", { p_id: body.id || null, p_data: workspace, p_expected_version: null });
    databaseError(error);
    return json(detail(Array.isArray(data) ? data[0] : data), 201);
  });
}
export function getWorkspace(request: Request, id: string) {
  return handle(request, async ({ client, userId }) => {
    requireId(id);
    const { data, error } = await client.from("workspaces").select("id,data,version,updated_at").eq("owner_id", userId).eq("id", id).maybeSingle();
    databaseError(error);
    if (!data) throw new CloudError(404, "not_found", "This workspace is unavailable or does not belong to your account.");
    return json(detail(data));
  });
}
export function updateWorkspace(request: Request, id: string) {
  return handle(request, async ({ client }) => {
    requireId(id);
    const body = await readBody(request); allowedFields(body, ["workspace", "expectedVersion"]);
    const expectedVersion = requireVersion(body.expectedVersion);
    const workspace = validatedWorkspace(body.workspace);
    const { data, error } = await client.rpc("save_workspace", { p_id: id, p_data: workspace, p_expected_version: expectedVersion });
    databaseError(error);
    return json(detail(Array.isArray(data) ? data[0] : data));
  });
}
export function deleteWorkspace(request: Request, id: string) {
  return handle(request, async ({ client }) => {
    requireId(id);
    const body = await readBody(request); allowedFields(body, ["expectedVersion"]);
    const expectedVersion = requireVersion(body.expectedVersion);
    const { data, error } = await client.rpc("delete_workspace", { p_id: id, p_expected_version: expectedVersion });
    databaseError(error);
    if (!data || (Array.isArray(data) && !data.length)) throw new CloudError(404, "not_found", "This workspace is unavailable or does not belong to your account.");
    return json({ deleted: true, id });
  });
}

/** Self-deletion only. Fresh-password proof is enforced inside the signed-JWT database RPC. */
export function deleteAccount(request: Request) {
  return handle(request, async ({ client, email }) => {
    const body = await readBody(request, 2048); allowedFields(body, ["confirmEmail"]);
    if (typeof body.confirmEmail !== "string" || body.confirmEmail.length > 254 || !body.confirmEmail.trim() || body.confirmEmail.includes("\u0000")) {
      throw new CloudError(400, "invalid_confirmation", "Enter your account email to confirm deletion.");
    }
    const confirmEmail = body.confirmEmail.trim().toLowerCase();
    if (confirmEmail !== email.trim().toLowerCase()) throw new CloudError(400, "invalid_confirmation", "The confirmation does not match the signed-in account.");
    const { error } = await client.rpc("delete_own_account", { p_confirm_email: confirmEmail });
    if (error?.code === "28000") throw new CloudError(403, "reauthentication_required", "Sign in with your password again, then retry account deletion within ten minutes.");
    if (error?.code === "42501") throw new CloudError(403, "account_deletion_forbidden", "Account deletion could not be authorized. Sign in again and confirm your account email.");
    databaseError(error);
    return json({ deleted: true });
  });
}
