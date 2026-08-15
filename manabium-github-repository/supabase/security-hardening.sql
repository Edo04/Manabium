-- Manabium: テスト公開前のデータ公開範囲・RLS・関数権限の強化
-- Supabase Dashboard > SQL Editor > New query に全文を貼り付けて Run してください。
-- 既存データは削除しません。再実行可能です。

begin;

-- publicスキーマの新規オブジェクトを「明示的に許可するまで非公開」にします。
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- Authのユーザー情報はData API経由で参照させません。
revoke all on table auth.users, auth.identities from anon, authenticated;

-- SQL Editorで作った表も含め、アプリ表は必ずRLSを有効にします。
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'posts', 'post_likes', 'post_bookmarks', 'post_replies',
    'aquarium_presence', 'aquarium_preferences', 'aquarium_reactions', 'aquarium_mutes',
    'app_user_roles', 'user_moderation', 'content_reports', 'admin_audit_logs',
    'analytics_sessions', 'analytics_events', 'enterprise_organizations', 'enterprise_contents',
    'lakeside_notes', 'note_comments', 'note_bookmarks'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on table public.%I from anon, authenticated', table_name);
    end if;
  end loop;
end $$;

revoke all on all sequences in schema public from anon, authenticated;

-- 公開プロフィールはコミュニティに必要な属性だけに限定します。
grant select (user_id, grade, major, interests, fish_type, bio, created_at, updated_at)
  on table public.profiles to authenticated;
grant insert (user_id, grade, major, interests, fish_type, bio, graduation_year)
  on table public.profiles to authenticated;
grant update (grade, major, interests, fish_type, bio, graduation_year)
  on table public.profiles to authenticated;

-- 投稿の管理メモ・管理者IDはブラウザへ返しません。
grant select (
  id, user_id, title, body, category, post_type, field_tags,
  external_url, external_site_name, like_count, moderation_status, created_at, updated_at
) on table public.posts to authenticated;
grant insert (user_id, title, body, category, post_type, field_tags, external_url, external_site_name)
  on table public.posts to authenticated;
grant update (title, body, category, post_type, field_tags, external_url, external_site_name)
  on table public.posts to authenticated;
grant delete on table public.posts to authenticated;

grant select, delete on table public.post_likes to authenticated;
grant insert (post_id, user_id) on table public.post_likes to authenticated;
grant select, delete on table public.post_bookmarks to authenticated;
grant insert (post_id) on table public.post_bookmarks to authenticated;

grant select (
  id, post_id, parent_reply_id, sender_user_id, recipient_user_id,
  body, is_read, moderation_status, created_at
) on table public.post_replies to authenticated;
grant insert (post_id, parent_reply_id, sender_user_id, body)
  on table public.post_replies to authenticated;
grant update (body, is_read) on table public.post_replies to authenticated;
grant delete on table public.post_replies to authenticated;

grant select (user_id, status, focus_topic, joined_at, heartbeat_at, updated_at)
  on table public.aquarium_presence to authenticated;
grant insert (status, focus_topic) on table public.aquarium_presence to authenticated;
grant update (status, focus_topic, heartbeat_at) on table public.aquarium_presence to authenticated;
grant delete on table public.aquarium_presence to authenticated;

grant select (user_id, participate_as_fish, receive_reactions, default_status, created_at, updated_at)
  on table public.aquarium_preferences to authenticated;
grant insert (participate_as_fish, receive_reactions, default_status)
  on table public.aquarium_preferences to authenticated;
grant update (participate_as_fish, receive_reactions, default_status)
  on table public.aquarium_preferences to authenticated;

grant select (id, sender_user_id, target_user_id, post_id, note_id, message_code, created_at)
  on table public.aquarium_reactions to authenticated;
grant insert (target_user_id, message_code, post_id, note_id)
  on table public.aquarium_reactions to authenticated;

grant select, delete on table public.aquarium_mutes to authenticated;
grant insert (owner_user_id, muted_user_id) on table public.aquarium_mutes to authenticated;

