-- Manabium: 図書館ノートに「その他」を追加
-- Supabase Dashboard > SQL Editor > New query に全文を貼り付けて Run してください。

begin;

alter table public.lakeside_notes
  drop constraint if exists lakeside_notes_note_type_check;

alter table public.lakeside_notes
  add constraint lakeside_notes_note_type_check
  check (note_type in ('internship', 'technology', 'project', 'learning', 'other'));

commit;

select pg_notify('pgrst', 'reload schema');
