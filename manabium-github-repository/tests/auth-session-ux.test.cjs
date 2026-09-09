const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'community.css'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/fix-private-session-context.sql'), 'utf8');

function functionSource(name) {
  const asyncMarker = `async function ${name}(`;
  const marker = source.includes(asyncMarker) ? asyncMarker : `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} exists`);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}

test('ordinary users and failed role lookups are distinct states', async () => {
  let response = { data: { graduation_year: 2030, is_admin: false }, error: null };
  const elements = [{ hidden: false }];
  const context = vm.createContext({
    state: { user: { id: 'user-a' }, isAdmin: true },
    IS_PREVIEW_MODE: false,
    supabase: { rpc: async name => { assert.equal(name, 'get_my_session_context'); return response; } },
    readableError: error => error.message,
    $$: () => elements,
    Error,
  });
  vm.runInContext(`${functionSource('loadPrivateSessionContext')}\n${functionSource('applyAdminRole')}`, context);
  const ordinary = await context.loadPrivateSessionContext();
  assert.equal(ordinary.is_admin, false);
  context.applyAdminRole(ordinary.is_admin);
  assert.equal(context.state.isAdmin, false);
  assert.equal(elements[0].hidden, true);

  response = { data: null, error: { message: 'permission denied for schema private' } };
  await assert.rejects(() => context.loadPrivateSessionContext(), /セッション情報の確認に失敗/);
});

test('protected hashes retain their destination and explain why login is required', () => {
  const location = { hash: '#mypage' };
  const context = vm.createContext({ location, decodeURIComponent });
  vm.runInContext(`${functionSource('routeFromLocation')}\n${functionSource('protectedRouteIntent')}`, context);
  assert.equal(context.protectedRouteIntent().label, 'マイページ');
  assert.equal(context.protectedRouteIntent().route.page, 'mypage');
  location.hash = '#post=bottle-1';
  assert.equal(context.protectedRouteIntent().route.postId, 'bottle-1');
  location.hash = '#publicAbout';
  assert.equal(context.protectedRouteIntent(), null);
  assert.match(html, /マイページを見るにはログインが必要です|authRouteNotice/);
});

test('forms keep actions reachable and password requirements stay scoped to new passwords', () => {
  assert.match(html, /id="loginPassword"[^>]+placeholder="パスワードを入力"/);
  assert.doesNotMatch(html, /id="loginPassword"[^>]+minlength=/);
  assert.match(html, /id="signupPassword"[^>]+minlength="10"/);
  assert.match(html, /id="resetPassword"[^>]+minlength="10"/);
  assert.match(html, /id="forgotPasswordButton"/);
  assert.ok((html.match(/form-actions-sticky/g) ?? []).length >= 5);
  assert.match(css, /position:sticky/);
  assert.match(css, /scroll-margin-bottom:120px/);
});

test('lake disclosures remain native and mobile settings have an explicit close control', () => {
  assert.match(html, /<details class="aquarium-settings">\s*<summary>/);
  assert.match(html, /<details class="lake-help">\s*<summary>/);
  assert.match(html, /id="closeAquariumSettings"/);
  assert.match(css, /\.aquarium-settings\[open\] \{ position:fixed/);
});

test('empty mypage sections contain direct next actions', () => {
  assert.match(source, /最初のボトルを書く/);
  assert.match(source, /ボトルを探す/);
  assert.match(source, /data-empty-action="compose"/);
  assert.match(source, /data-empty-action="browse"/);
});

test('session context migration exposes only current-user aggregate context', () => {
  assert.match(migration, /create or replace function public\.get_my_session_context\(\)/i);
  assert.match(migration, /where p\.user_id = auth\.uid\(\)/i);
  assert.match(migration, /where r\.user_id = auth\.uid\(\) and r\.role = 'admin'/i);
  assert.match(migration, /revoke all on function public\.get_my_session_context\(\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_my_session_context\(\) to authenticated/i);
  assert.match(migration, /has_column_privilege\('authenticated', 'public\.profiles', 'graduation_year', 'select'\)/i);
  assert.match(migration, /has_table_privilege\('authenticated', 'public\.app_user_roles', 'select'\)/i);
});
