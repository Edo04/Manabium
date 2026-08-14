-- Manabium: 非公開の「あとで読む」を追加する差分SQL
-- Supabase Dashboard > SQL Editor で、このファイルを上から最後まで1回実行してください。
-- 既存のプロフィール、ボトル、返信、いいねは削除しません。再実行しても安全な冪等SQLです。

begin;

create table if not exists public.post_bookmarks (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_bookmarks
  alter column user_id set default auth.uid();

create index if not exists post_bookmarks_user_created_idx
  on public.post_bookmarks (user_id, created_at desc);

alter table public.post_bookmarks enable row level security;

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

revoke all on table public.post_bookmarks from anon, authenticated;
grant select, delete on table public.post_bookmarks to authenticated;
grant insert (post_id) on table public.post_bookmarks to authenticated;

-- 管理機能の利用停止チェックが導入済みの環境では、新しい表にも同じ保護を適用します。
do $$
begin
  if to_regprocedure('public.block_suspended_writes()') is not null then
    drop trigger if exists block_suspended_writes on public.post_bookmarks;
    create trigger block_suspended_writes
    before insert or update or delete on public.post_bookmarks
    for each row execute function public.block_suspended_writes();
  end if;
end $$;

commit;

select pg_notify('pgrst', 'reload schema');
