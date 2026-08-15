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
  external_url text,
  external_site_name text,
  like_count integer not null default 0 check (like_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 投稿内容を興味・専攻の近い利用者へ優先表示するための関連分野タグです。
alter table public.posts
  add column if not exists field_tags text[] not null default '{}'::text[];

-- イベント・インターン・参考資料の公式ページへ、ボトルから直接移動するための任意URLです。
alter table public.posts
  add column if not exists external_url text;

alter table public.posts
  add column if not exists external_site_name text;

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

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_external_site_name_length'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_external_site_name_length check (
        external_site_name is null or char_length(external_site_name) <= 80
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_external_url_format'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_external_url_format check (
        external_url is null
        or (char_length(external_url) <= 500 and external_url ~* '^https?://')
      );
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

-- 「あとで読む」はいいねと分離した非公開保存です。保存者本人以外には公開しません。
create table if not exists public.post_bookmarks (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_bookmarks_user_created_idx
  on public.post_bookmarks (user_id, created_at desc);

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
  values (new.id, '')
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
  shared_post_owner uuid;
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
    if new.target_user_id = auth.uid() then raise exception 'Cannot react to yourself'; end if;
    if new.message_code not in ('together', 'same_field', 'support', 'interesting', 'recommend_bottle_direct', 'good_work_direct') then
      raise exception 'Invalid direct reaction';
    end if;
    if new.post_id is not null then raise exception 'Direct reactions cannot attach a bottle'; end if;

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
alter table public.post_bookmarks enable row level security;
alter table public.post_replies enable row level security;
alter table public.aquarium_presence enable row level security;
alter table public.aquarium_preferences enable row level security;
alter table public.aquarium_reactions enable row level security;
alter table public.aquarium_mutes enable row level security;

-- プロフィール：ログイン利用者は公開属性を閲覧でき、変更できるのは自分だけ。
-- nickname列は旧版とのデータ互換のため残しますが、現行UIでは公開・更新しません。
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

-- あとで読む：保存一覧、追加、削除のすべてを本人だけに限定します。
drop policy if exists "Users can view their own bookmarks" on public.post_bookmarks;
create policy "Users can view their own bookmarks"
on public.post_bookmarks for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own bookmark" on public.post_bookmarks;
create policy "Users can add their own bookmark"
on public.post_bookmarks for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own bookmark" on public.post_bookmarks;
create policy "Users can remove their own bookmark"
on public.post_bookmarks for delete
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

-- ============================================================
-- 4. Grants (RLSに加え、変更可能な列も制限します)
-- ============================================================

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.posts from anon, authenticated;
revoke all on table public.post_likes from anon, authenticated;
revoke all on table public.post_bookmarks from anon, authenticated;
revoke all on table public.post_replies from anon, authenticated;
revoke all on table public.aquarium_presence from anon, authenticated;
revoke all on table public.aquarium_preferences from anon, authenticated;
revoke all on table public.aquarium_reactions from anon, authenticated;
revoke all on table public.aquarium_mutes from anon, authenticated;

grant select (user_id, grade, major, interests, fish_type, bio, created_at, updated_at) on table public.profiles to authenticated;
grant insert (user_id, grade, major, interests, fish_type, bio) on table public.profiles to authenticated;
grant update (grade, major, interests, fish_type, bio) on table public.profiles to authenticated;

grant select (id, user_id, title, body, category, post_type, field_tags, external_url, external_site_name, like_count, created_at, updated_at)
  on table public.posts to authenticated;
grant insert (user_id, title, body, category, post_type, field_tags, external_url, external_site_name)
  on table public.posts to authenticated;
grant delete on table public.posts to authenticated;
grant update (title, body, category, post_type, field_tags, external_url, external_site_name) on table public.posts to authenticated;

grant select, delete on table public.post_likes to authenticated;
grant insert (post_id, user_id) on table public.post_likes to authenticated;
grant select, delete on table public.post_bookmarks to authenticated;
grant insert (post_id) on table public.post_bookmarks to authenticated;
grant select (id, post_id, parent_reply_id, sender_user_id, recipient_user_id, body, is_read, created_at)
  on table public.post_replies to authenticated;
grant delete on table public.post_replies to authenticated;
grant insert (post_id, parent_reply_id, sender_user_id, body) on table public.post_replies to authenticated;
grant update (body, is_read) on table public.post_replies to authenticated;

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


-- ============================================================
-- 6. Admin analytics extension
-- ============================================================
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
  foreach table_name in array array['profiles','posts','post_likes','post_bookmarks','post_replies','aquarium_presence','aquarium_preferences','aquarium_reactions','aquarium_mutes'] loop
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

-- モデレーション用のメモ・管理者IDは、通常の投稿取得へ含めません。
revoke select on table public.posts from authenticated;
grant select (id, user_id, title, body, category, post_type, field_tags, external_url, external_site_name, like_count, moderation_status, created_at, updated_at)
  on table public.posts to authenticated;
revoke select on table public.post_replies from authenticated;
grant select (id, post_id, parent_reply_id, sender_user_id, recipient_user_id, body, is_read, moderation_status, created_at)
  on table public.post_replies to authenticated;

revoke all on function public.record_analytics_events(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, boolean) from public;
grant execute on function public.record_analytics_events(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, boolean) to anon, authenticated;
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
-- Manabium: 湖畔の図書館（長文ノート・書き込み・しおり・湖への紹介）
-- Supabase Dashboard > SQL Editor > New query に全文を貼り付けて Run してください。
-- 既存のプロフィール、ボトル、返信、湖のデータは削除しません。再実行可能な追加migrationです。

begin;

create table if not exists public.lakeside_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_type text not null check (note_type in ('internship', 'technology', 'project', 'learning')),
  title text not null check (char_length(title) between 1 and 120),
  summary text not null check (char_length(summary) between 1 and 240),
  body text not null check (char_length(body) between 1 and 10000),
  field_tags text[] not null default '{}'::text[] check (cardinality(field_tags) <= 8),
  feedback_type text not null default 'none'
    check (feedback_type in ('impressions', 'questions', 'advice', 'same_experience', 'none')),
  external_url text check (
    external_url is null or (char_length(external_url) <= 500 and external_url ~* '^https?://')
  ),
  external_site_name text check (external_site_name is null or char_length(external_site_name) <= 80),
  status text not null default 'draft' check (status in ('draft', 'published', 'private')),
  moderation_status text not null default 'visible' check (moderation_status in ('visible', 'hidden')),
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 1000),
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.note_comments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.lakeside_notes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  comment_type text not null
    check (comment_type in ('impression', 'question', 'same_experience', 'advice', 'support')),
  body text not null check (char_length(body) between 1 and 1500),
  moderation_status text not null default 'visible' check (moderation_status in ('visible', 'hidden')),
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 1000),
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.note_bookmarks (
  note_id uuid not null references public.lakeside_notes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create index if not exists lakeside_notes_status_published_idx
  on public.lakeside_notes (status, published_at desc);
create index if not exists lakeside_notes_user_updated_idx
  on public.lakeside_notes (user_id, updated_at desc);
create index if not exists lakeside_notes_type_published_idx
  on public.lakeside_notes (note_type, published_at desc);
create index if not exists lakeside_notes_field_tags_idx
  on public.lakeside_notes using gin (field_tags);
create index if not exists note_comments_note_created_idx
  on public.note_comments (note_id, created_at asc);
create index if not exists note_comments_user_created_idx
  on public.note_comments (user_id, created_at desc);
create index if not exists note_bookmarks_user_created_idx
  on public.note_bookmarks (user_id, created_at desc);

create or replace function public.set_lakeside_note_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  if new.status <> 'published' then new.published_at := null; end if;
  return new;
end;
$$;

drop trigger if exists lakeside_notes_set_publication on public.lakeside_notes;
create trigger lakeside_notes_set_publication
before insert or update on public.lakeside_notes
for each row execute function public.set_lakeside_note_publication();

drop trigger if exists note_comments_set_updated_at on public.note_comments;
create trigger note_comments_set_updated_at
before update on public.note_comments
for each row execute function public.set_updated_at();

alter table public.lakeside_notes enable row level security;
alter table public.note_comments enable row level security;
alter table public.note_bookmarks enable row level security;

drop policy if exists "Users can view published notes and their own notes" on public.lakeside_notes;
create policy "Users can view published notes and their own notes"
on public.lakeside_notes for select to authenticated
using (
  user_id = (select auth.uid())
  or (status = 'published' and moderation_status = 'visible')
);

drop policy if exists "Users can create their own notes" on public.lakeside_notes;
create policy "Users can create their own notes"
on public.lakeside_notes for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own notes" on public.lakeside_notes;
create policy "Users can update their own notes"
on public.lakeside_notes for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own notes" on public.lakeside_notes;
create policy "Users can delete their own notes"
on public.lakeside_notes for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can view visible note comments" on public.note_comments;
create policy "Users can view visible note comments"
on public.note_comments for select to authenticated
using (
  user_id = (select auth.uid())
  or moderation_status = 'visible' and exists (
    select 1 from public.lakeside_notes n
    where n.id = note_id
      and (n.user_id = (select auth.uid()) or (n.status = 'published' and n.moderation_status = 'visible'))
  )
);

drop policy if exists "Users can comment on published notes" on public.note_comments;
create policy "Users can comment on published notes"
on public.note_comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.lakeside_notes n
    where n.id = note_id and n.status = 'published' and n.moderation_status = 'visible'
  )
);

