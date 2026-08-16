-- 本人の卒業予定年を取得する公開RPCからSECURITY DEFINERを除去する追加SQLです。
-- 既存データやテーブルは削除しません。Supabase SQL Editorで全文を実行してください。

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

-- 非公開列を読む必要がある処理は、Data APIへ公開しないprivateスキーマに限定します。
-- 入力値を受け取らず、ログイン中の本人行だけを返します。
create or replace function private.get_my_profile_analytics_fields()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.role() <> 'authenticated' or auth.uid() is null then '{}'::jsonb
    else coalesce(
      (select jsonb_build_object('graduation_year', p.graduation_year)
       from public.profiles p
       where p.user_id = auth.uid()),
      '{}'::jsonb
    )
  end;
$$;

-- ブラウザから見えるRPC自体は呼び出し元権限で動かします。
create or replace function public.get_my_profile_analytics_fields()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_my_profile_analytics_fields();
$$;

revoke all on function private.get_my_profile_analytics_fields() from public, anon, authenticated;
revoke all on function public.get_my_profile_analytics_fields() from public, anon, authenticated;
grant execute on function private.get_my_profile_analytics_fields() to authenticated;
grant execute on function public.get_my_profile_analytics_fields() to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');

-- public_security_definer=false、anon_can_execute=false、authenticated_can_execute=trueなら正常です。
select
  p.prosecdef as public_security_definer,
  has_function_privilege('anon', 'public.get_my_profile_analytics_fields()', 'execute') as anon_can_execute,
  has_function_privilege('authenticated', 'public.get_my_profile_analytics_fields()', 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_my_profile_analytics_fields'
  and p.pronargs = 0;
