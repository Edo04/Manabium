-- ノートごとの公開方法を選べるようにします。
-- Supabase Dashboard > SQL Editor で実行してください。

begin;

alter table public.lakeside_notes
  add column if not exists is_anonymous boolean not null default true;

grant select (is_anonymous)
  on table public.lakeside_notes to authenticated;
grant insert (is_anonymous)
  on table public.lakeside_notes to authenticated;
grant update (is_anonymous)
  on table public.lakeside_notes to authenticated;

commit;
