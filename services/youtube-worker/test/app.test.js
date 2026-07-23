process.env.DB_PATH = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const { createApp } = require('../src/app');
const opportunityClient = require('../src/opportunityClient');
const renderer = require('../src/renderer');
const youtubeClient = require('../src/youtubeClient');

const SCRIPTED_IDEA = {
  id: 42,
  title: 'Compound interest explained',
  notes: 'Keep it beginner friendly',
  status: 'scripted',
  script: {
    title: 'Compound Interest Explained',
    hook: 'What if $10 could become $1000?',
    scenes: [
      { sceneNumber: 1, voiceover: 'Compound interest is interest on interest.', visual: 'growing coin stack' },
      { sceneNumber: 2, voiceover: 'Over decades small amounts snowball.', visual: 'chart trending upward' },
    ],
    callToAction: 'Subscribe for more finance breakdowns.',
  },
};

async function withServer(t, fn) {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return fn(`http://127.0.0.1:${port}`);
}

async function createProduction(base, idea = SCRIPTED_IDEA) {
  mock.method(opportunityClient, 'getIdea', async () => idea);
  const res = await fetch(`${base}/productions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ideaId: idea.id }),
  });
  return res.json();
}

test('GET /health returns ok', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
  });
});

test('POST /productions requires ideaId and a scripted idea', async (t) => {
  t.after(() => mock.restoreAll());

  await withServer(t, async (base) => {
    const missing = await fetch(`${base}/productions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(missing.status, 400);

    mock.method(opportunityClient, 'getIdea', async () => ({ ...SCRIPTED_IDEA, status: 'new' }));
    const wrongStatus = await fetch(`${base}/productions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId: 1 }),
    });
    assert.equal(wrongStatus.status, 400);

    mock.restoreAll();
    mock.method(opportunityClient, 'getIdea', async () => SCRIPTED_IDEA);
    const res = await fetch(`${base}/productions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId: SCRIPTED_IDEA.id }),
    });
    assert.equal(res.status, 201);
    const production = await res.json();
    assert.equal(production.status, 'pending');
    assert.equal(production.manifest.scenes.length, 4); // hook + 2 scenes + cta
  });
});

test('POST /productions/:id/render invokes the renderer and moves to produced', async (t) => {
  t.after(() => mock.restoreAll());

  await withServer(t, async (base) => {
    const production = await createProduction(base);
    mock.restoreAll();

    const renderMock = mock.method(renderer, 'renderVideo', async () => '/tmp/fake-video.mp4');
    const res = await fetch(`${base}/productions/${production.id}/render`, { method: 'POST' });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.status, 'produced');
    assert.equal(updated.videoPath, '/tmp/fake-video.mp4');
    assert.equal(renderMock.mock.callCount(), 1);

    const again = await fetch(`${base}/productions/${production.id}/render`, { method: 'POST' });
    assert.equal(again.status, 400);
  });
});

test('POST /productions/:id/review requires produced status and a boolean approved', async (t) => {
  t.after(() => mock.restoreAll());

  await withServer(t, async (base) => {
    const production = await createProduction(base);
    mock.restoreAll();

    const tooEarly = await fetch(`${base}/productions/${production.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });
    assert.equal(tooEarly.status, 400);

    mock.method(renderer, 'renderVideo', async () => '/tmp/fake-video.mp4');
    await fetch(`${base}/productions/${production.id}/render`, { method: 'POST' });

    const missingApproved = await fetch(`${base}/productions/${production.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(missingApproved.status, 400);

    const res = await fetch(`${base}/productions/${production.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true, notes: 'looks good' }),
    });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.status, 'approved');
    assert.equal(updated.reviewNotes, 'looks good');
  });
});

test('POST /productions/:id/publish requires approved status and surfaces YouTube errors', async (t) => {
  t.after(() => mock.restoreAll());

  await withServer(t, async (base) => {
    const production = await createProduction(base);
    mock.restoreAll();

    const tooEarly = await fetch(`${base}/productions/${production.id}/publish`, { method: 'POST' });
    assert.equal(tooEarly.status, 400);

    mock.method(renderer, 'renderVideo', async () => __filename); // any file that exists on disk
    await fetch(`${base}/productions/${production.id}/render`, { method: 'POST' });
    await fetch(`${base}/productions/${production.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });

    mock.method(youtubeClient, 'publishVideo', async () => {
      throw new youtubeClient.YoutubeClientError('YouTube is not configured.', 500);
    });
    const notConfigured = await fetch(`${base}/productions/${production.id}/publish`, { method: 'POST' });
    assert.equal(notConfigured.status, 500);

    mock.restoreAll();
    mock.method(youtubeClient, 'publishVideo', async () => ({
      videoId: 'abc123',
      url: 'https://www.youtube.com/watch?v=abc123',
    }));
    const res = await fetch(`${base}/productions/${production.id}/publish`, { method: 'POST' });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.status, 'published');
    assert.equal(updated.youtubeVideoId, 'abc123');
  });
});

test('GET /productions/:id/analytics requires publish first', async (t) => {
  t.after(() => mock.restoreAll());

  await withServer(t, async (base) => {
    const production = await createProduction(base);
    mock.restoreAll();

    const tooEarly = await fetch(`${base}/productions/${production.id}/analytics`);
    assert.equal(tooEarly.status, 400);
  });
});

test('apiKeyMiddleware rejects requests with wrong key when API_KEY is set', async (t) => {
  process.env.API_KEY = 'test-secret';
  t.after(() => {
    delete process.env.API_KEY;
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/productions`);
    assert.equal(res.status, 401);

    const ok = await fetch(`${base}/productions`, { headers: { 'x-api-key': 'test-secret' } });
    assert.equal(ok.status, 200);
  });
});
