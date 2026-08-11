-- ボトルにイベント・インターン・参考資料の公式URLを添付するための追加SQLです。
-- Supabase Dashboard > SQL Editor で、このファイル全体を1回実行してください。

begin;

alter table public.posts
  add column if not exists external_url text;

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

grant update (external_url) on table public.posts to authenticated;

comment on column public.posts.external_url is
  'ボトルに添付する任意の公式・参考URL。http/httpsのみ、最大500文字。';

commit;

notify pgrst, 'reload schema';
