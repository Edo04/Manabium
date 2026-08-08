-- Manabium: 初回プロフィール設定の権限を修復
-- Supabase Dashboard > SQL Editor > New query に全文を貼り付けて Run してください。

begin;

alter table public.profiles
  add column if not exists interests text[] not null default '{}';

alter table public.profiles enable row level security;

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

grant select on table public.profiles to authenticated;
revoke insert on table public.profiles from authenticated;
grant insert (user_id, nickname, grade, major, interests, fish_type) on table public.profiles to authenticated;
revoke update on table public.profiles from authenticated;
grant update (nickname, grade, major, interests, fish_type) on table public.profiles to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');