drop policy if exists "Users can update their own note comments" on public.note_comments;
create policy "Users can update their own note comments"
on public.note_comments for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own note comments" on public.note_comments;
create policy "Users can delete their own note comments"
on public.note_comments for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can view their own note bookmarks" on public.note_bookmarks;
create policy "Users can view their own note bookmarks"
on public.note_bookmarks for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can add their own note bookmarks" on public.note_bookmarks;
create policy "Users can add their own note bookmarks"
on public.note_bookmarks for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.lakeside_notes n
    where n.id = note_id and n.status = 'published' and n.moderation_status = 'visible'
  )
);

drop policy if exists "Users can remove their own note bookmarks" on public.note_bookmarks;
create policy "Users can remove their own note bookmarks"
on public.note_bookmarks for delete to authenticated
using (user_id = (select auth.uid()));

-- 湖に紹介するノートを、魚の吹き出しへ安全に紐付けます。
alter table public.aquarium_reactions
  add column if not exists note_id uuid references public.lakeside_notes(id) on delete cascade;

do $$
declare constraint_name text;
begin
  for constraint_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.aquarium_reactions'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%message_code%'
  loop execute format('alter table public.aquarium_reactions drop constraint %I', constraint_name); end loop;
end $$;

alter table public.aquarium_reactions
  add constraint aquarium_reactions_message_code_check check (message_code in (
    'hello', 'starting', 'share_grade', 'share_major',
    'share_interest_1', 'share_interest_2', 'share_interest_3',
    'ask_bottle_any', 'ask_bottle_class', 'ask_bottle_research', 'ask_bottle_career', 'ask_bottle_event',
    'share_bottle_mine', 'share_bottle_recommend', 'share_note_mine', 'share_note_recommend',
    'good_work', 'taking_break',
    'together', 'same_field', 'support', 'interesting', 'recommend_bottle_direct', 'good_work_direct'
  ));

