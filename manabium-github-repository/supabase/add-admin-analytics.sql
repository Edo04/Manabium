-- Manabium 管理者・分析基盤 migration
-- Supabase Dashboard > SQL Editor で、このファイル全体を1回実行してください。
-- 既存データを削除せず、再実行しても壊れない構成です。

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

-- ============================================================
-- 1. 管理権限・利用制限・通報
-- ============================================================

create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  created_at timestamptz not null default now()
);

-- 旧版でdefault引数付きの同名関数が残っている場合、シグネチャを一本化します。
do $$
declare function_oid oid;
begin
  select p.oid into function_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'is_admin' and p.pronargs = 1;
  if function_oid is not null and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_admin_legacy' and p.pronargs = 1
  ) then
    execute 'alter function ' || function_oid::regprocedure || ' rename to is_admin_legacy';
  end if;
  function_oid := null;
  select p.oid into function_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'is_active_user' and p.pronargs = 1;
  if function_oid is not null and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_active_user_legacy' and p.pronargs = 1
  ) then
    execute 'alter function ' || function_oid::regprocedure || ' rename to is_active_user_legacy';
  end if;
end $$;

create table if not exists public.user_moderation (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended')),
  reason text check (reason is null or char_length(reason) <= 500),
  suspended_until timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'reply', 'user')),
  target_id uuid not null,
  reason text not null check (reason in ('個人情報', '嫌がらせ', '宣伝・スパム', '誤情報', '不適切な内容', 'その他')),
  detail text check (detail is null or char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_user_id, target_type, target_id)
);

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_type text,
  target_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists graduation_year smallint;
alter table public.profiles add column if not exists last_accessed_at timestamptz;
alter table public.posts add column if not exists moderation_status text not null default 'visible';
alter table public.posts add column if not exists moderation_note text;
alter table public.posts add column if not exists moderated_by uuid references auth.users(id) on delete set null;
alter table public.posts add column if not exists moderated_at timestamptz;
alter table public.post_replies add column if not exists moderation_status text not null default 'visible';
alter table public.post_replies add column if not exists moderation_note text;
alter table public.post_replies add column if not exists moderated_by uuid references auth.users(id) on delete set null;
alter table public.post_replies add column if not exists moderated_at timestamptz;

update public.posts set moderation_status = 'visible' where moderation_status not in ('visible', 'hidden') or moderation_status is null;
update public.post_replies set moderation_status = 'visible' where moderation_status not in ('visible', 'hidden') or moderation_status is null;

alter table public.profiles drop constraint if exists profiles_graduation_year_range;
alter table public.profiles add constraint profiles_graduation_year_range
  check (graduation_year is null or graduation_year between 2020 and 2100);

alter table public.posts drop constraint if exists posts_moderation_status_check;
alter table public.posts add constraint posts_moderation_status_check
  check (moderation_status in ('visible', 'hidden'));

alter table public.post_replies drop constraint if exists post_replies_moderation_status_check;
alter table public.post_replies add constraint post_replies_moderation_status_check
  check (moderation_status in ('visible', 'hidden'));

create index if not exists content_reports_status_created_idx on public.content_reports (status, created_at desc);
create index if not exists admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index if not exists profiles_graduation_year_idx on public.profiles (graduation_year);

create or replace function private.is_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_user_roles r
    where r.user_id = check_user_id and r.role = 'admin'
  );
$$;

create or replace function private.is_active_user(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select check_user_id is not null and (private.is_admin(check_user_id) or not exists (
    select 1 from public.user_moderation m
    where m.user_id = check_user_id
      and m.status = 'suspended'
      and (m.suspended_until is null or m.suspended_until > now())
  ));
$$;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin(auth.uid());
$$;

create or replace function public.get_my_profile_analytics_fields()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('graduation_year', p.graduation_year)
     from public.profiles p where p.user_id = auth.uid()),
    '{}'::jsonb
  );
$$;

revoke all on function private.is_admin(uuid) from public;
revoke all on function private.is_active_user(uuid) from public;
revoke all on function public.is_current_user_admin() from public;
revoke all on function public.get_my_profile_analytics_fields() from public;
grant execute on function private.is_admin(uuid) to authenticated, service_role;
grant execute on function private.is_active_user(uuid) to authenticated, service_role;
grant execute on function public.is_current_user_admin() to authenticated;
grant execute on function public.get_my_profile_analytics_fields() to authenticated;

