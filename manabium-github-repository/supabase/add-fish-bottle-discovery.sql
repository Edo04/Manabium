-- Manabium: 魚からボトルへつながる定型リアクションを追加
-- Supabase Dashboard > SQL Editor > New query に全文を貼り付けて Run してください。
-- 既存の投稿・返信・presence・リアクションは削除しません。

begin;

-- 以前の定型文チェック制約を安全に差し替えます。
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

alter table public.aquarium_reactions
  add constraint aquarium_reactions_message_code_check
  check (message_code in (
    'hello', 'starting', 'new_bottle', 'question_bottle', 'info_bottle',
    'share_interest_1', 'share_interest_2', 'share_interest_3',
    'good_work', 'taking_break',
    'together', 'same_field', 'support', 'interesting', 'view_bottles', 'good_work_direct'
  ));

-- 在室確認、送信者固定、ミュート、受信設定、クールダウンは従来どおりDB側で検証します。
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
      'hello', 'starting', 'new_bottle', 'question_bottle', 'info_bottle',
      'share_interest_1', 'share_interest_2', 'share_interest_3',
      'good_work', 'taking_break'
    ) then
      raise exception 'Invalid aquarium-wide message';
    end if;

    if exists (
      select 1 from public.aquarium_reactions r
      where r.sender_user_id = auth.uid()
        and r.created_at > now() - interval '8 seconds'
    ) then
      raise exception 'Reaction cooldown';
    end if;
  else
    if new.target_user_id = auth.uid() then
      raise exception 'Cannot react to yourself';
    end if;

    if new.message_code not in (
      'together', 'same_field', 'support', 'interesting', 'view_bottles', 'good_work_direct'
    ) then
      raise exception 'Invalid direct reaction';
    end if;

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
        and r.created_at > now() - interval '20 seconds'
    ) then
      raise exception 'Reaction target cooldown';
    end if;

    if exists (
      select 1 from public.aquarium_reactions r
      where r.sender_user_id = auth.uid()
        and r.created_at > now() - interval '5 seconds'
    ) then
      raise exception 'Reaction cooldown';
    end if;
  end if;

  delete from public.aquarium_reactions
  where created_at < now() - interval '1 day';

  return new;
end;
$$;

drop trigger if exists aquarium_reaction_validate on public.aquarium_reactions;
drop trigger if exists aquarium_reactions_validate on public.aquarium_reactions;
create trigger aquarium_reactions_validate
before insert on public.aquarium_reactions
for each row execute function public.validate_aquarium_reaction();

commit;