create index if not exists aquarium_reactions_note_created_idx
  on public.aquarium_reactions (note_id, created_at desc) where note_id is not null;

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
  shared_note_owner uuid;
  shared_note_status text;
  shared_note_moderation text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  new.sender_user_id := auth.uid();
  new.created_at := now();

  select p.status into sender_status from public.aquarium_presence p
  where p.user_id = auth.uid() and p.heartbeat_at > now() - interval '90 seconds';
  if sender_status is null then raise exception 'You are not active in the aquarium'; end if;

  if new.target_user_id is null then
    if new.message_code not in (
      'hello', 'starting', 'share_grade', 'share_major',
      'share_interest_1', 'share_interest_2', 'share_interest_3',
      'ask_bottle_any', 'ask_bottle_class', 'ask_bottle_research', 'ask_bottle_career', 'ask_bottle_event',
      'share_bottle_mine', 'share_bottle_recommend', 'share_note_mine', 'share_note_recommend',
      'good_work', 'taking_break'
    ) then raise exception 'Invalid aquarium-wide message'; end if;

    if new.message_code in ('share_bottle_mine', 'share_bottle_recommend') then
      if new.post_id is null or new.note_id is not null then raise exception 'Bottle share requires a post'; end if;
      select p.user_id into shared_post_owner from public.posts p where p.id = new.post_id;
      if shared_post_owner is null then raise exception 'Shared bottle was not found'; end if;
      if new.message_code = 'share_bottle_mine' and shared_post_owner <> auth.uid() then raise exception 'Only your own bottle can be shared as yours'; end if;
      if new.message_code = 'share_bottle_recommend' and shared_post_owner = auth.uid() then raise exception 'Use own bottle sharing for your post'; end if;
    elsif new.message_code in ('share_note_mine', 'share_note_recommend') then
      if new.note_id is null or new.post_id is not null then raise exception 'Note share requires a note'; end if;
      select n.user_id, n.status, n.moderation_status
        into shared_note_owner, shared_note_status, shared_note_moderation
      from public.lakeside_notes n where n.id = new.note_id;
      if shared_note_owner is null or shared_note_status <> 'published' or shared_note_moderation <> 'visible' then raise exception 'Shared note was not found'; end if;
      if new.message_code = 'share_note_mine' and shared_note_owner <> auth.uid() then raise exception 'Only your own note can be shared as yours'; end if;
      if new.message_code = 'share_note_recommend' and shared_note_owner = auth.uid() then raise exception 'Use own note sharing for your note'; end if;
    elsif new.post_id is not null or new.note_id is not null then
      raise exception 'This message cannot attach content';
    end if;

    if exists (select 1 from public.aquarium_reactions r where r.sender_user_id = auth.uid() and r.created_at > now() - interval '4 seconds') then raise exception 'Reaction cooldown'; end if;
    if new.post_id is not null and exists (select 1 from public.aquarium_reactions r where r.sender_user_id = auth.uid() and r.post_id = new.post_id and r.created_at > now() - interval '10 minutes') then raise exception 'Bottle share cooldown'; end if;
    if new.note_id is not null and exists (select 1 from public.aquarium_reactions r where r.sender_user_id = auth.uid() and r.note_id = new.note_id and r.created_at > now() - interval '10 minutes') then raise exception 'Note share cooldown'; end if;
  else
    if new.target_user_id = auth.uid() then raise exception 'Cannot react to yourself'; end if;
    if new.message_code not in ('together', 'same_field', 'support', 'interesting', 'recommend_bottle_direct', 'good_work_direct') then raise exception 'Invalid direct reaction'; end if;
    if new.post_id is not null or new.note_id is not null then raise exception 'Direct reactions cannot attach content'; end if;

    select p.status into target_status from public.aquarium_presence p
    where p.user_id = new.target_user_id and p.heartbeat_at > now() - interval '90 seconds';
    if target_status is null then raise exception 'Target is not active in the aquarium'; end if;
    if target_status = 'observe' then raise exception 'Target is observing only'; end if;
    select coalesce(pref.receive_reactions, true) into target_accepts
    from (select 1) seed left join public.aquarium_preferences pref on pref.user_id = new.target_user_id;
    if not target_accepts then raise exception 'Target is not receiving reactions'; end if;
    if exists (
      select 1 from public.aquarium_mutes m
      where (m.owner_user_id = new.target_user_id and m.muted_user_id = auth.uid())
         or (m.owner_user_id = auth.uid() and m.muted_user_id = new.target_user_id)
    ) then raise exception 'Reaction is muted'; end if;
    if exists (select 1 from public.aquarium_reactions r where r.sender_user_id = auth.uid() and r.target_user_id = new.target_user_id and r.created_at > now() - interval '10 seconds') then raise exception 'Reaction target cooldown'; end if;
    if exists (select 1 from public.aquarium_reactions r where r.sender_user_id = auth.uid() and r.created_at > now() - interval '3 seconds') then raise exception 'Reaction cooldown'; end if;
  end if;

  delete from public.aquarium_reactions where created_at < now() - interval '1 day';
  return new;
