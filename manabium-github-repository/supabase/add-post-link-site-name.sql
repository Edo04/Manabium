-- ボトルの関連リンクを「サイト名 + URL」で表示するための追加SQLです。
-- 以前の add-post-external-url.sql を未実行でも、このファイルだけで必要な列が揃います。

begin;

alter table public.posts
  add column if not exists external_url text;

alter table public.posts
  add column if not exists external_site_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_external_url_format'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_external_url_format check (
        external_url is null
        or (char_length(external_url) <= 500 and external_url ~* '^https?://')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_external_site_name_length'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_external_site_name_length check (
        external_site_name is null or char_length(external_site_name) <= 80
      );
  end if;
end $$;

grant update (external_url, external_site_name) on table public.posts to authenticated;

comment on column public.posts.external_url is
  'ボトルに添付する任意の公式・参考URL。http/httpsのみ、最大500文字。';
comment on column public.posts.external_site_name is
  '関連リンクに表示する任意のサイト名。最大80文字。';

commit;

notify pgrst, 'reload schema';
