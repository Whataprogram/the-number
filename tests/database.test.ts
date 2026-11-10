import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createEmptyWorkspace } from "../lib/engine";
import type { Workspace } from "../lib/workspace-types";

const ALICE = "10000000-0000-4000-8000-000000000001";
const BOB = "10000000-0000-4000-8000-000000000002";
const UNVERIFIED = "10000000-0000-4000-8000-000000000003";
const ANONYMOUS = "10000000-0000-4000-8000-000000000004";
const FIXED_ID = "20000000-0000-4000-8000-000000000001";
type Saved = { id: string; data: Workspace; version: number; created_at: Date; updated_at: Date };
let db: PGlite;

function workspace(): Workspace {
  return { ...createEmptyWorkspace(), title: "Private test records", profile: { ...createEmptyWorkspace().profile, throughDate: "2026-11-10" } };
}
async function asUser(id: string | null, role: "authenticated" | "anon" = "authenticated") {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || ""]);
}
async function save(data: unknown = workspace(), id: string | null = null, version: number | null = null): Promise<Saved> {
  const response = await db.query<Saved>("select * from public.save_workspace($1::uuid,$2::jsonb,$3::integer)", [id, JSON.stringify(data), version]);
  return response.rows[0];
}
async function remove(id: string, version: number) {
  return db.query("select * from public.delete_workspace($1::uuid,$2::integer)", [id, version]);
}

