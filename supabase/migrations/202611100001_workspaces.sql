begin;

-- Only these RPCs may change stored workspaces. Raw Data API writes are revoked
-- so a client cannot bypass validation, account quotas or optimistic concurrency.
create schema if not exists number_private;
revoke all on schema number_private from public, anon, authenticated;

create function number_private.valid_text(value jsonb, max_length integer, allow_empty boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  -- Match JavaScript's UTF-16 length and trim semantics at the API boundary.
  select coalesce(jsonb_typeof(value) = 'string'
    and char_length(value #>> '{}') + regexp_count(value #>> '{}',U&'[\+010000-\+10FFFF]') <= max_length
    and (allow_empty or char_length(btrim(value #>> '{}',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) > 0), false);
$$;

create function number_private.valid_integer(value jsonb, minimum numeric, maximum numeric)
returns boolean language plpgsql immutable set search_path = '' as $$
declare n numeric;
begin
  if jsonb_typeof(value) is distinct from 'number' then return false; end if;
  n := (value #>> '{}')::numeric;
  return n between minimum and maximum and trunc(n) = n;
exception when others then return false;
end;
$$;

create function number_private.valid_date(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare date_text text;
begin
  if jsonb_typeof(value) is distinct from 'string' then return false; end if;
  date_text := value #>> '{}';
  if date_text !~ '^(19[0-9]{2}|20[0-9]{2}|2100)-[0-9]{2}-[0-9]{2}$' then return false; end if;
  perform date_text::date;
  return true;
exception when others then return false;
end;
$$;

-- A second validation boundary for callers who bypass the Next.js API. This
-- admits primitive records only, never client-supplied readiness/tax results.
create function number_private.valid_workspace_payload(payload jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  profile jsonb;
  record_data jsonb;
  batch jsonb;
  flag text;
  amount numeric;
  absolute_total numeric := 0;
  reviewed boolean;
  treatment text;
  required_keys text[] := array['schemaVersion','id','mode','title','profile','rows','imports','revision'];
  profile_keys text[] := array['taxYear','throughDate','adultUS','singleSoleProprietor','noOtherIncome','notDependent','cashBasis','coverageComplete'];
  record_keys text[] := array['id','date','description','amountCents','source','sourceId','batchId','treatment','reviewed','expenseCategory','paymentYear','paymentPurpose','note'];
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or octet_length(payload::text) > 4194304 then return false; end if;
  if not (payload ?& required_keys) or payload - required_keys <> '{}'::jsonb then return false; end if;
  if payload->'schemaVersion' <> '1'::jsonb or payload->'mode' <> '"personal"'::jsonb then return false; end if;
  if not number_private.valid_text(payload->'id',160)
    or not number_private.valid_text(payload->'title',200)
    or not number_private.valid_integer(payload->'revision',0,9007199254740991) then return false; end if;
  profile := payload->'profile';
  if jsonb_typeof(profile) is distinct from 'object' or not (profile ?& profile_keys)
    or profile - profile_keys <> '{}'::jsonb or profile->'taxYear' <> '2026'::jsonb
    or not number_private.valid_date(profile->'throughDate') then return false; end if;
  foreach flag in array array['adultUS','singleSoleProprietor','noOtherIncome','notDependent','cashBasis','coverageComplete'] loop
    if jsonb_typeof(profile->flag) is distinct from 'boolean' then return false; end if;
  end loop;
  if jsonb_typeof(payload->'rows') is distinct from 'array'
    or jsonb_typeof(payload->'imports') is distinct from 'array' then return false; end if;
  if jsonb_array_length(payload->'rows') > 5000 or jsonb_array_length(payload->'imports') > 5000 then return false; end if;

  for record_data in select value from jsonb_array_elements(payload->'rows') loop
    if jsonb_typeof(record_data) is distinct from 'object'
      or not (record_data ?& array['id','date','description','amountCents','source','treatment','reviewed'])
      or record_data - record_keys <> '{}'::jsonb then return false; end if;
    if not number_private.valid_text(record_data->'id',1024)
      or not number_private.valid_date(record_data->'date')
      or not number_private.valid_text(record_data->'description',2000)
      or not number_private.valid_text(record_data->'source',160)
      or not number_private.valid_integer(record_data->'amountCents',-1000000000000,1000000000000)
      or jsonb_typeof(record_data->'reviewed') is distinct from 'boolean'
      or jsonb_typeof(record_data->'treatment') is distinct from 'string'
      or not (record_data->'treatment' <@ '["review","income","expense","personal","transfer","tax_payment","unsupported"]'::jsonb) then return false; end if;
    amount := (record_data->>'amountCents')::numeric;
    if amount = 0 then return false; end if;
    absolute_total := absolute_total + abs(amount);
    if absolute_total > 9007199254740991 then return false; end if;
    foreach flag in array array['sourceId','batchId'] loop
      if record_data ? flag and not number_private.valid_text(record_data->flag,160) then return false; end if;
    end loop;
    if record_data ? 'note' and not number_private.valid_text(record_data->'note',2000,true) then return false; end if;
    if record_data ? 'expenseCategory' and (jsonb_typeof(record_data->'expenseCategory') is distinct from 'string' or not (record_data->'expenseCategory' <@ '["supplies","advertising","fees","software","other"]'::jsonb)) then return false; end if;
    if record_data ? 'paymentYear' and not number_private.valid_integer(record_data->'paymentYear',1900,2100) then return false; end if;
    if record_data ? 'paymentPurpose' and (jsonb_typeof(record_data->'paymentPurpose') is distinct from 'string' or not (record_data->'paymentPurpose' <@ '["estimated","balance","other"]'::jsonb)) then return false; end if;
    reviewed := (record_data->>'reviewed')::boolean;
    treatment := record_data->>'treatment';
    if reviewed and ((treatment = 'income' and amount < 0)
      or (treatment in ('expense','tax_payment') and amount > 0)) then return false; end if;
    if reviewed and treatment = 'expense' and not (record_data ? 'expenseCategory') then return false; end if;
    if reviewed and treatment = 'tax_payment' and not (record_data ?& array['paymentYear','paymentPurpose']) then return false; end if;
  end loop;
  if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(payload->'rows')) then return false; end if;
  for batch in select value from jsonb_array_elements(payload->'imports') loop
    if jsonb_typeof(batch) is distinct from 'object' or not (batch ?& array['id','name','fingerprint'])
      or batch - array['id','name','fingerprint'] <> '{}'::jsonb
      or not number_private.valid_text(batch->'id',160)
      or not number_private.valid_text(batch->'name',260)
      or not number_private.valid_text(batch->'fingerprint',128) then return false; end if;
  end loop;
  if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(payload->'imports')) then return false; end if;
  return true;
exception when others then return false;
end;
$$;

revoke all on all functions in schema number_private from public, anon, authenticated;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  title text generated always as (data->>'title') stored,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_payload_valid check (number_private.valid_workspace_payload(data))
);
create index workspaces_owner_updated_idx on public.workspaces(owner_id,updated_at desc,id);
alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;

create policy workspace_owner_select on public.workspaces for select to authenticated
  using ((select auth.uid()) is not null and owner_id = (select auth.uid()));
create policy workspace_owner_insert on public.workspaces for insert to authenticated
  with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));
create policy workspace_owner_update on public.workspaces for update to authenticated
  using ((select auth.uid()) is not null and owner_id = (select auth.uid()))
  with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));
create policy workspace_owner_delete on public.workspaces for delete to authenticated
  using ((select auth.uid()) is not null and owner_id = (select auth.uid()));
revoke all on public.workspaces from public, anon, authenticated;
grant select on public.workspaces to authenticated;

-- One bounded counter per account; no transaction contents or request history.
create table number_private.workspace_write_limits (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  period_started_at timestamptz not null,
  mutation_count integer not null check (mutation_count between 1 and 30)
);
alter table number_private.workspace_write_limits enable row level security;
alter table number_private.workspace_write_limits force row level security;
revoke all on number_private.workspace_write_limits from public,anon,authenticated;

create function number_private.consume_workspace_write(actor uuid)
returns void language plpgsql set search_path = '' as $$
declare window_start timestamptz; writes integer; now_at timestamptz := clock_timestamp();
begin
  -- save/delete hold the account advisory lock before entering this function.
  select l.period_started_at,l.mutation_count into window_start,writes
    from number_private.workspace_write_limits l where l.owner_id = actor;
  if not found then
    insert into number_private.workspace_write_limits values(actor,now_at,1);
  elsif window_start <= now_at - interval '60 seconds' then
    update number_private.workspace_write_limits set period_started_at = now_at,mutation_count = 1 where owner_id = actor;
  elsif writes >= 30 then
    raise exception 'write_rate_limit' using errcode = 'P0429';
  else
    update number_private.workspace_write_limits set mutation_count = mutation_count + 1 where owner_id = actor;
  end if;
end;
$$;
revoke all on function number_private.consume_workspace_write(uuid) from public,anon,authenticated;

-- SECURITY DEFINER is intentional: granting raw writes for an invoker RPC
-- would also allow clients to bypass CAS through the public Data API.
-- Every affected row is constrained by verified auth.uid(), never owner input.
create function public.save_workspace(p_id uuid, p_data jsonb, p_expected_version integer)
returns table(id uuid, data jsonb, version integer, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target_id uuid := coalesce(p_id,gen_random_uuid());
  current_version integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users u where u.id = actor and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)) then
    raise exception 'Verified account required' using errcode = '42501';
  end if;
  if not number_private.valid_workspace_payload(p_data) then
    raise exception 'Invalid personal workspace' using errcode = '22023';
  end if;
  if p_expected_version is not null and (p_expected_version < 1 or p_id is null) then
    raise exception 'A workspace ID and positive version are required for updates' using errcode = '22023';
  end if;
  -- Serialize one account's writes so concurrent creates cannot race its quota.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  perform number_private.consume_workspace_write(actor);
  if p_expected_version is null then
    if (select count(*) from public.workspaces w where w.owner_id = actor) >= 10 then
      raise exception 'Maximum ten saved workspaces per account' using errcode = '54000';
    end if;
    begin
      return query insert into public.workspaces as w (id,owner_id,data)
        values (target_id,actor,p_data)
        returning w.id,w.data,w.version,w.created_at,w.updated_at;
    exception when unique_violation then
      -- Do not disclose whether a colliding ID belongs to this or another user.
      raise exception 'Workspace ID unavailable; reload before saving' using errcode = '40001';
    end;
  else
    select w.version into current_version from public.workspaces w
      where w.id = target_id and w.owner_id = actor for update;
    if not found then raise exception 'Workspace unavailable' using errcode = '42501'; end if;
    if current_version <> p_expected_version then
      raise exception 'Workspace changed; reload or keep a separate copy' using errcode = '40001';
    end if;
    if current_version = 2147483647 then raise exception 'Workspace version limit reached' using errcode = '54000'; end if;
    return query update public.workspaces as w set data = p_data,version = w.version + 1,updated_at = clock_timestamp()
      where w.id = target_id and w.owner_id = actor and w.version = p_expected_version
      returning w.id,w.data,w.version,w.created_at,w.updated_at;
  end if;
end;
$$;

create function public.delete_workspace(p_id uuid,p_expected_version integer)
returns table(id uuid) language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); current_version integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'A workspace ID and positive version are required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  perform number_private.consume_workspace_write(actor);
  select w.version into current_version from public.workspaces w
    where w.id = p_id and w.owner_id = actor for update;
  if not found then raise exception 'Workspace unavailable' using errcode = '42501'; end if;
  if current_version <> p_expected_version then raise exception 'Workspace changed; reload before deleting' using errcode = '40001'; end if;
  return query delete from public.workspaces as w where w.id = p_id and w.owner_id = actor and w.version = p_expected_version returning w.id;
end;
$$;

revoke all on function public.save_workspace(uuid,jsonb,integer) from public,anon,authenticated;
revoke all on function public.delete_workspace(uuid,integer) from public,anon,authenticated;
grant execute on function public.save_workspace(uuid,jsonb,integer) to authenticated;
grant execute on function public.delete_workspace(uuid,integer) to authenticated;

comment on table public.workspaces is 'Owner-isolated personal records. No calculated tax results; writes only through validated versioned RPCs.';
comment on function public.save_workspace(uuid,jsonb,integer) is 'Creates with null expected version; updates only matching owner/version. Does not accept an owner argument.';
commit;