-- 図書館もモデレーション用の列を一般利用者へ返しません。
grant select (
  id, user_id, note_type, title, summary, body, field_tags, feedback_type,
  external_url, external_site_name, status, moderation_status,
  published_at, created_at, updated_at
) on table public.lakeside_notes to authenticated;
grant insert (note_type, title, summary, body, field_tags, feedback_type, external_url, external_site_name, status)
  on table public.lakeside_notes to authenticated;
grant update (note_type, title, summary, body, field_tags, feedback_type, external_url, external_site_name, status)
  on table public.lakeside_notes to authenticated;
grant delete on table public.lakeside_notes to authenticated;

grant select (id, note_id, user_id, comment_type, body, moderation_status, created_at, updated_at)
  on table public.note_comments to authenticated;
grant insert (note_id, comment_type, body) on table public.note_comments to authenticated;
grant update (comment_type, body) on table public.note_comments to authenticated;
grant delete on table public.note_comments to authenticated;
grant select, delete on table public.note_bookmarks to authenticated;
grant insert (note_id) on table public.note_bookmarks to authenticated;

-- 通報は作成だけを許可し、管理メモや他人の通報は直接取得させません。
grant insert (target_type, target_id, reason, detail) on table public.content_reports to authenticated;

-- Data APIの関数は一度閉じ、ブラウザまたはFunctionsから必要なものだけを再許可します。
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function private.is_admin(uuid) to authenticated, service_role;
grant execute on function private.is_active_user(uuid) to authenticated, service_role;
grant execute on function public.is_current_user_admin() to authenticated;
grant execute on function public.get_my_profile_analytics_fields() to authenticated;
grant execute on function public.record_analytics_events(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, boolean)
  to authenticated;
grant execute on function public.admin_analytics_dashboard(date, date, text) to authenticated;
grant execute on function public.admin_moderate_content(text, uuid, text, text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, text, timestamptz) to authenticated;

-- 重要な公開範囲をSQL実行時に自己検査します。
do $$
begin
  if has_table_privilege('anon', 'public.profiles', 'select')
    or has_table_privilege('anon', 'public.posts', 'select')
    or has_table_privilege('anon', 'public.post_replies', 'select')
    or has_table_privilege('anon', 'public.lakeside_notes', 'select') then
    raise exception 'Security check failed: anon can read community tables';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'nickname', 'select')
    or has_column_privilege('authenticated', 'public.profiles', 'graduation_year', 'select')
    or has_column_privilege('authenticated', 'public.profiles', 'last_accessed_at', 'select') then
    raise exception 'Security check failed: private profile columns are readable';
  end if;
  if has_column_privilege('authenticated', 'public.posts', 'moderation_note', 'select')
    or has_column_privilege('authenticated', 'public.post_replies', 'moderation_note', 'select')
    or has_column_privilege('authenticated', 'public.lakeside_notes', 'moderation_note', 'select')
    or has_column_privilege('authenticated', 'public.note_comments', 'moderation_note', 'select') then
    raise exception 'Security check failed: moderation notes are readable';
  end if;
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array[
        'profiles', 'posts', 'post_likes', 'post_bookmarks', 'post_replies',
        'aquarium_presence', 'aquarium_preferences', 'aquarium_reactions', 'aquarium_mutes',
        'app_user_roles', 'user_moderation', 'content_reports', 'admin_audit_logs',
        'analytics_sessions', 'analytics_events', 'enterprise_organizations', 'enterprise_contents',
        'lakeside_notes', 'note_comments', 'note_bookmarks'
      ])
      and not c.relrowsecurity
  ) then
    raise exception 'Security check failed: a public table has RLS disabled';
  end if;
end $$;

commit;

select pg_notify('pgrst', 'reload schema');

-- すべてfalseなら未ログイン利用者から主要データを取得できません。
select
  has_table_privilege('anon', 'public.profiles', 'select') as anon_can_read_profiles,
  has_table_privilege('anon', 'public.posts', 'select') as anon_can_read_posts,
  has_table_privilege('anon', 'public.post_replies', 'select') as anon_can_read_replies,
  has_table_privilege('anon', 'public.lakeside_notes', 'select') as anon_can_read_notes;
