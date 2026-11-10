import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyWorkspace, createSampleWorkspace } from "../lib/engine";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn(), getSession: vi.fn(), rpc: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { createWorkspace, deleteAccount, deleteWorkspace, getWorkspace, listWorkspaces, MAX_REQUEST_BYTES, updateWorkspace } from "../lib/cloud-server";

const id = "b2ad7a96-9585-4016-92fe-1a196ebda230";
const userId = "6dc688fb-c25a-4e55-9c31-aa9e9219738f";
const appOrigin = "https://number.example";
const fixture = () => createEmptyWorkspace();
const saved = () => ({ id, data: fixture(), version: 1, updated_at: "2026-11-10T12:00:00Z" });
function request(method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${appOrigin}/api/workspaces`, { method, headers: { Authorization: "Bearer verified-session-token", Origin: appOrigin, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("APP_URL", appOrigin);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL_URL", "");
  const query = { select: mocks.select, eq: mocks.eq, order: mocks.order, limit: mocks.limit, maybeSingle: mocks.maybeSingle };
  mocks.createClient.mockReturnValue({ auth: { getUser: mocks.getUser, getSession: mocks.getSession }, rpc: mocks.rpc, from: mocks.from });
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId, email: "owner@example.com", email_confirmed_at: "2026-11-01", is_anonymous: false } }, error: null });
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: "verified-session-token", user: { id: userId } } }, error: null });
  mocks.rpc.mockResolvedValue({ data: [saved()], error: null });
  mocks.from.mockReturnValue(query); mocks.select.mockReturnValue(query); mocks.eq.mockReturnValue(query); mocks.order.mockReturnValue(query);
  mocks.limit.mockResolvedValue({ data: [], error: null }); mocks.maybeSingle.mockResolvedValue({ data: saved(), error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("cloud authentication and origin boundary", () => {
  it.each(["", "Basic fake", "Bearer token,other", "Bearer token trailing", "Bearer "])("rejects malformed authorization %j", async (authorization) => {
    const response = await listWorkspaces(request("GET", undefined, { Authorization: authorization }));
    expect(response.status).toBe(401); expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("verifies the bearer token at Supabase Auth and passes it through to RLS", async () => {
    await listWorkspaces(request());
    expect(mocks.getUser).toHaveBeenCalledWith("verified-session-token");
    expect(mocks.createClient.mock.calls[0][2].global.headers.Authorization).toBe("Bearer verified-session-token");
    expect(mocks.createClient.mock.calls[0][2].auth.persistSession).toBe(false);
    expect(mocks.eq).toHaveBeenCalledWith("owner_id", userId);
  });
  it("rejects an invalid token before any database access", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    expect((await listWorkspaces(request())).status).toBe(401); expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([{ email: "a@example.com", email_confirmed_at: null }, { email: null, email_confirmed_at: "date", is_anonymous: true }])("requires a verified nonanonymous account", async (user) => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId, ...user } }, error: null });
    const response = await listWorkspaces(request()); expect(response.status).toBe(403); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not let a spoofed Host grant an origin", async () => {
    const response = await listWorkspaces(request("GET", undefined, { Origin: "https://attacker.example", Host: "attacker.example", "X-Forwarded-Host": "attacker.example" }));
    expect(response.status).toBe(403); expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("does not trust null origins", async () => expect((await listWorkspaces(request("GET", undefined, { Origin: "null" }))).status).toBe(403));
  it("requires production origin configuration for browser requests", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_URL", "");
    expect((await listWorkspaces(request())).status).toBe(503);
  });
  it("allows authenticated non-browser requests without cookies or origin", async () => {
    const req = new Request(`${appOrigin}/api/workspaces`, { headers: { Authorization: "Bearer valid" } });
    expect((await listWorkspaces(req)).status).toBe(200);
  });
  it.each(["sb_secret_bad", `x.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.x`, "garbage"])("rejects privileged or invalid configured keys", async (key) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
    expect((await listWorkspaces(request())).status).toBe(503); expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("accepts a legacy anon key without treating its payload as user authentication", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", `x.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.x`);
    expect((await listWorkspaces(request())).status).toBe(200); expect(mocks.getUser).toHaveBeenCalledOnce();
  });
  it("disables shared caching for every response", async () => {
    const response = await listWorkspaces(request());
    expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("vary")).toContain("Authorization");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("validated cloud storage and concurrency", () => {
  it("creates validated personal records without trusting owner data from the client", async () => {
    const response = await createWorkspace(request("POST", { workspace: fixture() }));
    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("save_workspace", { p_id: null, p_data: fixture(), p_expected_version: null });
    expect((await response.json()).workspace.mode).toBe("personal");
  });
  it("requires a version for updates and forwards it to atomic save", async () => {
    const response = await updateWorkspace(request("PATCH", { workspace: fixture(), expectedVersion: 7 }), id);
    expect(response.status).toBe(200); expect(mocks.rpc.mock.calls[0][1].p_expected_version).toBe(7);
  });
  it.each([undefined, null, 0, -1, 1.5, "1", 2 ** 53])("rejects invalid expected versions %s", async expectedVersion => {
    expect((await updateWorkspace(request("PATCH", { workspace: fixture(), expectedVersion }), id)).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses atomic version-aware deletion", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id }], error: null });
    expect((await deleteWorkspace(request("DELETE", { expectedVersion: 3 }), id)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("delete_workspace", { p_id: id, p_expected_version: 3 });
  });
  it("scopes detail reads by the verified account, never by a supplied owner", async () => {
    expect((await getWorkspace(request(), id)).status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith("owner_id", userId); expect(mocks.eq).toHaveBeenCalledWith("id", id);
  });
  it("does not expose whether another user's id exists", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await getWorkspace(request(), id)).status).toBe(404);
  });
  it.each(["invalid", "../workspaces", `${id}?owner_id=other`])("rejects invalid identifiers %s", async bad => {
    expect((await getWorkspace(request(), bad)).status).toBe(400); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("keeps sample records out of cloud accounts", async () => {
    const response = await createWorkspace(request("POST", { workspace: createSampleWorkspace() }));
    expect(response.status).toBe(400); expect((await response.json()).error).toBe("sample_not_saved"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { ...fixture(), totalTaxCents: 1 },
    { ...fixture(), profile: { ...fixture().profile, adultUS: "true" } },
    { ...fixture(), rows: [{ amountCents: "5" }] },
  ])("rejects derived or malformed data before writing", async workspace => {
    expect((await createWorkspace(request("POST", { workspace }))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects owner_id and other unsupported envelope fields", async () => {
    expect((await createWorkspace(request("POST", { workspace: fixture(), owner_id: "other" }))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON atomically", async () => {
    const req = new Request(`${appOrigin}/api/workspaces`, { method: "POST", headers: { Authorization: "Bearer valid", "Content-Type": "application/json" }, body: "{" });
    expect((await createWorkspace(req)).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects non-JSON forms", async () => {
    expect((await createWorkspace(request("POST", {}, { "Content-Type": "text/plain" }))).status).toBe(415); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("enforces actual stream bytes without trusting Content-Length", async () => {
    const req = new Request(`${appOrigin}/api/workspaces`, { method: "POST", headers: { Authorization: "Bearer valid", "Content-Type": "application/json", "Content-Length": "1" }, body: '"' + "x".repeat(MAX_REQUEST_BYTES + 1) + '"' });
    expect((await createWorkspace(req)).status).toBe(413); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([["PT409", 409, "version_conflict"], ["40001", 409, "version_conflict"], ["42501", 404, "not_found"], ["22023", 400, "invalid_workspace"], ["54000", 409, "workspace_limit"], ["P0429", 429, "write_rate_limit"], ["XX000", 503, "storage_unavailable"]])("maps database code %s without leaking details", async (code, status, error) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "private record or database detail" } });
    const response = await createWorkspace(request("POST", { workspace: fixture() }));
    expect(response.status).toBe(status); const body = await response.json(); expect(body.error).toBe(error); expect(body.message).not.toContain("private record");
    if (status === 429) expect(response.headers.get("retry-after")).toBe("60");
  });
});

describe("browser token forwarding", () => {
  it("refuses arbitrary URLs before accessing a session", async () => {
    const { cloudFetch } = await import("../lib/cloud-client");
    await expect(cloudFetch("https://attacker.example/api/workspaces")).rejects.toThrow("Unsupported cloud endpoint");
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
  it("uses the Bearer token and does not transmit cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ workspaces: [] })); vi.stubGlobal("fetch", fetchMock);
    const { cloudFetch } = await import("../lib/cloud-client");
    await cloudFetch("/api/workspaces");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/workspaces");
    expect(fetchMock.mock.calls[0][1].credentials).toBe("omit");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer verified-session-token");
  });
  it("refuses to send an old account's workspace after an account switch", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const { cloudFetch } = await import("../lib/cloud-client");
    await expect(cloudFetch("/api/workspaces", { method: "POST", body: { workspace: fixture() }, expectedUserId: "previous-account" })).rejects.toMatchObject({ code: "session_changed", status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("account self-deletion", () => {
  it("verifies the session and calls only the self-deletion RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const response = await deleteAccount(request("DELETE", { confirmEmail: "  OWNER@EXAMPLE.COM  " }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ deleted: true });
    expect(mocks.getUser).toHaveBeenCalledWith("verified-session-token");
    expect(mocks.rpc).toHaveBeenCalledWith("delete_own_account", { p_confirm_email: "owner@example.com" });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([{}, { confirmEmail: "" }, { confirmEmail: 123 }, { confirmEmail: "x".repeat(255) }, { confirmEmail: "other@example.com" }])("rejects missing or incorrect confirmation without disclosing the real email", async body => {
    const response = await deleteAccount(request("DELETE", body));
    expect(response.status).toBe(400); expect(JSON.stringify(await response.json())).not.toContain("owner@example.com"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not accept a client-selected user or freshness claim", async () => {
    const response = await deleteAccount(request("DELETE", { confirmEmail: "owner@example.com", userId: "victim", passwordVerifiedAt: Date.now() }));
    expect(response.status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects unauthorized deletion before database access", async () => {
    const response = await deleteAccount(request("DELETE", { confirmEmail: "owner@example.com" }, { Authorization: "" }));
    expect(response.status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("enforces the same exact origin boundary", async () => {
    const response = await deleteAccount(request("DELETE", { confirmEmail: "owner@example.com" }, { Origin: "https://attacker.example" }));
    expect(response.status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("translates database rejection of an old password sign-in to a reauthentication request", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "28000", message: "owner@example.com has stale password AMR" } });
    const response = await deleteAccount(request("DELETE", { confirmEmail: "owner@example.com" }));
    expect(response.status).toBe(403); const body = await response.json();
    expect(body.error).toBe("reauthentication_required"); expect(body.message).not.toContain("owner@example.com");
  });
  it("does not leak provider permission errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Private account detail owner@example.com" } });
    const response = await deleteAccount(request("DELETE", { confirmEmail: "owner@example.com" }));
    expect(response.status).toBe(403); const body = await response.json(); expect(body.error).toBe("account_deletion_forbidden"); expect(body.message).not.toContain("owner@example.com");
  });
  it("bounds the small confirmation body", async () => {
    const response = await deleteAccount(request("DELETE", { confirmEmail: "x".repeat(3000) }));
    expect(response.status).toBe(413); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not report a successful deletion on a provider failure", async () => {
    mocks.rpc.mockRejectedValue(new Error("Sensitive database error"));
    const response = await deleteAccount(request("DELETE", { confirmEmail: "owner@example.com" }));
    expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("deleted");
  });
});
