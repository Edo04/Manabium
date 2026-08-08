-- Manabium: 返信の編集・削除機能を既存データベースへ追加
-- Supabase Dashboard > SQL Editor > New query に全文を貼り付けて Run してください。

begin;

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
drop policy if exists "Users can delete their own reply" on public.post_replies;
drop policy if exists "Reply senders can delete their own replies" on public.post_replies;
create policy "Reply senders can delete their own replies"
on public.post_replies for delete
to authenticated
using ((select auth.uid()) = sender_user_id);

revoke update on table public.post_replies from authenticated;
grant update (body, is_read) on table public.post_replies to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');
