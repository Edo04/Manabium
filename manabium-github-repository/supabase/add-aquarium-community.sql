-- Manabium: 水槽をリアルタイムコミュニティへ変更する追加マイグレーション
-- Supabase Dashboard > SQL Editor > New query に全文を貼り付けて Run してください。
-- 既存データを削除せず、何度実行しても同じ状態になるように作成しています。
-- 旧版のstudy_sessionsは過去データ保護のため削除しませんが、現行アプリからは読み書きしません。

begin;

-- 魚をタップした時に表示する、個人を特定しにくい短い自己紹介です。
alter table public.profiles
  add column if not exists bio text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_bio_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_bio_length
      check (bio is null or char_length(bio) <= 80);
  end if;
end $$;

-- 水槽画面を現在開いている利用者だけが1行を持ちます。
-- focus_topic は過去版との互換性のため残しますが、現行アプリは常にnullにします。
create table if not exists public.aquarium_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'social'
    check (status in ('social', 'break', 'observe')),
  focus_topic text check (focus_topic is null or char_length(focus_topic) <= 80),
  joined_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists aquarium_presence_heartbeat_idx
  on public.aquarium_presence (heartbeat_at desc);

create index if not exists aquarium_presence_status_heartbeat_idx
  on public.aquarium_presence (status, heartbeat_at desc);

-- 受信設定と既定状態はpresenceを消した後も本人用設定として残します。
-- participate_as_fish は過去版との互換性のため残し、現行アプリは常にtrueで保存します。
create table if not exists public.aquarium_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  participate_as_fish boolean not null default true,
  receive_reactions boolean not null default true,
  default_status text not null default 'social'
    check (default_status in ('social', 'break', 'observe')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 定型文だけを保存します。自由入力欄は持たせません。
create table if not exists public.aquarium_reactions (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  message_code text not null check (message_code in (
    'hello', 'starting', 'share_grade', 'share_major',
    'share_interest_1', 'share_interest_2', 'share_interest_3',
    'ask_bottle_any', 'ask_bottle_class', 'ask_bottle_research', 'ask_bottle_career', 'ask_bottle_event',
    'share_bottle_mine', 'share_bottle_recommend',
    'good_work', 'taking_break',
    'together', 'same_field', 'support', 'interesting', 'recommend_bottle_direct', 'good_work_direct'
  )),
  created_at timestamptz not null default now(),
  constraint aquarium_reaction_not_self check (
    target_user_id is null or sender_user_id <> target_user_id
  )
);

alter table public.aquarium_reactions
  add column if not exists post_id uuid references public.posts(id) on delete cascade;
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.aquarium_reactions'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%message_code%'
  loop
    execute format('alter table public.aquarium_reactions drop constraint %I', constraint_name);
  end loop;
end $$;
update public.aquarium_reactions
set message_code = case message_code
  when 'new_bottle' then 'ask_bottle_any'
  when 'question_bottle' then 'ask_bottle_any'
  when 'info_bottle' then 'ask_bottle_any'
  when 'view_bottles' then 'recommend_bottle_direct'
  else message_code
end
where message_code in ('new_bottle', 'question_bottle', 'info_bottle', 'view_bottles');
alter table public.aquarium_reactions
  add constraint aquarium_reactions_message_code_check check (message_code in (
    'hello', 'starting', 'share_grade', 'share_major',
    'share_interest_1', 'share_interest_2', 'share_interest_3',
    'ask_bottle_any', 'ask_bottle_class', 'ask_bottle_research', 'ask_bottle_career', 'ask_bottle_event',
    'share_bottle_mine', 'share_bottle_recommend',
    'good_work', 'taking_break',
    'together', 'same_field', 'support', 'interesting', 'recommend_bottle_direct', 'good_work_direct'
  ));

create index if not exists aquarium_reactions_created_idx
  on public.aquarium_reactions (created_at desc);

create index if not exists aquarium_reactions_sender_created_idx
  on public.aquarium_reactions (sender_user_id, created_at desc);

create index if not exists aquarium_reactions_target_created_idx
  on public.aquarium_reactions (target_user_id, created_at desc);
create index if not exists aquarium_reactions_post_created_idx
  on public.aquarium_reactions (post_id, created_at desc)
  where post_id is not null;

-- owner_user_id本人の画面からだけ参照・変更できるミュート一覧です。
create table if not exists public.aquarium_mutes (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  muted_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_user_id, muted_user_id),
  constraint aquarium_mute_not_self check (owner_user_id <> muted_user_id)
);

-- heartbeatとuser_idはクライアントが偽装できないようDB側で決めます。
create or replace function public.prepare_aquarium_presence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  new.user_id := auth.uid();
  new.heartbeat_at := now();
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.joined_at := old.joined_at;
  end if;
  new.focus_topic := null;
  return new;
end;
$$;

