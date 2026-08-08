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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 既存プロジェクトにschema.sqlを再実行した場合も、興味分野の列を追加します。
alter table public.profiles
  add column if not exists interests text[] not null default '{}'::text[];

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

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  study_topic text not null check (char_length(study_topic) between 1 and 80),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  constraint completed_session_has_end_time check (
    (status = 'active' and ended_at is null)
    or (status = 'completed' and ended_at is not null and ended_at >= started_at)
  )
);

create unique index if not exists one_active_study_session_per_user
  on public.study_sessions (user_id)
  where status = 'active';

create index if not exists study_sessions_status_started_idx
  on public.study_sessions (status, started_at desc);

create index if not exists study_sessions_user_started_idx
  on public.study_sessions (user_id, started_at desc);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 2000),
  category text not null check (category in ('授業', '研究', '就活', 'イベント')),
  post_type text not null check (post_type in ('相談', '情報共有')),
  like_count integer not null default 0 check (like_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_category_created_idx on public.posts (category, created_at desc);
create index if not exists posts_user_created_idx on public.posts (user_id, created_at desc);

-- 同じ人が同じ投稿に複数回いいねできないよう、複合主キーにします。
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx on public.post_likes (user_id);

-- 投稿への非公開返信。parent_reply_idがある場合は、返信同士の1対1スレッドになります。
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

-- ============================================================
-- 3. Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.study_sessions enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_replies enable row level security;

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

-- 学習セッション：他人について見えるのは「学習中」だけ。自分の履歴はすべて見える。
drop policy if exists "Users can view active sessions and their own history" on public.study_sessions;
create policy "Users can view active sessions and their own history"
on public.study_sessions for select
to authenticated
using (status = 'active' or (select auth.uid()) = user_id);

drop policy if exists "Users can start their own session" on public.study_sessions;
create policy "Users can start their own session"
on public.study_sessions for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own session" on public.study_sessions;
create policy "Users can update their own session"
on public.study_sessions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own session" on public.study_sessions;
create policy "Users can delete their own session"
on public.study_sessions for delete
to authenticated
using ((select auth.uid()) = user_id);

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

-- 返信：送信者と元投稿者だけが閲覧できます。
drop policy if exists "Authenticated users can view replies" on public.post_replies;
drop policy if exists "Users can create their own reply" on public.post_replies;
drop policy if exists "Users can delete their own reply" on public.post_replies;

drop policy if exists "Reply participants can view private replies" on public.post_replies;
create policy "Reply participants can view private replies"
on public.post_replies for select
to authenticated
using (
  (select auth.uid()) = recipient_user_id
  or (select auth.uid()) = sender_user_id
);

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

-- ============================================================
-- 4. Grants (RLSに加え、変更可能な列も制限します)
-- ============================================================

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.study_sessions from anon, authenticated;
revoke all on table public.posts from anon, authenticated;
revoke all on table public.post_likes from anon, authenticated;
revoke all on table public.post_replies from anon, authenticated;

grant select, insert on table public.profiles to authenticated;
grant update (nickname, grade, major, interests, fish_type) on table public.profiles to authenticated;

grant select, insert, delete on table public.study_sessions to authenticated;
grant update (study_topic, ended_at, status) on table public.study_sessions to authenticated;

grant select, insert, delete on table public.posts to authenticated;
grant update (title, body, category, post_type) on table public.posts to authenticated;

grant select, insert, delete on table public.post_likes to authenticated;
grant select, delete on table public.post_replies to authenticated;
grant insert (post_id, parent_reply_id, sender_user_id, body) on table public.post_replies to authenticated;
grant update (body, is_read) on table public.post_replies to authenticated;

-- ============================================================
-- 5. Realtime publication
-- ============================================================

alter table public.study_sessions replica identity full;
alter table public.posts replica identity full;
alter table public.post_likes replica identity full;
alter table public.post_replies replica identity full;

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
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'study_sessions'
    ) then
      alter publication supabase_realtime add table public.study_sessions;
    end if;

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
  end if;
end $$;
