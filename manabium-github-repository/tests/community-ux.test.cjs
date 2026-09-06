const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

// Exercise the production helpers without booting Supabase or sending telemetry.
function setup() {
  const fields = new Map();
  function field(id) {
    if (!fields.has(id)) fields.set(id, { value: '', hidden: false, dataset: {} });
    return fields.get(id);
  }
  const context = vm.createContext({
    state: { user: { id: 'a' }, writingDrafts: new Map(), postOwnership: 'saved', selectedCategory: '研究', selectedNoteType: 'project', selectedLibraryShelf: 'saved' },
    $: field,
    $$: (selector, container) => container?.buttons ?? [...fields.values()].filter(f => f.dataset.writingDraft),
    renderPosts() {}, renderNotes() {},
  });
  for (const name of ['writingDraftKey', 'rememberTextDraft', 'attachTextDraft', 'clearTextDraft', 'applyPostSearch', 'resetPostFilters', 'resetNoteFilters', 'syncFilterButtons']) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `production helper ${name} exists`);
    const end = source.indexOf('\n}', start) + 2;
    vm.runInContext(source.slice(start, end), context);
  }
  return { context, field };
}

test('switching bottles does not carry a reply into the next bottle', () => {
  const { context: c, field } = setup();
  const input = field('reply');
  c.attachTextDraft(input, 'post-reply', 'bottle-a');
  input.value = 'まだ送っていない返信';
  c.attachTextDraft(input, 'post-reply', 'bottle-b');
  assert.equal(input.value, '');
  c.attachTextDraft(input, 'post-reply', 'bottle-a');
  assert.equal(input.value, 'まだ送っていない返信');
});

test('draft keys isolate users and content types', () => {
  const { context: c } = setup();
  const first = c.writingDraftKey('post-reply', 'one');
  assert.notEqual(first, c.writingDraftKey('note-comment', 'one'));
  c.state.user.id = 'b';
  assert.notEqual(first, c.writingDraftKey('post-reply', 'one'));
  c.state.user = null;
  assert.equal(c.writingDraftKey('post-reply', 'one'), '');
});

test('reconstructed reply editor restores unsent text, not original text', () => {
  const { context: c, field } = setup();
  const original = field('original');
  c.attachTextDraft(original, 'reply-edit', 'reply-1', '元の内容');
  original.value = '書き直し中';
  c.rememberTextDraft(original);
  const replacement = field('replacement');
  c.attachTextDraft(replacement, 'reply-edit', 'reply-1', '元の内容');
  assert.equal(replacement.value, '書き直し中');
});

test('successful submission clears only the submitted draft', () => {
  const { context: c, field } = setup();
  const input = field('reply');
  c.attachTextDraft(input, 'post-reply', 'a');
  input.value = 'a';
  c.attachTextDraft(input, 'post-reply', 'b');
  input.value = 'b';
  c.clearTextDraft('post-reply', 'a');
  assert.equal(input.value, 'b');
  assert.equal(c.state.writingDrafts.has('a:post-reply:a'), false);
});

test('search preserves spaces while typing; reset clears every bottle filter', () => {
  const { context: c, field } = setup();
  c.applyPostSearch('AI ');
  assert.equal(field('#postSearchInput').value, 'AI ');
  assert.equal(c.state.postSearchQuery, 'AI ');
  c.resetPostFilters();
  assert.equal(c.state.postOwnership, 'all');
  assert.equal(c.state.selectedCategory, 'all');
  assert.equal(field('#postSearchInput').value, '');
  assert.equal(field('#clearPostSearchButton').hidden, true);
});

test('note filter reset does not silently change the selected bookshelf', () => {
  const { context: c } = setup();
  c.state.noteSearchQuery = 'AI';
  c.resetNoteFilters();
  assert.equal(c.state.selectedNoteType, 'all');
  assert.equal(c.state.noteSearchQuery, '');
  assert.equal(c.state.selectedLibraryShelf, 'saved');
});

test('filter buttons expose the same selected state visually and to assistive technology', () => {
  const { context: c } = setup();
  const buttons = ['all', 'mine', 'saved'].map(value => ({
    attrs: { 'data-library-shelf': value }, active: false,
    classList: { toggle(name, active) { this.active = active; } },
    getAttribute(name) { return this.attrs[name]; },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
  }));
  c.syncFilterButtons({ buttons }, 'library-shelf', 'saved');
  for (const b of buttons) {
    const selected = b.attrs['data-library-shelf'] === 'saved';
    assert.equal(b.attrs['aria-pressed'], String(selected));
    assert.equal(b.classList.active, selected);
    assert.equal(b.attrs['aria-current'], selected ? 'page' : undefined);
  }
});
