-- Manabium database schema for Supabase
-- Supabase Dashboard > SQL Editor で、このファイル全体を一度に実行してください。

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Tables
-- ============================================================

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '' check (char_length(nickname) <= 20),
  grade text check (grade is null or char_length(grade) <= 20),
  major text check (major is null or char_length(major) <= 40),
  interests text[] not null default '{}'::text[],
  fish_type text not null default 'coral'
    check (fish_type in ('coral', 'aqua', 'lemon', 'lilac', 'mint', 'peach')),
  bio text check (bio is null or char_length(bio) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 既存プロジェクトにschema.sqlを再実行した場合も、興味分野の列を追加します。
alter table public.profiles
  add column if not exists interests text[] not null default '{}'::text[];

alter table public.profiles
  add column if not exists bio text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_interests_limit'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_interests_limit check (cardinality(interests) <= 8);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_bio_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_bio_length check (bio is null or char_length(bio) <= 80);
  end if;
end $$;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 2000),
  category text not null check (category in ('授業', '研究', '就活', 'イベント')),
  post_type text not null check (post_type in ('相談', '情報共有')),
  field_tags text[] not null default '{}'::text[],
  like_count integer not null default 0 check (like_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 投稿内容を興味・専攻の近い利用者へ優先表示するための関連分野タグです。
alter table public.posts
  add column if not exists field_tags text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_field_tags_limit'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_field_tags_limit check (cardinality(field_tags) <= 5);
  end if;
end $$;

create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_category_created_idx on public.posts (category, created_at desc);
create index if not exists posts_user_created_idx on public.posts (user_id, created_at desc);
create index if not exists posts_field_tags_idx on public.posts using gin (field_tags);

-- 同じ人が同じ投稿に複数回いいねできないよう、複合主キーにします。
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx on public.post_likes (user_id);

-- 投稿への返信。ログイン利用者全員が閲覧でき、parent_reply_idで会話をつなぎます。
create table if not exists public.post_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  parent_reply_id uuid references public.post_replies(id) on delete set null,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint reply_sender_and_recipient_are_different check (sender_user_id <> recipient_user_id)
);

-- 既存テーブルへschema.sqlを再実行した場合も、スレッド列と外部キーを追加します。
alter table public.post_replies
  add column if not exists parent_reply_id uuid;
alter table public.post_replies
  drop constraint if exists post_replies_parent_reply_id_fkey;
alter table public.post_replies
  add constraint post_replies_parent_reply_id_fkey
  foreign key (parent_reply_id)
  references public.post_replies(id)
  on delete set null;

create index if not exists post_replies_post_created_idx
  on public.post_replies (post_id, created_at desc);
create index if not exists post_replies_recipient_created_idx
  on public.post_replies (recipient_user_id, created_at desc);
create index if not exists post_replies_sender_created_idx
  on public.post_replies (sender_user_id, created_at desc);
create index if not exists post_replies_parent_created_idx
  on public.post_replies (parent_reply_id, created_at asc);

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

create table if not exists public.aquarium_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  participate_as_fish boolean not null default true,
  receive_reactions boolean not null default true,
  default_status text not null default 'social'
    check (default_status in ('social', 'break', 'observe')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aquarium_reactions (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete cascade,
  message_code text not null check (message_code in (
    'hello', 'starting', 'new_bottle', 'question_bottle', 'info_bottle',
    'share_interest_1', 'share_interest_2', 'share_interest_3',
    'good_work', 'taking_break',
    'together', 'same_field', 'support', 'interesting', 'view_bottles', 'good_work_direct'
  )),
  created_at timestamptz not null default now(),
  constraint aquarium_reaction_not_self check (
    target_user_id is null or sender_user_id <> target_user_id
  )
);

create index if not exists aquarium_reactions_created_idx
  on public.aquarium_reactions (created_at desc);
create index if not exists aquarium_reactions_sender_created_idx
  on public.aquarium_reactions (sender_user_id, created_at desc);
create index if not exists aquarium_reactions_target_created_idx
  on public.aquarium_reactions (target_user_id, created_at desc);

create table if not exists public.aquarium_mutes (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  muted_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_user_id, muted_user_id),
  constraint aquarium_mute_not_self check (owner_user_id <> muted_user_id)
);

