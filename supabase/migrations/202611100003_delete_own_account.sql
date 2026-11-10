-- A signed-in person can delete only their own account after authenticating
-- with their password in the last ten minutes. Token refresh is not reauth.
create function public.delete_own_account(p_confirm_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); claims jsonb := auth.jwt(); account_email text; now_seconds numeric := extract(epoch from clock_timestamp());
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select u.email into account_email from auth.users u where u.id=actor and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false);
  if account_email is null or p_confirm_email is null or length(p_confirm_email)>254
    or lower(btrim(p_confirm_email))<>lower(account_email) then
    raise exception 'Account confirmation required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(claims->'amr')='array' then claims->'amr' else '[]'::jsonb end) a
    where a->>'method'='password' and jsonb_typeof(a->'timestamp')='number'
      and (a->>'timestamp')::numeric between now_seconds-600 and now_seconds+60
  ) then raise exception 'Sign in with your password again before deleting your account' using errcode='28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  delete from auth.users u where u.id=actor;
  if not found then raise exception 'Account unavailable' using errcode='42501'; end if;
end;
$$;
revoke all on function public.delete_own_account(text) from public,anon,authenticated;
grant execute on function public.delete_own_account(text) to authenticated;
comment on function public.delete_own_account(text) is 'Deletes only auth.uid() after matching email and recent signed password AMR; owned workspace and private counter rows cascade.';
