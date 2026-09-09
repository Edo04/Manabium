-- Manabium: ログイン中の本人に必要な非公開情報と管理者判定を安全に取得する修復migration
-- 既存データは変更・削除しません。Supabase SQL Editorで全文を実行してください。

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

-- 旧RPCを利用するデプロイとの移行期間にも権限エラーを起こさないよう、必要最小限の実行権限を修復します。
revoke all on function private.is_admin(uuid) from public, anon, authenticated;
revoke all on function private.get_my_profile_analytics_fields() from public, anon, authenticated;
grant execute on function private.is_admin(uuid) to authenticated, service_role;
grant execute on function private.get_my_profile_analytics_fields() to authenticated;

-- 引数を受け取らず、JWTの本人についてだけ卒業予定年と管理者か否かを返します。
-- SECURITY DEFINERのsearch_pathを空に固定し、任意ユーザーや管理者レコードそのものは返しません。
create or replace function public.get_my_session_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.role() <> 'authenticated' or auth.uid() is null then '{}'::jsonb
    else jsonb_build_object(
      'graduation_year', (
        select p.graduation_year
        from public.profiles p
        where p.user_id = auth.uid()
      ),
      'is_admin', exists (
        select 1
        from public.app_user_roles r
        where r.user_id = auth.uid() and r.role = 'admin'
      )
    )
  end;
$$;

revoke all on function public.get_my_session_context() from public, anon, authenticated;
grant execute on function public.get_my_session_context() to authenticated;

-- 旧い分離RPCも移行中の既存クライアントとCloudflare Functionsが利用できる状態へ戻します。
revoke all on function public.is_current_user_admin() from public, anon, authenticated;
revoke all on function public.get_my_profile_analytics_fields() from public, anon, authenticated;
grant execute on function public.is_current_user_admin() to authenticated;
grant execute on function public.get_my_profile_analytics_fields() to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.get_my_session_context()', 'execute') then
    raise exception 'Security check failed: anon can execute get_my_session_context';
  end if;
  if not has_function_privilege('authenticated', 'public.get_my_session_context()', 'execute') then
    raise exception 'Security check failed: authenticated cannot execute get_my_session_context';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'graduation_year', 'select') then
    raise exception 'Security check failed: private profile column is directly readable';
  end if;
  if has_table_privilege('authenticated', 'public.app_user_roles', 'select') then
    raise exception 'Security check failed: admin role records are directly readable';
  end if;
end $$;

commit;

select pg_notify('pgrst', 'reload schema');

select
  p.prosecdef as session_context_security_definer,
  has_function_privilege('anon', 'public.get_my_session_context()', 'execute') as anon_can_execute,
  has_function_privilege('authenticated', 'public.get_my_session_context()', 'execute') as authenticated_can_execute,
  has_column_privilege('authenticated', 'public.profiles', 'graduation_year', 'select') as graduation_year_directly_readable,
  has_table_privilege('authenticated', 'public.app_user_roles', 'select') as admin_roles_directly_readable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_my_session_context' and p.pronargs = 0;