-- ============================================================
-- 2. Database functions and triggers
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

-- 返信本文は送信者だけ、既読状態は受信者だけが変更できます。
create or replace function public.protect_post_reply_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id = old.sender_user_id then
    if new.is_read is distinct from old.is_read then
      raise exception 'Reply senders cannot change read status';
    end if;
  elsif current_user_id = old.recipient_user_id then
    if new.body is distinct from old.body then
      raise exception 'Reply recipients cannot edit reply body';
    end if;
  else
    raise exception 'You cannot update this reply';
  end if;
  return new;
end;
$$;

drop trigger if exists post_replies_protect_update on public.post_replies;
create trigger post_replies_protect_update
before update on public.post_replies
for each row execute function public.protect_post_reply_update();

-- Authにユーザーが作られたら、空のプロフィール行を自動作成します。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nickname', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- like_countをブラウザから直接書き換えられないよう、投稿時は必ず0に戻します。
create or replace function public.force_initial_like_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.like_count = 0;
  return new;
end;
$$;

drop trigger if exists posts_force_initial_like_count on public.posts;
create trigger posts_force_initial_like_count
before insert on public.posts
for each row execute function public.force_initial_like_count();

-- post_likesの増減に合わせてposts.like_countを安全に更新します。
create or replace function public.sync_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
      set like_count = like_count + 1
      where id = new.post_id;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.posts
      set like_count = greatest(like_count - 1, 0)
      where id = old.post_id;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists post_likes_sync_count on public.post_likes;
create trigger post_likes_sync_count
after insert or delete on public.post_likes
for each row execute function public.sync_post_like_count();

-- 既存データがある状態で再実行した場合も、件数を正しい値にそろえます。
update public.posts p
set like_count = (
  select count(*)::integer
  from public.post_likes pl
  where pl.post_id = p.id
);

-- 最初の返信は元投稿者へ、返信への返信は直前の送信者へ届けます。
-- parent_reply_idを使う場合、直前の受信者だけが次の返信を送れます。
create or replace function public.set_reply_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_post_id uuid;
  parent_sender_user_id uuid;
  parent_recipient_user_id uuid;
begin
  if new.parent_reply_id is null then
    new.recipient_user_id := (
      select p.user_id from public.posts p where p.id = new.post_id
    );
    if new.recipient_user_id is null then raise exception 'Post not found'; end if;
  else
    select r.post_id, r.sender_user_id, r.recipient_user_id
      into parent_post_id, parent_sender_user_id, parent_recipient_user_id
      from public.post_replies r
      where r.id = new.parent_reply_id;
    if parent_post_id is null then raise exception 'Parent reply not found'; end if;
    if new.sender_user_id <> parent_recipient_user_id then
      raise exception 'Only the reply recipient can respond';
    end if;
    new.post_id := parent_post_id;
    new.recipient_user_id := parent_sender_user_id;
  end if;
  if new.recipient_user_id = new.sender_user_id then raise exception 'Cannot reply to your own post'; end if;
  new.is_read := false;
  return new;
end;
$$;

drop trigger if exists post_replies_set_recipient on public.post_replies;
create trigger post_replies_set_recipient
before insert on public.post_replies
for each row execute function public.set_reply_recipient();

