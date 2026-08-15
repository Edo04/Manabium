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
