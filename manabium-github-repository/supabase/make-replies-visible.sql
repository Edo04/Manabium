-- Manabium: ボトルへの返信をログイン利用者全員から見えるようにする
-- Supabase Dashboard > SQL Editor > New query に全文を貼り付けて Run してください。
-- 返信ボトルの配送先、編集、削除、返信への返信の権限は変更しません。

begin;

alter table public.post_replies enable row level security;

drop policy if exists "Authenticated users can view replies" on public.post_replies;
drop policy if exists "Reply participants can view private replies" on public.post_replies;
drop policy if exists "Authenticated users can view all replies" on public.post_replies;

create policy "Authenticated users can view all replies"
on public.post_replies for select
to authenticated
using (true);

-- 管理者向けのモデレーションメモ・管理者IDは一般利用者へ返しません。
revoke select on table public.post_replies from authenticated;
grant select (id, post_id, sender_user_id, recipient_user_id, body, is_read, created_at)
  on table public.post_replies to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');