drop trigger if exists aquarium_presence_prepare on public.aquarium_presence;
create trigger aquarium_presence_prepare
before insert or update on public.aquarium_presence
for each row execute function public.prepare_aquarium_presence();

create or replace function public.prepare_aquarium_preferences()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  new.user_id := auth.uid();
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists aquarium_preferences_prepare on public.aquarium_preferences;
create trigger aquarium_preferences_prepare
before insert or update on public.aquarium_preferences
for each row execute function public.prepare_aquarium_preferences();

-- 定型文の種類・在室状態・受信設定・ミュート・クールダウンをDBでも検証します。
create or replace function public.validate_aquarium_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_status text;
  target_status text;
  target_accepts boolean;
  shared_post_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  new.sender_user_id := auth.uid();
  new.created_at := now();

  select p.status into sender_status
  from public.aquarium_presence p
  where p.user_id = auth.uid()
    and p.heartbeat_at > now() - interval '90 seconds';

  if sender_status is null then
    raise exception 'You are not active in the aquarium';
  end if;

  if new.target_user_id is null then
    if new.message_code not in (
      'hello', 'starting', 'share_grade', 'share_major',
      'share_interest_1', 'share_interest_2', 'share_interest_3',
      'ask_bottle_any', 'ask_bottle_class', 'ask_bottle_research', 'ask_bottle_career', 'ask_bottle_event',
      'share_bottle_mine', 'share_bottle_recommend',
      'good_work', 'taking_break'
    ) then
      raise exception 'Invalid aquarium-wide message';
    end if;
    if new.message_code in ('share_bottle_mine', 'share_bottle_recommend') then
      if new.post_id is null then raise exception 'Bottle share requires a post'; end if;
      select p.user_id into shared_post_owner from public.posts p where p.id = new.post_id;
      if shared_post_owner is null then raise exception 'Shared bottle was not found'; end if;
      if new.message_code = 'share_bottle_mine' and shared_post_owner <> auth.uid() then
        raise exception 'Only your own bottle can be shared as yours';
      end if;
      if new.message_code = 'share_bottle_recommend' and shared_post_owner = auth.uid() then
        raise exception 'Use own bottle sharing for your post';
      end if;
    elsif new.post_id is not null then
      raise exception 'This message cannot attach a bottle';
    end if;
    if exists (
      select 1 from public.aquarium_reactions r
      where r.sender_user_id = auth.uid()
        and r.created_at > now() - interval '4 seconds'
    ) then
      raise exception 'Reaction cooldown';
    end if;
    if new.post_id is not null and exists (
      select 1 from public.aquarium_reactions r
      where r.sender_user_id = auth.uid()
        and r.post_id = new.post_id
        and r.created_at > now() - interval '10 minutes'
    ) then
      raise exception 'Bottle share cooldown';
    end if;
  else
    if new.target_user_id = auth.uid() then
      raise exception 'Cannot react to yourself';
    end if;
    if new.message_code not in ('together', 'same_field', 'support', 'interesting', 'recommend_bottle_direct', 'good_work_direct') then
      raise exception 'Invalid direct reaction';
    end if;
    if new.post_id is not null then raise exception 'Direct reactions cannot attach a bottle'; end if;

    select p.status into target_status
    from public.aquarium_presence p
    where p.user_id = new.target_user_id
      and p.heartbeat_at > now() - interval '90 seconds';

    if target_status is null then
      raise exception 'Target is not active in the aquarium';
    end if;
    if target_status = 'observe' then
      raise exception 'Target is observing only';
    end if;
    select coalesce(pref.receive_reactions, true) into target_accepts
    from (select 1) seed
    left join public.aquarium_preferences pref
      on pref.user_id = new.target_user_id;

    if not target_accepts then
      raise exception 'Target is not receiving reactions';
    end if;
    if exists (
      select 1 from public.aquarium_mutes m
      where (m.owner_user_id = new.target_user_id and m.muted_user_id = auth.uid())
         or (m.owner_user_id = auth.uid() and m.muted_user_id = new.target_user_id)
    ) then
      raise exception 'Reaction is muted';
    end if;
    if exists (
      select 1 from public.aquarium_reactions r
      where r.sender_user_id = auth.uid()
        and r.target_user_id = new.target_user_id
        and r.created_at > now() - interval '10 seconds'
    ) then
      raise exception 'Reaction target cooldown';
    end if;
    if exists (
      select 1 from public.aquarium_reactions r
      where r.sender_user_id = auth.uid()
        and r.created_at > now() - interval '3 seconds'
    ) then
      raise exception 'Reaction cooldown';
    end if;
  end if;

  -- 定型文は一時表示だけなので、古い行を少しずつ掃除します。
  delete from public.aquarium_reactions
  where created_at < now() - interval '1 day';

  return new;
end;
$$;

drop trigger if exists aquarium_reactions_validate on public.aquarium_reactions;
create trigger aquarium_reactions_validate
before insert on public.aquarium_reactions
for each row execute function public.validate_aquarium_reaction();

