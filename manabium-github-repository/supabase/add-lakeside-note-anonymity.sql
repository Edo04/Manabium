-- ノートごとに匿名または入力した表示名を選べるようにします。
-- Supabase Dashboard > SQL Editor で実行してください。

begin;

alter table public.lakeside_notes
  add column if not exists is_anonymous boolean not null default true;
alter table public.lakeside_notes
  add column if not exists author_name text check (author_name is null or char_length(btrim(author_name)) between 1 and 40);

grant select (is_anonymous)
  on table public.lakeside_notes to authenticated;
grant insert (is_anonymous)
  on table public.lakeside_notes to authenticated;
grant update (is_anonymous)
  on table public.lakeside_notes to authenticated;
grant select (author_name)
  on table public.lakeside_notes to authenticated;
grant insert (author_name)
  on table public.lakeside_notes to authenticated;
grant update (author_name)
  on table public.lakeside_notes to authenticated;

commit;
