-- Manabium 追加マイグレーション
-- Supabase Dashboard > SQL Editor で、このファイルを一度だけ実行してください。

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

revoke update on table public.profiles from authenticated;
grant update (grade, major, interests, fish_type) on table public.profiles to authenticated;

select pg_notify('pgrst', 'reload schema');