end;
$$;

-- 通報対象にノートと書き込みを追加します。
do $$
declare constraint_name text;
begin
  for constraint_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.content_reports'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%target_type%'
  loop execute format('alter table public.content_reports drop constraint %I', constraint_name); end loop;
end $$;

alter table public.content_reports
  add constraint content_reports_target_type_check
  check (target_type in ('post', 'reply', 'user', 'note', 'note_comment'));

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
  elsif p_target_type = 'note' then
    update public.lakeside_notes set moderation_status = p_status, moderation_note = left(p_note, 1000), moderated_by = auth.uid(), moderated_at = now() where id = p_target_id;
  elsif p_target_type = 'note_comment' then
    update public.note_comments set moderation_status = p_status, moderation_note = left(p_note, 1000), moderated_by = auth.uid(), moderated_at = now() where id = p_target_id;
  else raise exception 'Invalid target type'; end if;
  insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, detail)
  values (auth.uid(), 'moderate_content', p_target_type, p_target_id, jsonb_build_object('status', p_status, 'note', p_note));
end;
$$;

revoke all on table public.lakeside_notes, public.note_comments, public.note_bookmarks from anon, authenticated;
grant select (id, user_id, note_type, title, summary, body, field_tags, feedback_type, external_url, external_site_name, status, moderation_status, published_at, created_at, updated_at)
  on table public.lakeside_notes to authenticated;
