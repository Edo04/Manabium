-- 管理者RPCをCloudflare Pages Functionsからのみ実行できるようにする追加SQLです。
-- 既存データやテーブルは削除しません。Supabase SQL Editorで全文を1回実行してください。

begin;

-- 管理者判定自体は昇格権限を必要としないため、呼び出し元権限で実行します。
alter function public.is_current_user_admin() security invoker;

-- 既存の集計本体を保ったまま、関数内の認可をservice_role専用へ変更します。
do $$
declare
  function_definition text;
  old_guard constant text := 'if not private.is_admin(auth.uid()) then raise exception ''Admin access required'' using errcode = ''42501''; end if;';
  new_guard constant text := 'if auth.role() <> ''service_role'' then raise exception ''Server access required'' using errcode = ''42501''; end if;';
begin
  select pg_get_functiondef('public.admin_analytics_dashboard(date,date,text)'::regprocedure)
    into function_definition;

  if position(new_guard in function_definition) > 0 then
    null;
  elsif position(old_guard in function_definition) > 0 then
    function_definition := replace(function_definition, old_guard, new_guard);
    execute function_definition;
  else
    raise exception 'admin_analytics_dashboard has an unexpected definition; migration stopped without changing privileges';
  end if;
end $$;

-- 旧シグネチャは一般ユーザーから呼べる可能性があるため削除します。
drop function if exists public.admin_moderate_content(text, uuid, text, text);
drop function if exists public.admin_resolve_report(uuid, text, text);
drop function if exists public.admin_set_user_status(uuid, text, text, timestamptz);

create or replace function public.admin_moderate_content(
  p_admin_user_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' or not private.is_admin(p_admin_user_id) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_status not in ('visible', 'hidden') then raise exception 'Invalid moderation status'; end if;
  if p_target_type = 'post' then
    update public.posts set moderation_status = p_status, moderation_note = left(p_note, 1000), moderated_by = p_admin_user_id, moderated_at = now() where id = p_target_id;
  elsif p_target_type = 'reply' then
    update public.post_replies set moderation_status = p_status, moderation_note = left(p_note, 1000), moderated_by = p_admin_user_id, moderated_at = now() where id = p_target_id;
  elsif p_target_type = 'note' then
    update public.lakeside_notes set moderation_status = p_status, moderation_note = left(p_note, 1000), moderated_by = p_admin_user_id, moderated_at = now() where id = p_target_id;
  elsif p_target_type = 'note_comment' then
    update public.note_comments set moderation_status = p_status, moderation_note = left(p_note, 1000), moderated_by = p_admin_user_id, moderated_at = now() where id = p_target_id;
  else
    raise exception 'Invalid target type';
  end if;
  insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, detail)
  values (p_admin_user_id, 'moderate_content', p_target_type, p_target_id, jsonb_build_object('status', p_status, 'note', p_note));
end;
$$;

create or replace function public.admin_resolve_report(
  p_admin_user_id uuid,
  p_report_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' or not private.is_admin(p_admin_user_id) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_status not in ('reviewing', 'resolved', 'dismissed') then raise exception 'Invalid report status'; end if;
  update public.content_reports
    set status = p_status, admin_note = left(p_note, 1000), reviewed_by = p_admin_user_id, reviewed_at = now()
    where id = p_report_id;
  insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, detail)
  values (p_admin_user_id, 'resolve_report', 'report', p_report_id, jsonb_build_object('status', p_status, 'note', p_note));
end;
$$;

create or replace function public.admin_set_user_status(
  p_admin_user_id uuid,
  p_user_id uuid,
  p_status text,
  p_reason text default null,
  p_until timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' or not private.is_admin(p_admin_user_id) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_user_id = p_admin_user_id then raise exception 'Cannot suspend your own admin account'; end if;
  if private.is_admin(p_user_id) then raise exception 'Cannot suspend an admin account'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'Invalid user status'; end if;
  insert into public.user_moderation (user_id, status, reason, suspended_until, updated_by, updated_at)
  values (p_user_id, p_status, left(p_reason, 500), p_until, p_admin_user_id, now())
  on conflict (user_id) do update set
    status = excluded.status,
    reason = excluded.reason,
    suspended_until = excluded.suspended_until,
    updated_by = excluded.updated_by,
    updated_at = now();
  insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, detail)
  values (p_admin_user_id, 'set_user_status', 'user', p_user_id, jsonb_build_object('status', p_status, 'reason', p_reason, 'until', p_until));
end;
$$;

revoke all on function public.admin_analytics_dashboard(date, date, text) from public, anon, authenticated;
revoke all on function public.admin_moderate_content(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_resolve_report(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_set_user_status(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.admin_analytics_dashboard(date, date, text) to service_role;
grant execute on function public.admin_moderate_content(uuid, text, uuid, text, text) to service_role;
grant execute on function public.admin_resolve_report(uuid, uuid, text, text) to service_role;
grant execute on function public.admin_set_user_status(uuid, uuid, text, text, timestamptz) to service_role;

commit;

-- 実行結果はauthenticated側がfalse、service_role側がtrueなら正常です。
select
  has_function_privilege('authenticated', 'public.admin_analytics_dashboard(date,date,text)', 'execute') as authenticated_dashboard,
  has_function_privilege('authenticated', 'public.admin_moderate_content(uuid,text,uuid,text,text)', 'execute') as authenticated_moderation,
  has_function_privilege('authenticated', 'public.admin_resolve_report(uuid,uuid,text,text)', 'execute') as authenticated_reports,
  has_function_privilege('authenticated', 'public.admin_set_user_status(uuid,uuid,text,text,timestamptz)', 'execute') as authenticated_users,
  has_function_privilege('service_role', 'public.admin_analytics_dashboard(date,date,text)', 'execute') as service_role_dashboard,
  has_function_privilege('service_role', 'public.admin_moderate_content(uuid,text,uuid,text,text)', 'execute') as service_role_moderation,
  has_function_privilege('service_role', 'public.admin_resolve_report(uuid,uuid,text,text)', 'execute') as service_role_reports,
  has_function_privilege('service_role', 'public.admin_set_user_status(uuid,uuid,text,text,timestamptz)', 'execute') as service_role_users;