alter table public.aquarium_presence enable row level security;
alter table public.aquarium_preferences enable row level security;
alter table public.aquarium_reactions enable row level security;
alter table public.aquarium_mutes enable row level security;

drop policy if exists "Authenticated users can view active aquarium presence" on public.aquarium_presence;
create policy "Authenticated users can view active aquarium presence"
on public.aquarium_presence for select
to authenticated
using (heartbeat_at > now() - interval '90 seconds');

drop policy if exists "Users can create their own aquarium presence" on public.aquarium_presence;
create policy "Users can create their own aquarium presence"
on public.aquarium_presence for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own aquarium presence" on public.aquarium_presence;
create policy "Users can update their own aquarium presence"
on public.aquarium_presence for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own aquarium presence" on public.aquarium_presence;
create policy "Users can delete their own aquarium presence"
on public.aquarium_presence for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own aquarium preferences" on public.aquarium_preferences;
create policy "Users can view their own aquarium preferences"
on public.aquarium_preferences for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own aquarium preferences" on public.aquarium_preferences;
create policy "Users can create their own aquarium preferences"
on public.aquarium_preferences for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own aquarium preferences" on public.aquarium_preferences;
create policy "Users can update their own aquarium preferences"
on public.aquarium_preferences for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Authenticated users can view recent aquarium reactions" on public.aquarium_reactions;
create policy "Authenticated users can view recent aquarium reactions"
on public.aquarium_reactions for select
to authenticated
using (created_at > now() - interval '6 hours');

drop policy if exists "Users can send aquarium reactions as themselves" on public.aquarium_reactions;
create policy "Users can send aquarium reactions as themselves"
on public.aquarium_reactions for insert
to authenticated
with check ((select auth.uid()) = sender_user_id);

drop policy if exists "Users can view their own aquarium mutes" on public.aquarium_mutes;
create policy "Users can view their own aquarium mutes"
on public.aquarium_mutes for select
to authenticated
using ((select auth.uid()) = owner_user_id);

drop policy if exists "Users can create their own aquarium mutes" on public.aquarium_mutes;
create policy "Users can create their own aquarium mutes"
on public.aquarium_mutes for insert
to authenticated
with check ((select auth.uid()) = owner_user_id and owner_user_id <> muted_user_id);

drop policy if exists "Users can remove their own aquarium mutes" on public.aquarium_mutes;
create policy "Users can remove their own aquarium mutes"
on public.aquarium_mutes for delete
to authenticated
using ((select auth.uid()) = owner_user_id);

revoke all on table public.aquarium_presence from anon, authenticated;
revoke all on table public.aquarium_preferences from anon, authenticated;
revoke all on table public.aquarium_reactions from anon, authenticated;
revoke all on table public.aquarium_mutes from anon, authenticated;

grant select (user_id, status, focus_topic, joined_at, heartbeat_at, updated_at)
  on table public.aquarium_presence to authenticated;
grant delete on table public.aquarium_presence to authenticated;
grant insert (status, focus_topic) on table public.aquarium_presence to authenticated;
grant update (status, focus_topic, heartbeat_at) on table public.aquarium_presence to authenticated;

grant select (user_id, participate_as_fish, receive_reactions, default_status, created_at, updated_at)
  on table public.aquarium_preferences to authenticated;
grant insert (participate_as_fish, receive_reactions, default_status) on table public.aquarium_preferences to authenticated;
grant update (participate_as_fish, receive_reactions, default_status) on table public.aquarium_preferences to authenticated;

grant select (id, sender_user_id, target_user_id, post_id, message_code, created_at)
  on table public.aquarium_reactions to authenticated;
grant insert (target_user_id, message_code, post_id) on table public.aquarium_reactions to authenticated;

grant select, delete on table public.aquarium_mutes to authenticated;
grant insert (owner_user_id, muted_user_id) on table public.aquarium_mutes to authenticated;

-- 既存のプロフィール権限へbioを安全に追加します。
grant select (user_id, grade, major, interests, fish_type, bio, created_at, updated_at) on table public.profiles to authenticated;
grant insert (bio) on table public.profiles to authenticated;
grant update (bio) on table public.profiles to authenticated;

alter table public.aquarium_presence replica identity full;
alter table public.aquarium_reactions replica identity full;

do $$
declare
  publication_is_all_tables boolean;
begin
  select puballtables into publication_is_all_tables
  from pg_publication
  where pubname = 'supabase_realtime';

  if publication_is_all_tables is false then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'aquarium_presence'
    ) then
      alter publication supabase_realtime add table public.aquarium_presence;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'aquarium_reactions'
    ) then
      alter publication supabase_realtime add table public.aquarium_reactions;
    end if;
  end if;
end $$;

commit;

select pg_notify('pgrst', 'reload schema');
