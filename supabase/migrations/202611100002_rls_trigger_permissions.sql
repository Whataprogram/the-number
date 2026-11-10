-- Supabase's optional automatic-RLS event trigger is administrative, not an API.
-- Keep it active for schema changes while removing unnecessary client execution.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