beforeAll(async () => {
  db = new PGlite();
  // Supabase owns auth in production. This minimal fixture supplies the same
  // identity function/columns; workspace policies and RPCs are the actual SQL.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false,email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users(id,email_confirmed_at,is_anonymous) values
      ('${ALICE}',now(),false),('${BOB}',now(),false),('${UNVERIFIED}',null,false),('${ANONYMOUS}',now(),true);
  `);
  const migration = await readFile(new URL("../supabase/migrations/202611100001_workspaces.sql", import.meta.url), "utf8");
  await db.exec(migration);
  const conflictMigration = await readFile(new URL("../supabase/migrations/202611100004_conflict_status.sql", import.meta.url), "utf8");
  await db.exec(conflictMigration);
}, 30000);

beforeEach(async () => {
  await db.exec("reset role; delete from public.workspaces; delete from number_private.workspace_write_limits;");
  await asUser(ALICE);
});
afterAll(async () => { await db?.close(); });

describe("database ownership and mutation boundary (executed Postgres)", () => {
  it("stores primitive personal records and derives title/server version", async () => {
    const saved = await save();
    expect(saved.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(saved.version).toBe(1);
    expect(saved.data.mode).toBe("personal");
    const list = await db.query<{ title: string; owner_id: string }>("select title,owner_id from public.workspaces");
    expect(list.rows).toEqual([{ title: "Private test records", owner_id: ALICE }]);
  });

  it("isolates owner SELECT from another authenticated account", async () => {
    const saved = await save();
    await asUser(BOB);
    expect((await db.query("select * from public.workspaces")).rows).toEqual([]);
    expect((await db.query("select * from public.workspaces where id=$1", [saved.id])).rows).toEqual([]);
    await save({ ...workspace(), title: "Bob" });
    expect((await db.query<{ title: string }>("select title from public.workspaces")).rows).toEqual([{ title: "Bob" }]);
  });

  it("denies cross-owner save/delete and preserves the other owner's data", async () => {
    const saved = await save();
    await asUser(BOB);
    await expect(save({ ...workspace(), title: "Stolen" }, saved.id, 1)).rejects.toMatchObject({ code: "42501" });
    await expect(remove(saved.id, 1)).rejects.toMatchObject({ code: "42501" });
    await expect(save(workspace(), saved.id, null)).rejects.toMatchObject({ code: "PT409" });
    await asUser(ALICE);
    expect((await db.query<{ title: string }>("select title from public.workspaces")).rows[0].title).toBe("Private test records");
  });

  it("denies anonymous SELECT and RPC execution", async () => {
    await save();
    await asUser(null, "anon");
    await expect(db.query("select * from public.workspaces")).rejects.toMatchObject({ code: "42501" });
    await expect(save()).rejects.toMatchObject({ code: "42501" });
    await expect(remove(FIXED_ID, 1)).rejects.toMatchObject({ code: "42501" });
  });

  it.each([null, UNVERIFIED, ANONYMOUS])("rejects save without a verified nonanonymous identity: %s", async (actor) => {
    await asUser(actor);
    await expect(save()).rejects.toMatchObject({ code: "42501" });
  });

  it("prevents direct authenticated writes from bypassing RPC concurrency", async () => {
    const saved = await save();
    await expect(db.query("update public.workspaces set version=version+1 where id=$1", [saved.id])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("delete from public.workspaces where id=$1", [saved.id])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("insert into public.workspaces(owner_id,data) values($1,$2::jsonb)", [ALICE, JSON.stringify(workspace())])).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("select * from number_private.workspace_write_limits")).rejects.toMatchObject({ code: "42501" });
  });

  it("rejects a stale tab's update and stale delete without changing data", async () => {
    const first = await save();
    const second = await save({ ...workspace(), title: "Newer work" }, first.id, first.version);
    expect(second.version).toBe(2);
    await expect(save({ ...workspace(), title: "Stale work" }, first.id, first.version)).rejects.toMatchObject({ code: "PT409" });
    await expect(remove(first.id, first.version)).rejects.toMatchObject({ code: "PT409" });
    expect((await db.query<{ title: string }>("select title from public.workspaces")).rows[0].title).toBe("Newer work");
    expect((await remove(second.id, second.version)).rows).toEqual([{ id: second.id }]);
  });

  it("rejects duplicate create IDs instead of overwriting", async () => {
    await save(workspace(), FIXED_ID);
    await expect(save({ ...workspace(), title: "Overwrite" }, FIXED_ID)).rejects.toMatchObject({ code: "PT409" });
    expect((await db.query("select * from public.workspaces")).rows).toHaveLength(1);
  });

  it.each([0, -1])("rejects invalid update version %s", async (version) => {
    await expect(save(workspace(), FIXED_ID, version)).rejects.toMatchObject({ code: "22023" });
  });

  it("rejects update version without a target ID", async () => {
    await expect(save(workspace(), null, 1)).rejects.toMatchObject({ code: "22023" });
  });

  it("enforces the ten-workspace account quota and permits updates at capacity", async () => {
    const first = await save();
    for (let i = 1; i < 10; i++) await save();
    await expect(save()).rejects.toMatchObject({ code: "54000" });
    await expect(save(workspace(), first.id, first.version)).resolves.toMatchObject({ version: 2 });
    await asUser(BOB);
    await expect(save()).resolves.toMatchObject({ version: 1 });
  });

  it("enforces a bounded account write budget, including deletes", async () => {
    let saved = await save();
    for (let i = 1; i < 30; i++) saved = await save(workspace(), saved.id, saved.version);
    await expect(save(workspace(), saved.id, saved.version)).rejects.toMatchObject({ code: "P0429" });
    await expect(remove(saved.id, saved.version)).rejects.toMatchObject({ code: "P0429" });
    await db.exec("reset role; update number_private.workspace_write_limits set period_started_at=now()-interval '61 seconds';");
    await asUser(ALICE);
    await expect(remove(saved.id, saved.version)).resolves.toMatchObject({ rows: [{ id: saved.id }] });
  });

  it("cascades stored records and budget counters on account removal", async () => {
    await save();
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [ALICE]);
    expect((await db.query("select * from public.workspaces")).rows).toHaveLength(0);
    expect((await db.query("select * from number_private.workspace_write_limits")).rows).toHaveLength(0);
    await db.query("insert into auth.users(id,email_confirmed_at,is_anonymous) values($1,now(),false)", [ALICE]);
  });
});

describe("database primitive schema validation", () => {
  const invalid = [
    ["sample policy bypass", (w: Workspace) => ({ ...w, mode: "sample" })],
    ["derived tax field", (w: Workspace) => ({ ...w, taxTotal: 100 })],
    ["null mode", (w: Workspace) => ({ ...w, mode: null })],
    ["missing title", (w: Workspace) => ({ ...w, title: undefined })],
    ["whitespace-only title", (w: Workspace) => ({ ...w, title: "\u00a0\ufeff\t" })],
    ["UTF-16 overlong title", (w: Workspace) => ({ ...w, title: "😀".repeat(101) })],
    ["boolean coercion", (w: Workspace) => ({ ...w, profile: { ...w.profile, adultUS: "true" } })],
    ["invalid calendar date", (w: Workspace) => ({ ...w, profile: { ...w.profile, throughDate: "2026-02-30" } })],
    ["wrong year", (w: Workspace) => ({ ...w, profile: { ...w.profile, taxYear: 2025 } })],
    ["unsafe revision", (w: Workspace) => ({ ...w, revision: 9007199254740992 })],
    ["wrong rows shape", (w: Workspace) => ({ ...w, rows: {} })],
    ["duplicate import ID", (w: Workspace) => ({ ...w, imports: [{ id: "a", name: "a.csv", fingerprint: "x" }, { id: "a", name: "b.csv", fingerprint: "y" }] })],
  ] as const;
  it.each(invalid)("rejects %s atomically", async (_name, mutate) => {
    await expect(save(mutate(workspace()))).rejects.toMatchObject({ code: "22023" });
    expect((await db.query("select * from public.workspaces")).rows).toHaveLength(0);
  });

  const row = { id: "r1", date: "2026-10-01", description: "Work", amountCents: 12000, source: "Manual", treatment: "income", reviewed: true };
  it("stores reviewed source records without a calculated total", async () => {
    const saved = await save({ ...workspace(), rows: [row] });
    expect(saved.data.rows).toEqual([row]);
  });
  it.each([
    { amountCents: 0 }, { amountCents: 1.5 }, { amountCents: "100" }, { amountCents: 1000000000001 },
    { amountCents: -100, treatment: "income" }, { treatment: "made-up" }, { reviewed: "true" },
    { treatment: "expense", amountCents: -100 }, { treatment: "tax_payment", amountCents: -100 },
    { paymentYear: null }, { date: "2026-04-31" }, { sourceId: "" }, { source: null },
    { computedTax: 123 }, { treatment: ["income"] }, { expenseCategory: ["software"] }, { paymentPurpose: ["estimated"] },
    { expenseCategory: null }, { paymentPurpose: null },
  ])("rejects malformed row fields %j", async (fields) => {
    await expect(save({ ...workspace(), rows: [{ ...row, ...fields }] })).rejects.toMatchObject({ code: "22023" });
  });
  it("rejects duplicate internal row IDs", async () => {
    await expect(save({ ...workspace(), rows: [row, row] })).rejects.toMatchObject({ code: "22023" });
  });
  it("rejects oversized descriptions and too many records", async () => {
    await expect(save({ ...workspace(), rows: [{ ...row, description: "x".repeat(2001) }] })).rejects.toMatchObject({ code: "22023" });
    await expect(save({ ...workspace(), rows: Array.from({ length: 5001 }, (_, i) => ({ ...row, id: `r${i}` })) })).rejects.toMatchObject({ code: "22023" });
  });
  it("rejects a payload beyond the cloud limit before writing", async () => {
    const large = { ...workspace(), rows: Array.from({ length: 2300 }, (_, i) => ({ ...row, id: `r${i}`, note: "x".repeat(2000) })) };
    await expect(save(large)).rejects.toMatchObject({ code: "22023" });
    expect((await db.query("select * from public.workspaces")).rows).toHaveLength(0);
  });
  it("runs the deployable SQL smoke checks and rolls their fixtures back", async () => {
    await db.exec("reset role");
    const sql = await readFile(new URL("../supabase/tests/workspace-security.sql", import.meta.url), "utf8");
    await db.exec(sql);
    expect((await db.query("select * from auth.users where id='90000000-0000-4000-8000-000000000001'")).rows).toHaveLength(0);
  });
});