grant select (id, note_id, user_id, comment_type, body, moderation_status, created_at, updated_at)
  on table public.note_comments to authenticated;
grant insert (note_type, title, summary, body, field_tags, feedback_type, external_url, external_site_name, status) on table public.lakeside_notes to authenticated;
grant update (note_type, title, summary, body, field_tags, feedback_type, external_url, external_site_name, status) on table public.lakeside_notes to authenticated;
grant delete on table public.lakeside_notes to authenticated;
grant insert (note_id, comment_type, body) on table public.note_comments to authenticated;
grant update (comment_type, body) on table public.note_comments to authenticated;
grant delete on table public.note_comments to authenticated;
grant select, delete on table public.note_bookmarks to authenticated;
grant insert (note_id) on table public.note_bookmarks to authenticated;

revoke insert on table public.aquarium_reactions from authenticated;
revoke select on table public.aquarium_reactions from authenticated;
grant select (id, sender_user_id, target_user_id, post_id, note_id, message_code, created_at)
  on table public.aquarium_reactions to authenticated;
grant insert (target_user_id, message_code, post_id, note_id) on table public.aquarium_reactions to authenticated;

do $$
declare table_name text;
begin
  if to_regprocedure('public.block_suspended_writes()') is not null then
    foreach table_name in array array['lakeside_notes', 'note_comments', 'note_bookmarks'] loop
      execute format('drop trigger if exists block_suspended_writes on public.%I', table_name);
      execute format('create trigger block_suspended_writes before insert or update or delete on public.%I for each row execute function public.block_suspended_writes()', table_name);
    end loop;
  end if;
end $$;

commit;

select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- 8. Security hardening defaults
-- ============================================================
begin;

revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
revoke all on table auth.users, auth.identities from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Data APIの関数は閉じた状態を既定にし、利用するRPCだけを明示します。
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin(uuid) to authenticated, service_role;
grant execute on function private.is_active_user(uuid) to authenticated, service_role;
grant execute on function public.is_current_user_admin() to authenticated;
grant execute on function public.get_my_profile_analytics_fields() to authenticated;
grant execute on function public.record_analytics_events(uuid, uuid, jsonb, text, text, text, text, text, text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.admin_analytics_dashboard(date, date, text) to authenticated;
grant execute on function public.admin_moderate_content(text, uuid, text, text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, text, timestamptz) to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');
