-- Manabium: 固定の公開ユーザー名を使わないプロフィールへ移行
-- Supabase Dashboard > SQL Editor > New query に全文を貼り付けて Run してください。
-- 既存の投稿・返信・プロフィール属性・内部user_idは削除しません。

begin;

-- 旧nickname列は互換性のため残しますが、一般ユーザーの参照・更新対象から外します。
-- 既存値は公開されなくなるため削除せず、運営側の移行確認に利用できます。

-- 新規登録時も認証メタデータから表示名をコピーしません。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, nickname)
  values (new.id, '')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 一般ユーザーはnicknameを変更できないようにし、公開参照権限からも外します。
revoke select on table public.profiles from authenticated;
grant select (user_id, grade, major, interests, fish_type, bio, created_at, updated_at)
  on table public.profiles to authenticated;

revoke insert on table public.profiles from authenticated;
grant insert (user_id, grade, major, interests, fish_type, bio, graduation_year)
  on table public.profiles to authenticated;

revoke update on table public.profiles from authenticated;
grant update (grade, major, interests, fish_type, bio, graduation_year)
  on table public.profiles to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');