-- heartbeatとuser_idはクライアントが偽装できないようDB側で決めます。
create or replace function public.prepare_aquarium_presence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  new.user_id := auth.uid();
  new.heartbeat_at := now();
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.joined_at := old.joined_at; end if;
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
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  new.user_id := auth.uid();
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  new.sender_user_id := auth.uid();
  new.created_at := now();

  select p.status into sender_status
  from public.aquarium_presence p
  where p.user_id = auth.uid()
    and p.heartbeat_at > now() - interval '90 seconds';
  if sender_status is null then raise exception 'You are not active in the aquarium'; end if;

  if new.target_user_id is null then
    if new.message_code not in (
      'hello', 'starting', 'new_bottle', 'question_bottle', 'info_bottle',
      'share_interest_1', 'share_interest_2', 'share_interest_3',
      'good_work', 'taking_break'
    ) then
      raise exception 'Invalid aquarium-wide message';
    end if;
    if exists (
      select 1 from public.aquarium_reactions r
      where r.sender_user_id = auth.uid()
        and r.created_at > now() - interval '4 seconds'
    ) then
      raise exception 'Reaction cooldown';
    end if;
  else
    if new.target_user_id = auth.uid() then raise exception 'Cannot react to yourself'; end if;
    if new.message_code not in ('together', 'same_field', 'support', 'interesting', 'view_bottles', 'good_work_direct') then
      raise exception 'Invalid direct reaction';
    end if;

    select p.status into target_status
    from public.aquarium_presence p
    where p.user_id = new.target_user_id
      and p.heartbeat_at > now() - interval '90 seconds';
    if target_status is null then raise exception 'Target is not active in the aquarium'; end if;
    if target_status = 'observe' then raise exception 'Target is observing only'; end if;

    select coalesce(pref.receive_reactions, true) into target_accepts
    from (select 1) seed
    left join public.aquarium_preferences pref on pref.user_id = new.target_user_id;
    if not target_accepts then raise exception 'Target is not receiving reactions'; end if;

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

  delete from public.aquarium_reactions
  where created_at < now() - interval '1 day';
  return new;
end;
$$;

drop trigger if exists aquarium_reactions_validate on public.aquarium_reactions;
create trigger aquarium_reactions_validate
before insert on public.aquarium_reactions
for each row execute function public.validate_aquarium_reaction();

-- ============================================================
-- 3. Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_replies enable row level security;
alter table public.aquarium_presence enable row level security;
alter table public.aquarium_preferences enable row level security;
alter table public.aquarium_reactions enable row level security;
alter table public.aquarium_mutes enable row level security;

-- プロフィール：ログイン利用者は公開項目を閲覧でき、変更できるのは自分だけ。
drop policy if exists "Authenticated users can view community profiles" on public.profiles;
create policy "Authenticated users can view community profiles"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- 投稿：ログイン利用者は全投稿を閲覧でき、作成者だけが編集・削除できる。
drop policy if exists "Authenticated users can view posts" on public.posts;
create policy "Authenticated users can view posts"
on public.posts for select
to authenticated
using (true);

drop policy if exists "Users can create their own post" on public.posts;
create policy "Users can create their own post"
on public.posts for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own post" on public.posts;
create policy "Users can update their own post"
on public.posts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own post" on public.posts;
create policy "Users can delete their own post"
on public.posts for delete
to authenticated
using ((select auth.uid()) = user_id);

-- いいね：誰が押したかは本人だけが閲覧可能。追加・削除も本人だけ。
drop policy if exists "Users can view their own likes" on public.post_likes;
create policy "Users can view their own likes"
on public.post_likes for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own like" on public.post_likes;
create policy "Users can add their own like"
on public.post_likes for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own like" on public.post_likes;
create policy "Users can remove their own like"
on public.post_likes for delete
to authenticated
using ((select auth.uid()) = user_id);

-- 返信：ログイン利用者は全返信を閲覧できます。変更・削除は以降のポリシーで当事者だけに制限します。
drop policy if exists "Authenticated users can view replies" on public.post_replies;
drop policy if exists "Users can create their own reply" on public.post_replies;
drop policy if exists "Users can delete their own reply" on public.post_replies;

drop policy if exists "Reply participants can view private replies" on public.post_replies;
drop policy if exists "Authenticated users can view all replies" on public.post_replies;
create policy "Authenticated users can view all replies"
on public.post_replies for select
to authenticated
using (true);