-- 管理者は公開リポジトリへメールアドレスを書かず、Auth > Usersで確認したUUIDを使って
-- SQL Editorから public.app_user_roles へ手動登録してください。

-- ============================================================
-- 2. 行動ログ・企業掲載
-- ============================================================

create table if not exists public.analytics_sessions (
  session_id uuid primary key,
  visitor_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  landing_page text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  is_first_visit boolean not null default false,
  is_returning_visit boolean not null default false
);
alter table public.analytics_sessions add column if not exists is_returning_visit boolean not null default false;

create table if not exists public.enterprise_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'verified', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enterprise_contents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.enterprise_organizations(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  content_type text not null check (content_type in ('article', 'event', 'internship', 'sponsor')),
  destination_url text check (destination_url is null or (char_length(destination_url) <= 500 and destination_url ~* '^https?://')),
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  client_event_id uuid not null unique,
  session_id uuid not null references public.analytics_sessions(session_id) on delete cascade,
  visitor_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'page_view', 'content_impression', 'content_detail_view', 'external_link_click'
  )),
  page_key text check (page_key is null or char_length(page_key) <= 80),
  content_type text check (content_type is null or content_type in ('bottle', 'article', 'enterprise')),
  content_id uuid,
  enterprise_content_id uuid references public.enterprise_contents(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists analytics_sessions_user_seen_idx on public.analytics_sessions (user_id, last_seen_at desc);
create index if not exists analytics_sessions_started_idx on public.analytics_sessions (started_at desc);
create index if not exists analytics_events_occurred_idx on public.analytics_events (occurred_at desc);
create index if not exists analytics_events_user_occurred_idx on public.analytics_events (user_id, occurred_at desc);
create index if not exists analytics_events_content_idx on public.analytics_events (content_type, content_id, occurred_at desc);
create index if not exists analytics_events_enterprise_idx on public.analytics_events (enterprise_content_id, occurred_at desc);

-- 途中版の11引数RPCが残っていても、ブラウザから実行できないようにします。
do $$
declare legacy_oid oid;
begin
  select p.oid into legacy_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'record_analytics_events' and p.pronargs = 11;
  if legacy_oid is not null then execute 'revoke all on function ' || legacy_oid::regprocedure || ' from public, anon, authenticated'; end if;
end $$;

create or replace function public.record_analytics_events(
  p_session_id uuid,
  p_visitor_id uuid,
  p_events jsonb,
  p_landing_page text default null,
  p_referrer_host text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null,
  p_is_first_visit boolean default false,
  p_is_returning_visit boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  inserted_count integer := 0;
  current_user_id uuid := auth.uid();
  event_id uuid;
  event_content_id uuid;
  enterprise_id uuid;
begin
  if p_session_id is null or p_visitor_id is null then raise exception 'Invalid analytics session'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then raise exception 'Invalid analytics batch'; end if;
  if current_user_id is not null and not private.is_active_user(current_user_id) then raise exception 'Account suspended'; end if;

  insert into public.analytics_sessions (
    session_id, visitor_id, user_id, landing_page, referrer_host,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, is_first_visit, is_returning_visit
  ) values (
    p_session_id, p_visitor_id, current_user_id, left(p_landing_page, 160), left(p_referrer_host, 160),
    left(p_utm_source, 120), left(p_utm_medium, 120), left(p_utm_campaign, 160),
    left(p_utm_content, 160), left(p_utm_term, 160), coalesce(p_is_first_visit, false), coalesce(p_is_returning_visit, false)
  )
  on conflict (session_id) do update set
    user_id = coalesce(excluded.user_id, public.analytics_sessions.user_id),
    last_seen_at = now();

  for item in select value from jsonb_array_elements(p_events) limit 50 loop
    if item ->> 'event_type' not in ('page_view', 'content_impression', 'content_detail_view', 'external_link_click') then
      continue;
    end if;
    begin event_id := (item ->> 'client_event_id')::uuid; exception when others then continue; end;
    begin event_content_id := nullif(item ->> 'content_id', '')::uuid; exception when others then event_content_id := null; end;
    begin enterprise_id := nullif(item ->> 'enterprise_content_id', '')::uuid; exception when others then enterprise_id := null; end;

    insert into public.analytics_events (
      client_event_id, session_id, visitor_id, user_id, event_type, page_key,
      content_type, content_id, enterprise_content_id
    ) values (
      event_id, p_session_id, p_visitor_id, current_user_id, item ->> 'event_type',
      left(item ->> 'page_key', 80),
      case when item ->> 'content_type' in ('bottle', 'article', 'enterprise') then item ->> 'content_type' else null end,
      event_content_id, enterprise_id
    ) on conflict (client_event_id) do nothing;
    if found then inserted_count := inserted_count + 1; end if;
  end loop;

  if current_user_id is not null then
    update public.profiles set last_accessed_at = now() where user_id = current_user_id;
  end if;
  return inserted_count;
end;
$$;

-- ============================================================
-- 3. 管理者専用集計・操作関数
-- ============================================================

create or replace function public.admin_analytics_dashboard(
  p_start_date date,
  p_end_date date,
  p_granularity text default 'day'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  start_ts timestamptz;
  end_ts timestamptz;
  previous_start_ts timestamptz;
  previous_end_ts timestamptz;
  result jsonb;
begin
  if not private.is_admin(auth.uid()) then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date or p_end_date - p_start_date > 366 then
    raise exception 'Invalid analytics range';
  end if;
  if p_granularity not in ('day', 'week', 'month') then raise exception 'Invalid granularity'; end if;
  start_ts := p_start_date::timestamptz;
  end_ts := (p_end_date + 1)::timestamptz;
  previous_end_ts := start_ts;
  previous_start_ts := start_ts - (end_ts - start_ts);

  with
  current_active as (
    select distinct user_id from public.analytics_events
    where user_id is not null and occurred_at >= start_ts and occurred_at < end_ts
  ),
  previous_active as (
    select distinct user_id from public.analytics_events
    where user_id is not null and occurred_at >= previous_start_ts and occurred_at < previous_end_ts
  ),
  pre_previous_active as (
    select distinct user_id from public.analytics_events
    where user_id is not null
      and occurred_at >= previous_start_ts - (previous_end_ts - previous_start_ts)
      and occurred_at < previous_start_ts
  ),
  headline as (
    select
      (select count(*) from auth.users)::integer total_users,
      (select count(*) from auth.users where created_at >= start_ts and created_at < end_ts)::integer new_users,
      (select count(*) from auth.users where created_at >= previous_start_ts and created_at < previous_end_ts)::integer previous_new_users,
      (select count(distinct user_id) from public.analytics_events where user_id is not null and occurred_at >= p_end_date::timestamptz and occurred_at < end_ts)::integer dau,
      (select count(distinct user_id) from public.analytics_events where user_id is not null and occurred_at >= end_ts - interval '7 days' and occurred_at < end_ts)::integer wau,
      (select count(distinct user_id) from public.analytics_events where user_id is not null and occurred_at >= end_ts - interval '30 days' and occurred_at < end_ts)::integer mau,
      (select count(*) from current_active)::integer active_users,
      (select count(*) from previous_active)::integer previous_active_users,
      coalesce(round(100.0 * (select count(*) from current_active c join previous_active p using (user_id)) / nullif((select count(*) from previous_active), 0), 1), 0) retention_rate
  ),
  previous_headline as (
    select
      (select count(distinct user_id) from public.analytics_events where user_id is not null and occurred_at >= previous_end_ts - interval '1 day' and occurred_at < previous_end_ts)::integer dau,
      (select count(distinct user_id) from public.analytics_events where user_id is not null and occurred_at >= previous_end_ts - interval '7 days' and occurred_at < previous_end_ts)::integer wau,
      (select count(distinct user_id) from public.analytics_events where user_id is not null and occurred_at >= previous_end_ts - interval '30 days' and occurred_at < previous_end_ts)::integer mau,
      coalesce(round(100.0 * (select count(*) from previous_active p join pre_previous_active pp using (user_id)) / nullif((select count(*) from pre_previous_active), 0), 1), 0) retention_rate
  ),
  series_rows as (
    select
      case p_granularity
        when 'week' then date_trunc('week', occurred_at)::date
        when 'month' then date_trunc('month', occurred_at)::date
        else occurred_at::date
      end bucket,
      count(*) filter (where event_type = 'page_view')::integer page_views,
      count(distinct coalesce(user_id::text, visitor_id::text))::integer unique_users,
      count(distinct user_id) filter (where user_id is not null)::integer active_users
    from public.analytics_events
    where occurred_at >= start_ts and occurred_at < end_ts
    group by 1 order by 1
  ),
  demographic_rows as (
    select '学年' dimension, coalesce(grade, '未設定') label, count(*)::integer user_count,
      count(*) filter (where last_accessed_at >= end_ts - interval '30 days' and last_accessed_at < end_ts)::integer mau,
      count(*) filter (where last_accessed_at >= previous_end_ts - interval '30 days' and last_accessed_at < previous_end_ts)::integer previous_mau
    from public.profiles group by grade
    union all
    select '卒業予定年', coalesce(graduation_year::text, '未設定'), count(*)::integer,
      count(*) filter (where last_accessed_at >= end_ts - interval '30 days' and last_accessed_at < end_ts)::integer,
      count(*) filter (where last_accessed_at >= previous_end_ts - interval '30 days' and last_accessed_at < previous_end_ts)::integer
    from public.profiles group by graduation_year
    union all
    select '専攻分野', coalesce(nullif(major, ''), '未設定'), count(*)::integer,
      count(*) filter (where last_accessed_at >= end_ts - interval '30 days' and last_accessed_at < end_ts)::integer,
      count(*) filter (where last_accessed_at >= previous_end_ts - interval '30 days' and last_accessed_at < previous_end_ts)::integer
    from public.profiles group by major
    union all
    select '在籍区分', case
      when grade like '大学院%' then '大学院生'
      when grade like '大学%' then '学部生'
      when grade like '高校%' or grade like '中学%' then '中高生'
      else 'その他・未設定' end,
      count(*)::integer,
      count(*) filter (where last_accessed_at >= end_ts - interval '30 days' and last_accessed_at < end_ts)::integer,
      count(*) filter (where last_accessed_at >= previous_end_ts - interval '30 days' and last_accessed_at < previous_end_ts)::integer
    from public.profiles group by 2
  ),
  bottle_summary as (
    select
      (select count(*) from public.posts where created_at >= start_ts and created_at < end_ts)::integer posts,
      (select count(*) from public.post_replies where created_at >= start_ts and created_at < end_ts)::integer replies,
      (select count(*) from public.analytics_events where event_type = 'content_detail_view' and content_type = 'bottle' and occurred_at >= start_ts and occurred_at < end_ts)::integer views,
      (select count(distinct coalesce(user_id::text, visitor_id::text)) from public.analytics_events where event_type = 'content_detail_view' and content_type = 'bottle' and occurred_at >= start_ts and occurred_at < end_ts)::integer unique_viewers,
      (select count(*) from public.posts where created_at >= previous_start_ts and created_at < previous_end_ts)::integer previous_posts,
      (select count(*) from public.post_replies where created_at >= previous_start_ts and created_at < previous_end_ts)::integer previous_replies,
      (select count(*) from public.analytics_events where event_type = 'content_detail_view' and content_type = 'bottle' and occurred_at >= previous_start_ts and occurred_at < previous_end_ts)::integer previous_views,
      (select count(distinct coalesce(user_id::text, visitor_id::text)) from public.analytics_events where event_type = 'content_detail_view' and content_type = 'bottle' and occurred_at >= previous_start_ts and occurred_at < previous_end_ts)::integer previous_unique_viewers
  ),
  category_summary as (
    select p.category,
      count(*) filter (where p.created_at >= start_ts and p.created_at < end_ts)::integer posts,
      (select count(*) from public.post_replies r join public.posts rp on rp.id = r.post_id where rp.category = p.category and r.created_at >= start_ts and r.created_at < end_ts)::integer replies,
      (select count(*) from public.analytics_events e join public.posts ep on ep.id = e.content_id where ep.category = p.category and e.content_type = 'bottle' and e.event_type = 'content_detail_view' and e.occurred_at >= start_ts and e.occurred_at < end_ts)::integer views,
      (select count(distinct coalesce(e.user_id::text, e.visitor_id::text)) from public.analytics_events e join public.posts ep on ep.id = e.content_id where ep.category = p.category and e.content_type = 'bottle' and e.event_type = 'content_detail_view' and e.occurred_at >= start_ts and e.occurred_at < end_ts)::integer unique_viewers,
      count(*) filter (where p.created_at >= previous_start_ts and p.created_at < previous_end_ts)::integer previous_posts,
      (select count(*) from public.post_replies r join public.posts rp on rp.id = r.post_id where rp.category = p.category and r.created_at >= previous_start_ts and r.created_at < previous_end_ts)::integer previous_replies,
      (select count(*) from public.analytics_events e join public.posts ep on ep.id = e.content_id where ep.category = p.category and e.content_type = 'bottle' and e.event_type = 'content_detail_view' and e.occurred_at >= previous_start_ts and e.occurred_at < previous_end_ts)::integer previous_views,
      (select count(distinct coalesce(e.user_id::text, e.visitor_id::text)) from public.analytics_events e join public.posts ep on ep.id = e.content_id where ep.category = p.category and e.content_type = 'bottle' and e.event_type = 'content_detail_view' and e.occurred_at >= previous_start_ts and e.occurred_at < previous_end_ts)::integer previous_unique_viewers
    from public.posts p
    group by p.category order by p.category
  ),
  enterprise_event_counts as (
    select enterprise_content_id,
      count(*) filter (where event_type = 'content_impression')::integer impressions,
      count(distinct coalesce(user_id::text, visitor_id::text)) filter (where event_type = 'content_impression')::integer unique_viewers,
      count(*) filter (where event_type = 'content_detail_view')::integer detail_views,
      count(*) filter (where event_type = 'external_link_click')::integer clicks
    from public.analytics_events
    where enterprise_content_id is not null and occurred_at >= start_ts and occurred_at < end_ts
    group by enterprise_content_id
  ),
  previous_enterprise_event_counts as (
    select enterprise_content_id,
      count(*) filter (where event_type = 'content_impression')::integer impressions,
      count(distinct coalesce(user_id::text, visitor_id::text)) filter (where event_type = 'content_impression')::integer unique_viewers,
      count(*) filter (where event_type = 'content_detail_view')::integer detail_views,
      count(*) filter (where event_type = 'external_link_click')::integer clicks
    from public.analytics_events
    where enterprise_content_id is not null and occurred_at >= previous_start_ts and occurred_at < previous_end_ts
    group by enterprise_content_id
  ),
  enterprise_rows as (
    select c.id, c.title, c.content_type, o.name organization,
      coalesce(ec.impressions, 0) impressions, coalesce(ec.unique_viewers, 0) unique_viewers,
      coalesce(ec.detail_views, 0) detail_views, coalesce(ec.clicks, 0) clicks,
      coalesce(round(100.0 * ec.clicks / nullif(ec.impressions, 0), 2), 0) ctr,
      coalesce(pec.impressions, 0) previous_impressions, coalesce(pec.unique_viewers, 0) previous_unique_viewers,
      coalesce(pec.detail_views, 0) previous_detail_views, coalesce(pec.clicks, 0) previous_clicks,
      coalesce(round(100.0 * pec.clicks / nullif(pec.impressions, 0), 2), 0) previous_ctr
    from public.enterprise_contents c
    join public.enterprise_organizations o on o.id = c.organization_id
    left join enterprise_event_counts ec on ec.enterprise_content_id = c.id
    left join previous_enterprise_event_counts pec on pec.enterprise_content_id = c.id
    order by impressions desc, c.created_at desc
  ),
  enterprise_audience as (
    select e.enterprise_content_id content_id, '専攻分野' dimension, coalesce(nullif(p.major, ''), '未設定') label,
      count(distinct e.user_id)::integer users
    from public.analytics_events e join public.profiles p on p.user_id = e.user_id
    where e.enterprise_content_id is not null and e.occurred_at >= start_ts and e.occurred_at < end_ts
    group by e.enterprise_content_id, p.major having count(distinct e.user_id) >= 5
    union all
    select e.enterprise_content_id, '学年', coalesce(p.grade, '未設定'), count(distinct e.user_id)::integer
    from public.analytics_events e join public.profiles p on p.user_id = e.user_id
    where e.enterprise_content_id is not null and e.occurred_at >= start_ts and e.occurred_at < end_ts
    group by e.enterprise_content_id, p.grade having count(distinct e.user_id) >= 5
    union all
    select e.enterprise_content_id, '卒業予定年', coalesce(p.graduation_year::text, '未設定'), count(distinct e.user_id)::integer
    from public.analytics_events e join public.profiles p on p.user_id = e.user_id
    where e.enterprise_content_id is not null and e.occurred_at >= start_ts and e.occurred_at < end_ts
    group by e.enterprise_content_id, p.graduation_year having count(distinct e.user_id) >= 5
  ),
  traffic_summary as (
    select
      count(*) filter (where event_type = 'page_view')::integer page_views,
      count(distinct coalesce(user_id::text, visitor_id::text))::integer unique_users,
      (select count(*) from public.analytics_sessions where started_at >= start_ts and started_at < end_ts and is_first_visit)::integer new_visitors,
      (select count(*) from public.analytics_sessions where started_at >= start_ts and started_at < end_ts and is_returning_visit)::integer returning_visitors,
      (select count(*) from public.analytics_events where event_type = 'page_view' and occurred_at >= previous_start_ts and occurred_at < previous_end_ts)::integer previous_page_views,
      (select count(distinct coalesce(user_id::text, visitor_id::text)) from public.analytics_events where occurred_at >= previous_start_ts and occurred_at < previous_end_ts)::integer previous_unique_users,
      (select count(*) from public.analytics_sessions where started_at >= previous_start_ts and started_at < previous_end_ts and is_first_visit)::integer previous_new_visitors,
      (select count(*) from public.analytics_sessions where started_at >= previous_start_ts and started_at < previous_end_ts and is_returning_visit)::integer previous_returning_visitors
    from public.analytics_events where occurred_at >= start_ts and occurred_at < end_ts
  ),
  source_rows as (
    select coalesce(nullif(utm_source, ''), nullif(referrer_host, ''), 'direct') source,
      coalesce(nullif(utm_medium, ''), '—') medium,
      coalesce(nullif(utm_campaign, ''), '—') campaign,
      count(*)::integer sessions,
      count(*) filter (where is_first_visit)::integer new_visitors,
      count(*) filter (where is_returning_visit)::integer returning_visitors
    from public.analytics_sessions where started_at >= start_ts and started_at < end_ts
    group by 1, 2, 3 order by sessions desc limit 30
  ),
  user_rows as (
    select p.user_id, p.grade, p.major, p.graduation_year, p.created_at, p.last_accessed_at,
      coalesce(m.status, 'active') status
    from public.profiles p left join public.user_moderation m on m.user_id = p.user_id
    order by p.created_at desc limit 100
  ),
  report_rows as (
    select id, target_type, target_id, reason, detail, status, created_at
    from public.content_reports order by (status in ('open', 'reviewing')) desc, created_at desc limit 100
  ),
  recent_post_rows as (
    select id, title, body, category, moderation_status, created_at
    from public.posts order by created_at desc limit 50
  ),
  recent_reply_rows as (
    select id, post_id, body, moderation_status, created_at
    from public.post_replies order by created_at desc limit 50
  )
  select jsonb_build_object(
    'range', jsonb_build_object('start', p_start_date, 'end', p_end_date, 'granularity', p_granularity),
    'headline', (select to_jsonb(h) || jsonb_build_object('previous_dau', ph.dau, 'previous_wau', ph.wau, 'previous_mau', ph.mau, 'previous_retention_rate', ph.retention_rate) from headline h cross join previous_headline ph),
    'series', coalesce((select jsonb_agg(to_jsonb(s)) from series_rows s), '[]'::jsonb),
    'demographics', coalesce((select jsonb_agg(to_jsonb(d)) from demographic_rows d), '[]'::jsonb),
    'bottles', (select to_jsonb(b) from bottle_summary b),
    'categories', coalesce((select jsonb_agg(to_jsonb(c)) from category_summary c), '[]'::jsonb),
    'enterprise', coalesce((select jsonb_agg(to_jsonb(e)) from enterprise_rows e), '[]'::jsonb),
    'enterprise_audience', coalesce((select jsonb_agg(to_jsonb(a)) from enterprise_audience a), '[]'::jsonb),
    'traffic', (select to_jsonb(t) from traffic_summary t),
    'sources', coalesce((select jsonb_agg(to_jsonb(s)) from source_rows s), '[]'::jsonb),
    'users', coalesce((select jsonb_agg(to_jsonb(u)) from user_rows u), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(to_jsonb(r)) from report_rows r), '[]'::jsonb),
    'recent_posts', coalesce((select jsonb_agg(to_jsonb(p)) from recent_post_rows p), '[]'::jsonb),
    'recent_replies', coalesce((select jsonb_agg(to_jsonb(r)) from recent_reply_rows r), '[]'::jsonb),
    'privacy', jsonb_build_object('minimum_audience_cell', 5, 'individual_data_for_enterprises', false)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_moderate_content(
  p_target_type text, p_target_id uuid, p_status text, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_status not in ('visible', 'hidden') then raise exception 'Invalid moderation status'; end if;
  if p_target_type = 'post' then
    update public.posts set moderation_status = p_status, moderation_note = left(p_note, 1000), moderated_by = auth.uid(), moderated_at = now() where id = p_target_id;
  elsif p_target_type = 'reply' then
    update public.post_replies set moderation_status = p_status, moderation_note = left(p_note, 1000), moderated_by = auth.uid(), moderated_at = now() where id = p_target_id;
  else raise exception 'Invalid target type'; end if;
  insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, detail)
  values (auth.uid(), 'moderate_content', p_target_type, p_target_id, jsonb_build_object('status', p_status, 'note', p_note));
end;
$$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_status not in ('reviewing', 'resolved', 'dismissed') then raise exception 'Invalid report status'; end if;
  update public.content_reports set status = p_status, admin_note = left(p_note, 1000), reviewed_by = auth.uid(), reviewed_at = now() where id = p_report_id;
  insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, detail)
  values (auth.uid(), 'resolve_report', 'report', p_report_id, jsonb_build_object('status', p_status, 'note', p_note));
end;
$$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status text, p_reason text default null, p_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin(auth.uid()) then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_user_id = auth.uid() then raise exception 'Cannot suspend your own admin account'; end if;
  if private.is_admin(p_user_id) then raise exception 'Cannot suspend an admin account'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'Invalid user status'; end if;
  insert into public.user_moderation (user_id, status, reason, suspended_until, updated_by, updated_at)
  values (p_user_id, p_status, left(p_reason, 500), p_until, auth.uid(), now())
  on conflict (user_id) do update set status = excluded.status, reason = excluded.reason,
    suspended_until = excluded.suspended_until, updated_by = excluded.updated_by, updated_at = now();
  insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, detail)
  values (auth.uid(), 'set_user_status', 'user', p_user_id, jsonb_build_object('status', p_status, 'reason', p_reason, 'until', p_until));
end;
$$;

-- ============================================================
-- 4. RLS・権限
-- ============================================================

alter table public.app_user_roles enable row level security;
alter table public.user_moderation enable row level security;
alter table public.content_reports enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.analytics_sessions enable row level security;
alter table public.analytics_events enable row level security;
alter table public.enterprise_organizations enable row level security;
alter table public.enterprise_contents enable row level security;

drop policy if exists "Users can view their own moderation state" on public.user_moderation;
create policy "Users can view their own moderation state" on public.user_moderation for select to authenticated using (user_id = (select auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists "Admins can view roles" on public.app_user_roles;
create policy "Admins can view roles" on public.app_user_roles for select to authenticated using (private.is_admin(auth.uid()));
drop policy if exists "Admins can view audit logs" on public.admin_audit_logs;
create policy "Admins can view audit logs" on public.admin_audit_logs for select to authenticated using (private.is_admin(auth.uid()));
drop policy if exists "Admins can manage enterprise organizations" on public.enterprise_organizations;
create policy "Admins can manage enterprise organizations" on public.enterprise_organizations for all to authenticated using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));
drop policy if exists "Admins can manage enterprise contents" on public.enterprise_contents;
create policy "Admins can manage enterprise contents" on public.enterprise_contents for all to authenticated using (private.is_admin(auth.uid())) with check (private.is_admin(auth.uid()));
drop policy if exists "Users can create their own reports" on public.content_reports;
create policy "Users can create their own reports" on public.content_reports for insert to authenticated
with check (reporter_user_id = (select auth.uid()) and private.is_active_user(auth.uid()));
drop policy if exists "Users can view their own reports" on public.content_reports;
create policy "Users can view their own reports" on public.content_reports for select to authenticated
using (reporter_user_id = (select auth.uid()) or private.is_admin(auth.uid()));

-- 既存の公開ポリシーにモデレーション状態を反映します。
drop policy if exists "Authenticated users can view posts" on public.posts;
create policy "Authenticated users can view posts" on public.posts for select to authenticated
using (moderation_status = 'visible' or user_id = (select auth.uid()) or private.is_admin(auth.uid()));
drop policy if exists "Authenticated users can view all replies" on public.post_replies;
create policy "Authenticated users can view all replies" on public.post_replies for select to authenticated
using (moderation_status = 'visible' or sender_user_id = (select auth.uid()) or private.is_admin(auth.uid()));

-- 利用停止中のアカウントは、既存RLSが許可してもコミュニティ表へアクセスできません。
-- 利用停止判定は書き込み系の既存ポリシーへ制限条件として追加します。
-- PostgreSQLのrestrictive policyはUSING/WITH CHECKを操作別に扱う必要があるため、
-- 全操作一括のポリシーは使わず、下記の保護トリガーでも強制します。
create or replace function public.block_suspended_writes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and not private.is_active_user(auth.uid()) then raise exception 'Account suspended' using errcode = '42501'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','posts','post_likes','post_replies','aquarium_presence','aquarium_preferences','aquarium_reactions','aquarium_mutes'] loop
    execute format('drop trigger if exists block_suspended_writes on public.%I', table_name);
    execute format('create trigger block_suspended_writes before insert or update or delete on public.%I for each row execute function public.block_suspended_writes()', table_name);
  end loop;
end $$;

revoke all on table public.app_user_roles, public.user_moderation, public.content_reports,
  public.admin_audit_logs, public.analytics_sessions, public.analytics_events,
  public.enterprise_organizations, public.enterprise_contents from anon, authenticated;
-- 卒業予定年と最終アクセスは通常のプロフィール一覧から取得できないようにします。
revoke select on table public.profiles from authenticated;
grant select (user_id, grade, major, interests, fish_type, bio, created_at, updated_at) on table public.profiles to authenticated;
grant insert (target_type, target_id, reason, detail) on table public.content_reports to authenticated;
grant insert (graduation_year) on table public.profiles to authenticated;
grant update (graduation_year) on table public.profiles to authenticated;

revoke select on table public.posts from authenticated;
grant select (id, user_id, title, body, category, post_type, field_tags, external_url, external_site_name, like_count, moderation_status, created_at, updated_at)
  on table public.posts to authenticated;
revoke select on table public.post_replies from authenticated;
grant select (id, post_id, parent_reply_id, sender_user_id, recipient_user_id, body, is_read, moderation_status, created_at)
  on table public.post_replies to authenticated;

revoke all on function public.record_analytics_events(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, boolean) from public;
revoke execute on function public.record_analytics_events(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, boolean) from anon;
grant execute on function public.record_analytics_events(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, boolean) to authenticated;
revoke all on function public.admin_analytics_dashboard(date, date, text) from public;
revoke all on function public.admin_moderate_content(text, uuid, text, text) from public;
revoke all on function public.admin_resolve_report(uuid, text, text) from public;
revoke all on function public.admin_set_user_status(uuid, text, text, timestamptz) from public;
grant execute on function public.admin_analytics_dashboard(date, date, text) to authenticated;
grant execute on function public.admin_moderate_content(text, uuid, text, text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, text, timestamptz) to authenticated;

-- 管理者関数以外から原始ログ・企業別個票へアクセスする権限は付与しません。
-- 企業向け集計は admin_analytics_dashboard 内で5人未満の属性セルを除外します。

select pg_notify('pgrst', 'reload schema');
