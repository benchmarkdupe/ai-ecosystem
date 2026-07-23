process.env.DB_PATH = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const { createApp } = require('../src/app');
const gatewayClient = require('../src/gatewayClient');

const VALID_SCRIPT_JSON = JSON.stringify({
  title: 'Compound Interest Explained',
  hook: 'What if I told you $10 could become $1000?',
  scenes: [
    { sceneNumber: 1, voiceover: 'Compound interest is interest on interest.', visual: 'animated growing coin stack' },
    { sceneNumber: 2, voiceover: 'Over decades, small amounts snowball.', visual: 'chart trending upward' },
  ],
  callToAction: 'Subscribe for more finance breakdowns.',
  estimatedDurationSeconds: 45,
});

async function withServer(t, fn) {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return fn(`http://127.0.0.1:${port}`);
}

test('GET /health returns ok', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });
});

test('POST /analyze rejects missing idea', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /analyze returns structured analysis via the AI Gateway', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(gatewayClient, 'generate', async () =>
    JSON.stringify({
      demand: { score: 8, reasoning: 'x' },
      competition: { score: 2, reasoning: 'x' },
      monetizationPotential: { score: 7, reasoning: 'x' },
      startupDifficulty: { score: 3, reasoning: 'x' },
      automationPotential: { score: 9, reasoning: 'x' },
    })
  );

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea: 'a pet-sitting marketplace' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.idea, 'a pet-sitting marketplace');
    assert.equal(body.profitabilityScore, 7.8);
    assert.ok(body.analysis.demand);
  });
});

test('POST /analyze returns 422 when AI Gateway response is not valid JSON', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(gatewayClient, 'generate', async () => 'not json');

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea: 'a pet-sitting marketplace' }),
    });
    assert.equal(res.status, 422);
  });
});

test('POST /analyze surfaces AI Gateway errors', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(gatewayClient, 'generate', async () => {
    throw new gatewayClient.GatewayError('AI Gateway returned an error', 502, { error: 'boom' });
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea: 'a pet-sitting marketplace' }),
    });
    assert.equal(res.status, 502);
  });
});

test('POST /ideas creates an idea, rejects missing title', async (t) => {
  await withServer(t, async (base) => {
    const bad = await fetch(`${base}/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(bad.status, 400);

    const res = await fetch(`${base}/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Why cats knock things off tables' }),
    });
    assert.equal(res.status, 201);
    const idea = await res.json();
    assert.equal(idea.status, 'new');
    assert.ok(idea.id);
  });
});

test('GET /ideas/:id 404s for unknown id, returns idea for known id', async (t) => {
  await withServer(t, async (base) => {
    const missing = await fetch(`${base}/ideas/999999`);
    assert.equal(missing.status, 404);

    const created = await (
      await fetch(`${base}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'idea for get test' }),
      })
    ).json();

    const res = await fetch(`${base}/ideas/${created.id}`);
    assert.equal(res.status, 200);
    const idea = await res.json();
    assert.equal(idea.title, 'idea for get test');
  });
});

test('PATCH /ideas/:id updates fields and validates status', async (t) => {
  await withServer(t, async (base) => {
    const created = await (
      await fetch(`${base}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'idea for patch test' }),
      })
    ).json();

    const badStatus = await fetch(`${base}/ideas/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'not-a-real-status' }),
    });
    assert.equal(badStatus.status, 400);

    const res = await fetch(`${base}/ideas/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'updated notes' }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).notes, 'updated notes');
  });
});

test('DELETE /ideas/:id removes the idea', async (t) => {
  await withServer(t, async (base) => {
    const created = await (
      await fetch(`${base}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'idea for delete test' }),
      })
    ).json();

    const del = await fetch(`${base}/ideas/${created.id}`, { method: 'DELETE' });
    assert.equal(del.status, 204);

    const getAfter = await fetch(`${base}/ideas/${created.id}`);
    assert.equal(getAfter.status, 404);
  });
});

test('POST /ideas/:id/research runs analysis and moves idea to researched', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(gatewayClient, 'generate', async () =>
    JSON.stringify({
      demand: { score: 8, reasoning: 'x' },
      competition: { score: 2, reasoning: 'x' },
      monetizationPotential: { score: 7, reasoning: 'x' },
      startupDifficulty: { score: 3, reasoning: 'x' },
      automationPotential: { score: 9, reasoning: 'x' },
    })
  );

  await withServer(t, async (base) => {
    const created = await (
      await fetch(`${base}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'a pet-sitting marketplace' }),
      })
    ).json();

    const res = await fetch(`${base}/ideas/${created.id}/research`, { method: 'POST' });
    assert.equal(res.status, 200);
    const idea = await res.json();
    assert.equal(idea.status, 'researched');
    assert.equal(idea.profitabilityScore, 7.8);
    assert.ok(idea.research.analysis.demand);
  });
});

test('POST /ideas/:id/script generates a scene-based script and moves idea to scripted', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(gatewayClient, 'generate', async () => VALID_SCRIPT_JSON);

  await withServer(t, async (base) => {
    const created = await (
      await fetch(`${base}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'compound interest explained' }),
      })
    ).json();

    const res = await fetch(`${base}/ideas/${created.id}/script`, { method: 'POST' });
    assert.equal(res.status, 200);
    const idea = await res.json();
    assert.equal(idea.status, 'scripted');
    assert.equal(idea.script.scenes.length, 2);
    assert.equal(idea.script.scenes[0].sceneNumber, 1);
  });
});

test('POST /ideas/:id/script 404s for unknown idea', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/ideas/999999/script`, { method: 'POST' });
    assert.equal(res.status, 404);
  });
});

test('apiKeyMiddleware rejects requests with wrong key when API_KEY is set', async (t) => {
  process.env.API_KEY = 'test-secret';
  t.after(() => {
    delete process.env.API_KEY;
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/ideas`);
    assert.equal(res.status, 401);

    const ok = await fetch(`${base}/ideas`, { headers: { 'x-api-key': 'test-secret' } });
    assert.equal(ok.status, 200);
  });
});