drop policy if exists "Users can reply as themselves to another users post" on public.post_replies;
drop policy if exists "Users can send private threaded replies" on public.post_replies;
create policy "Users can send private threaded replies"
on public.post_replies for insert
to authenticated
with check (
  (select auth.uid()) = sender_user_id
  and recipient_user_id <> sender_user_id
);

drop policy if exists "Recipients can mark their replies as read" on public.post_replies;
create policy "Recipients can mark their replies as read"
on public.post_replies for update
to authenticated
using ((select auth.uid()) = recipient_user_id)
with check ((select auth.uid()) = recipient_user_id);

drop policy if exists "Reply senders can edit their own replies" on public.post_replies;
create policy "Reply senders can edit their own replies"
on public.post_replies for update
to authenticated
using ((select auth.uid()) = sender_user_id)
with check ((select auth.uid()) = sender_user_id);

drop policy if exists "Reply participants can delete their replies" on public.post_replies;
drop policy if exists "Reply senders can delete their own replies" on public.post_replies;
create policy "Reply senders can delete their own replies"
on public.post_replies for delete
to authenticated
using ((select auth.uid()) = sender_user_id);

-- 水槽presence：認証済み利用者だけが期限内の行を閲覧し、本人の行だけ変更できます。
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
using (created_at > now() - interval '30 seconds');

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

-- ============================================================
-- 4. Grants (RLSに加え、変更可能な列も制限します)
-- ============================================================

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.posts from anon, authenticated;
revoke all on table public.post_likes from anon, authenticated;
revoke all on table public.post_replies from anon, authenticated;
revoke all on table public.aquarium_presence from anon, authenticated;
revoke all on table public.aquarium_preferences from anon, authenticated;
revoke all on table public.aquarium_reactions from anon, authenticated;
revoke all on table public.aquarium_mutes from anon, authenticated;

grant select on table public.profiles to authenticated;
grant insert (user_id, nickname, grade, major, interests, fish_type, bio) on table public.profiles to authenticated;
grant update (nickname, grade, major, interests, fish_type, bio) on table public.profiles to authenticated;

grant select, insert, delete on table public.posts to authenticated;
grant update (title, body, category, post_type, field_tags) on table public.posts to authenticated;

grant select, insert, delete on table public.post_likes to authenticated;
grant select, delete on table public.post_replies to authenticated;
grant insert (post_id, parent_reply_id, sender_user_id, body) on table public.post_replies to authenticated;
grant update (body, is_read) on table public.post_replies to authenticated;

grant select, delete on table public.aquarium_presence to authenticated;
grant insert (status, focus_topic) on table public.aquarium_presence to authenticated;
grant update (status, focus_topic, heartbeat_at) on table public.aquarium_presence to authenticated;

grant select on table public.aquarium_preferences to authenticated;
grant insert (participate_as_fish, receive_reactions, default_status) on table public.aquarium_preferences to authenticated;
grant update (participate_as_fish, receive_reactions, default_status) on table public.aquarium_preferences to authenticated;

grant select on table public.aquarium_reactions to authenticated;
grant insert (target_user_id, message_code) on table public.aquarium_reactions to authenticated;

grant select, delete on table public.aquarium_mutes to authenticated;
grant insert (owner_user_id, muted_user_id) on table public.aquarium_mutes to authenticated;

-- ============================================================
-- 5. Realtime publication
-- ============================================================

alter table public.posts replica identity full;
alter table public.post_likes replica identity full;
alter table public.post_replies replica identity full;
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
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
    ) then
      alter publication supabase_realtime add table public.posts;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_likes'
    ) then
      alter publication supabase_realtime add table public.post_likes;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_replies'
    ) then
      alter publication supabase_realtime add table public.post_replies;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aquarium_presence'
    ) then
      alter publication supabase_realtime add table public.aquarium_presence;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aquarium_reactions'
    ) then
      alter publication supabase_realtime add table public.aquarium_reactions;
    end if;
  end if;
end $$;
