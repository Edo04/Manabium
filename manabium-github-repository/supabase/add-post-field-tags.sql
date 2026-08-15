-- ボトルに「関連分野」を追加し、興味・専攻の近い利用者への優先表示に使います。
-- Supabase Dashboard > SQL Editor で、このファイル全体を1回実行してください。

begin;

alter table public.posts
  add column if not exists field_tags text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_field_tags_limit'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_field_tags_limit check (cardinality(field_tags) <= 5);
  end if;
end $$;

create index if not exists posts_field_tags_idx
  on public.posts using gin (field_tags);

-- 後からこの追加SQLを再実行しても、管理メモ等の内部列を公開しないよう列を限定します。
revoke select, insert on table public.posts from authenticated;
grant select (id, user_id, title, body, category, post_type, field_tags, like_count, created_at, updated_at)
  on table public.posts to authenticated;
grant insert (user_id, title, body, category, post_type, field_tags)
  on table public.posts to authenticated;
grant update (title, body, category, post_type, field_tags) on table public.posts to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');
