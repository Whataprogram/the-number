-- Expected optimistic-concurrency conflicts are HTTP 409, not transient 5xx.
-- PostgREST documents PTxyz SQLSTATEs for explicit HTTP status responses.
-- Preserve the owner predicates, validation, quotas and transaction locks.
begin;
create or replace function public.save_workspace(p_id uuid, p_data jsonb, p_expected_version integer)
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
      raise exception 'Workspace ID unavailable; reload before saving' using errcode = 'PT409';
    end;
  else
    select w.version into current_version from public.workspaces w
      where w.id = target_id and w.owner_id = actor for update;
    if not found then raise exception 'Workspace unavailable' using errcode = '42501'; end if;
    if current_version <> p_expected_version then
      raise exception 'Workspace changed; reload or keep a separate copy' using errcode = 'PT409';
    end if;
    if current_version = 2147483647 then raise exception 'Workspace version limit reached' using errcode = '54000'; end if;
    return query update public.workspaces as w set data = p_data,version = w.version + 1,updated_at = clock_timestamp()
      where w.id = target_id and w.owner_id = actor and w.version = p_expected_version
      returning w.id,w.data,w.version,w.created_at,w.updated_at;
  end if;
end;
$$;

create or replace function public.delete_workspace(p_id uuid,p_expected_version integer)
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
  if current_version <> p_expected_version then raise exception 'Workspace changed; reload before deleting' using errcode = 'PT409'; end if;
  return query delete from public.workspaces as w where w.id = p_id and w.owner_id = actor and w.version = p_expected_version returning w.id;
end;
$$;

revoke all on function public.save_workspace(uuid,jsonb,integer) from public,anon,authenticated;
revoke all on function public.delete_workspace(uuid,integer) from public,anon,authenticated;
grant execute on function public.save_workspace(uuid,jsonb,integer) to authenticated;
grant execute on function public.delete_workspace(uuid,integer) to authenticated;


commit;
