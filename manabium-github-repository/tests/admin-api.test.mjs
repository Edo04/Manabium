import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/admin/dashboard.js';
import { onRequestPost } from '../functions/api/admin/action.js';
import { serverHeaders } from '../functions/_lib/admin.js';

const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_PUBLISHABLE_KEY: 'public-test', SUPABASE_SECRET_KEY: 'sb_secret_test' };
const userId = '00000000-0000-4000-8000-000000000001';
const makeRequest = (path = '/api/admin/dashboard', body, headers = {}) => new Request(`https://app.invalid${path}`, {
  method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer user-token', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
});
const answer = (data, status = 200) => new Response(JSON.stringify(data), { status });
function mockFetch(t, responses) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options });
    const next = responses.shift();
    assert.ok(next, 'unexpected request');
    return next;
  });
  return calls;
}

test('unauthenticated calls never access Supabase', async t => {
  const calls = mockFetch(t, []);
  const response = await onRequestGet({ request: new Request('https://app.invalid/api/admin/dashboard'), env });
  assert.equal(response.status, 401); assert.equal(calls.length, 0);
});
test('cross-origin calls are denied', async t => {
  const calls = mockFetch(t, []);
  assert.equal((await onRequestGet({ request: makeRequest(undefined, null, { 'Sec-Fetch-Site': 'cross-site' }), env })).status, 403);
  assert.equal(calls.length, 0);
});
test('ordinary signed-in user never invokes privileged RPC', async t => {
  const calls = mockFetch(t, [answer({ id: userId }), answer({ is_admin: false, graduation_year: null })]);
  const response = await onRequestGet({ request: makeRequest(), env });
  assert.equal(response.status, 403); assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.headers.apikey === 'public-test'));
});
test('verified admin gets actionable secret configuration error', async t => {
  mockFetch(t, [answer({ id: userId }), answer({ is_admin: true, graduation_year: null })]);
  const response = await onRequestGet({ request: makeRequest(), env: { ...env, SUPABASE_SECRET_KEY: '' } });
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'ADMIN_SECRET_MISSING');
});
test('new server key uses apikey only, after caller authorization', async t => {
  const calls = mockFetch(t, [answer({ id: userId }), answer({ is_admin: true, graduation_year: null }), answer({ headline: { total_users: 2 } })]);
  const response = await onRequestGet({ request: makeRequest(), env });
  assert.equal(response.status, 200); assert.equal(calls[2].headers.apikey, 'sb_secret_test');
  assert.equal(calls[2].headers.Authorization, undefined);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('legacy server keys send required bearer, public keys are rejected', () => {
  const key = 'eyJtest.payload.signature';
  assert.equal(serverHeaders({ SUPABASE_SERVICE_ROLE_KEY: key }).Authorization, `Bearer ${key}`);
  assert.equal(serverHeaders({ SUPABASE_SECRET_KEY: 'sb_publishable_test' }), null);
});
test('failed role lookup fails closed without invoking privileged RPC', async t => {
  const calls = mockFetch(t, [answer({ id: userId }), answer({}, 500)]);
  const response = await onRequestGet({ request: makeRequest(), env });
  assert.equal(response.status, 503); assert.equal(calls.length, 2);
});
test('invalid dates never reach analytics RPC', async t => {
  const calls = mockFetch(t, [answer({ id: userId }), answer({ is_admin: true, graduation_year: null })]);
  const response = await onRequestGet({ request: makeRequest('/api/admin/dashboard?start=2026-09-07&end=2026-01-01'), env });
  assert.equal(response.status, 400); assert.equal(calls.length, 2);
});
test('moderation sender comes from verified user, never submitted user id', async t => {
  const calls = mockFetch(t, [answer({ id: userId }), answer({ is_admin: true, graduation_year: null }), answer(null)]);
  const response = await onRequestPost({ request: makeRequest('/api/admin/action', { action: 'moderate_content', target_type: 'post', target_id: userId, status: 'hidden', p_admin_user_id: 'spoofed' }), env });
  assert.equal(response.status, 200); assert.equal(JSON.parse(calls[2].body).p_admin_user_id, userId);
});
test('database errors do not return sensitive details', async t => {
  mockFetch(t, [answer({ id: userId }), answer({ is_admin: true, graduation_year: null }), answer({ message: 'sensitive-row-value' }, 403)]);
  const response = await onRequestGet({ request: makeRequest(), env });
  assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('sensitive-row-value'));
});
