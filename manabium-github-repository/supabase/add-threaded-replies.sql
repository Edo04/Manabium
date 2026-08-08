-- Manabium: 「返信への返信」を既存データベースへ追加
-- Supabase Dashboard > SQL Editor > New query に全文を貼り付けて Run してください。
-- 何度実行しても同じ状態になるように作成しています。

begin;

alter table public.post_replies
  add column if not exists parent_reply_id uuid;

alter table public.post_replies
  drop constraint if exists post_replies_parent_reply_id_fkey;

alter table public.post_replies
  add constraint post_replies_parent_reply_id_fkey
  foreign key (parent_reply_id)
  references public.post_replies(id)
  on delete set null;

create index if not exists post_replies_parent_created_idx
  on public.post_replies (parent_reply_id, created_at asc);

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

-- 最初の返信は元投稿者へ、返信への返信は直前の送信者へ届けます。
-- 送信先はクライアントから指定させず、データベース側で決定します。
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

  if new.recipient_user_id = new.sender_user_id then
    raise exception 'Cannot reply to yourself';
  end if;
  new.is_read := false;
  return new;
end;
$$;

drop trigger if exists post_replies_set_recipient on public.post_replies;
create trigger post_replies_set_recipient
before insert on public.post_replies
for each row execute function public.set_reply_recipient();

drop policy if exists "Users can reply as themselves to another users post" on public.post_replies;
drop policy if exists "Users can send private threaded replies" on public.post_replies;
create policy "Users can send private threaded replies"
on public.post_replies for insert
to authenticated
with check (
  (select auth.uid()) = sender_user_id
  and recipient_user_id <> sender_user_id
);

grant insert (parent_reply_id) on table public.post_replies to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');
