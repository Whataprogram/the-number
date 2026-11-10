import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createEmptyWorkspace } from "../lib/engine";
const A="40000000-0000-4000-8000-000000000001", B="40000000-0000-4000-8000-000000000002";
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to anon,authenticated; grant execute on all functions in schema auth to anon,authenticated;`);
  for(const file of ['202611100001_workspaces.sql','202611100003_delete_own_account.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
},30000);
async function identity(id:string|null,amr:unknown){await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id||'',JSON.stringify({amr})]);}
const fresh=()=>[{method:'password',timestamp:Math.floor(Date.now()/1000)}];
beforeEach(async()=>{await db.exec(`reset role; delete from auth.users; insert into auth.users(id,email,email_confirmed_at) values('${A}','a@example.invalid',now()),('${B}','b@example.invalid',now());`);await identity(A,fresh());});
afterAll(async()=>{await db.close();});
it('removes only the confirmed owner and cascades its saved data',async()=>{
  await db.query('select * from public.save_workspace(null,$1,null)',[JSON.stringify(createEmptyWorkspace())]);
  await db.query("select public.delete_own_account('a@example.invalid')");
  await db.exec('reset role');
  expect((await db.query('select id from auth.users')).rows).toEqual([{id:B}]);
  expect((await db.query('select id from public.workspaces')).rows).toEqual([]);
  expect((await db.query('select owner_id from number_private.workspace_write_limits')).rows).toEqual([]);
});
it('cannot select another account by entering its email',async()=>{await expect(db.query("select public.delete_own_account('b@example.invalid')")).rejects.toMatchObject({code:'42501'});});
it.each([[],null,{},[{method:'token_refresh',timestamp:Math.floor(Date.now()/1000)}],[{method:'password',timestamp:Math.floor(Date.now()/1000)-601}],[{method:'password',timestamp:Math.floor(Date.now()/1000)+120}],[{method:'password',timestamp:'not-a-number'}]])('requires a recent signed password authentication: %j',async(amr)=>{await identity(A,amr);await expect(db.query("select public.delete_own_account('a@example.invalid')")).rejects.toMatchObject({code:'28000'});});
it('rejects unauthenticated execution',async()=>{await db.exec('reset role;set role anon');await expect(db.query("select public.delete_own_account('a@example.invalid')")).rejects.toMatchObject({code:'42501'});});
