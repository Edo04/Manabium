-- Manabium: 分析イベントRPCをログイン済み利用者だけに限定
-- Supabase Dashboard > SQL Editor > New query に全文を貼り付けてRunしてください。
-- 既存データは変更・削除しません。再実行可能です。

begin;

revoke all on function public.record_analytics_events(
  uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, boolean
) from public, anon;

grant execute on function public.record_analytics_events(
  uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, boolean
) to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');

-- anon=false、authenticated=trueなら意図した権限です。
select has_function_privilege(
  'anon',
  'public.record_analytics_events(uuid,uuid,jsonb,text,text,text,text,text,text,text,boolean,boolean)',
  'execute'
) as anon_can_record_analytics,
has_function_privilege(
  'authenticated',
  'public.record_analytics_events(uuid,uuid,jsonb,text,text,text,text,text,text,text,boolean,boolean)',
  'execute'
) as authenticated_can_record_analytics;
