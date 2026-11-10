-- Run as the migration administrator ONLY on a disposable local/staging
-- Supabase project after applying migrations. This transaction rolls back its
-- synthetic auth users and records; it is not a production probe.
begin;

do $$ begin
  if exists (select 1 from auth.users where id in (
    '90000000-0000-4000-8000-000000000001'::uuid,
    '90000000-0000-4000-8000-000000000002'::uuid
  )) then raise exception 'Fixture IDs already exist; choose a clean test project'; end if;
end $$;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
  ('90000000-0000-4000-8000-000000000001','database-test-a@example.invalid',now(),false),
  ('90000000-0000-4000-8000-000000000002','database-test-b@example.invalid',now(),false);

set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select * from public.save_workspace('91000000-0000-4000-8000-000000000001',
  '{"schemaVersion":1,"id":"test","mode":"personal","title":"Test A","profile":{"taxYear":2026,"throughDate":"2026-11-10","adultUS":false,"singleSoleProprietor":false,"noOtherIncome":false,"notDependent":false,"cashBasis":false,"coverageComplete":false},"rows":[],"imports":[],"revision":0}'::jsonb,null);

do $$ declare payload jsonb; begin
  select data into payload from public.workspaces where id='91000000-0000-4000-8000-000000000001';
  if payload is null then raise exception 'FAIL owner could not read its workspace'; end if;
  begin
    update public.workspaces set version=2 where id='91000000-0000-4000-8000-000000000001';
    raise exception 'FAIL raw update was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_workspace(null,payload || '{"mode":"sample"}'::jsonb,null);
    raise exception 'FAIL sample payload was accepted';
  exception when invalid_parameter_value then null; end;
  perform public.save_workspace('91000000-0000-4000-8000-000000000001',payload,1);
  begin
    perform public.save_workspace('91000000-0000-4000-8000-000000000001',payload,1);
    raise exception 'FAIL stale write was accepted';
  exception when sqlstate 'PT409' then null; end;
end $$;

select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
do $$ begin
  if exists (select 1 from public.workspaces where id='91000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL other account could read private records';
  end if;
  begin
    perform public.delete_workspace('91000000-0000-4000-8000-000000000001',2);
    raise exception 'FAIL other account could delete private records';
  exception when insufficient_privilege then null; end;
end $$;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin
    perform * from public.workspaces;
    raise exception 'FAIL unauthenticated SELECT was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_workspace('91000000-0000-4000-8000-000000000001',2);
    raise exception 'FAIL unauthenticated RPC was accepted';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select 'Workspace security smoke checks passed; test transaction is being rolled back.' as result;
rollback;

