const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

function setup(reduced = false) {
  const classes = new Set();
  const site = { hidden: false, classList: { toggle(k, on) { on ? classes.add(k) : classes.delete(k); } } };
  const styles = new Map();
  const scene = { getBoundingClientRect: () => ({ top: -900, bottom: 100 }), style: { setProperty(k, v) { styles.set(k, v); }, removeProperty(k) { styles.delete(k); } } };
  const hint = { textContent: '' };
  const buttons = ['fish', 'bottle'].map(demo => ({ dataset: { demo }, addEventListener(_, fn) { this.click = fn; } }));
  const motion = { matches: reduced, addEventListener(_, fn) { this.change = fn; } };
  const events = {};
  const frames = new Map();
  let frameId = 0;
  const document = { hidden: false };
  const c = vm.createContext({
    $: key => ({ '#authView': site, '#homepageLakeDemo': scene, '#homepageDemoHint': hint })[key],
    $$: key => key === '[data-demo]' ? buttons : [],
    matchMedia: () => motion, document, innerHeight: 900,
    window: { addEventListener(k, fn) { events[k] = fn; } },
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const start = source.indexOf('function initializePublicHomepage()');
  const end = source.indexOf('\n}', start) + 2;
  vm.runInContext(source.slice(start, end), c);
  c.initializePublicHomepage();
  return { site, scene, hint, buttons, motion, events, frames, styles, document };
}

test('homepage demo controls explain fish and bottles without registration or network calls', () => {
  const { buttons, hint } = setup();
  buttons[0].click();
  assert.match(hint.textContent, /今この湖にいる仲間/);
  buttons[1].click();
  assert.match(hint.textContent, /相談や情報/);
});

test('homepage scroll work is coalesced, bounded and stopped when reduced motion is selected', () => {
  const s = setup();
  s.events.scroll(); s.events.scroll();
  assert.equal(s.frames.size, 1);
  const frame = [...s.frames.values()][0];
  s.frames.clear(); frame();
  assert.equal(s.styles.get('--shore-shift'), '18px');
  s.events.scroll();
  s.motion.matches = true; s.motion.change();
  assert.equal(s.frames.size, 0);
  assert.equal(s.styles.has('--shore-shift'), false);
  s.events.scroll();
  assert.equal(s.frames.size, 0);
});

test('hidden homepage and reduced motion do not schedule animation frames', () => {
  const s = setup();
  s.site.hidden = true; s.events.scroll();
  assert.equal(s.frames.size, 0);
  const reduced = setup(true); reduced.events.scroll();
  assert.equal(reduced.frames.size, 0);
});

test('homepage section links have real unique targets and preserve the auth forms', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of html.matchAll(/href="#(public[^"]+)"/g)) assert.ok(ids.includes(match[1]), match[1]);
  for (const id of ['loginForm', 'signupForm', 'profileForm', 'editProfileForm', 'adminError', 'lakeSurface', 'libraryDoor']) assert.ok(ids.includes(id), id);
});
