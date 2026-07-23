process.env.DB_PATH = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

const ideasStore = require('../src/ideasStore');

test('createIdea inserts with default status and type', () => {
  const idea = ideasStore.createIdea({ title: 'How compound interest works' });
  assert.ok(idea.id);
  assert.equal(idea.status, 'new');
  assert.equal(idea.type, 'youtube_video');
  assert.equal(idea.research, null);
  assert.equal(idea.script, null);
});

test('getIdea returns null for missing id', () => {
  assert.equal(ideasStore.getIdea(999999), null);
});

test('listIdeas filters by status', () => {
  const a = ideasStore.createIdea({ title: 'idea A' });
  ideasStore.updateIdea(a.id, { status: 'researched' });
  const b = ideasStore.createIdea({ title: 'idea B' });

  const researched = ideasStore.listIdeas({ status: 'researched' });
  assert.ok(researched.some((i) => i.id === a.id));
  assert.ok(!researched.some((i) => i.id === b.id));
});

test('updateIdea stores research and script as JSON round-trip', () => {
  const idea = ideasStore.createIdea({ title: 'idea C' });
  const research = { profitabilityScore: 7.2, analysis: { demand: { score: 8 } } };
  const updated = ideasStore.updateIdea(idea.id, {
    status: 'researched',
    research,
    profitabilityScore: 7.2,
  });
  assert.deepEqual(updated.research, research);
  assert.equal(updated.profitabilityScore, 7.2);
});

test('deleteIdea removes the row and returns false for repeat delete', () => {
  const idea = ideasStore.createIdea({ title: 'idea D' });
  assert.equal(ideasStore.deleteIdea(idea.id), true);
  assert.equal(ideasStore.getIdea(idea.id), null);
  assert.equal(ideasStore.deleteIdea(idea.id), false);
});
