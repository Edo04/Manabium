-- Manabium: 湖のカテゴリ式メッセージとボトル共有を追加
-- Supabase Dashboard > SQL Editor > New query に全文を貼り付けて Run してください。
-- 既存の投稿・返信・プロフィールは削除しない、再実行可能な追加migrationです。
-- 旧版のリンク先を持たないボトル通知は、互換用の質問メッセージへ置き換えます。

begin;

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

create index if not exists aquarium_reactions_post_created_idx
  on public.aquarium_reactions (post_id, created_at desc)
  where post_id is not null;

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

  delete from public.aquarium_reactions where created_at < now() - interval '1 day';
  return new;
end;
$$;

drop policy if exists "Authenticated users can view recent aquarium reactions" on public.aquarium_reactions;
create policy "Authenticated users can view recent aquarium reactions"
on public.aquarium_reactions for select
to authenticated
using (created_at > now() - interval '6 hours');

revoke insert on table public.aquarium_reactions from authenticated;
grant insert (target_user_id, message_code, post_id) on table public.aquarium_reactions to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');
