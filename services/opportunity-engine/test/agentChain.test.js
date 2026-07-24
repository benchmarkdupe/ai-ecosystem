const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const gatewayClient = require('../src/gatewayClient');
const { runChain, extractJson } = require('../src/agentChain');

test('extractJson strips markdown code fences', () => {
  assert.equal(extractJson('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extractJson('{"a":1}'), '{"a":1}');
});

test('runChain threads prior step output into later steps and returns the last step as finalOutput', async (t) => {
  t.after(() => mock.restoreAll());

  const calls = [];
  mock.method(gatewayClient, 'generate', async (prompt, model) => {
    calls.push({ prompt, model });
    return prompt;
  });

  const steps = [
    {
      role: 'draft',
      model: 'model-a',
      buildPrompt: (prior) => `draft of ${prior.input}`,
      parse: (text) => ({ text, from: 'draft' }),
    },
    {
      role: 'review',
      model: 'model-b',
      buildPrompt: (prior) => `review of: ${prior.draft.text}`,
      parse: (text) => ({ text, from: 'review' }),
    },
  ];

  const { finalOutput, prior, trace } = await runChain(steps, 'idea-123');

  assert.equal(calls.length, 2);
  assert.equal(calls[0].prompt, 'draft of idea-123');
  assert.equal(calls[0].model, 'model-a');
  assert.equal(calls[1].prompt, 'review of: draft of idea-123');
  assert.equal(calls[1].model, 'model-b');

  assert.equal(finalOutput.from, 'review');
  assert.equal(prior.draft.from, 'draft');
  assert.equal(prior.review.from, 'review');
  assert.deepEqual(trace, [
    { role: 'draft', model: 'model-a' },
    { role: 'review', model: 'model-b' },
  ]);
});

test('runChain propagates an error from a step without running later steps', async (t) => {
  t.after(() => mock.restoreAll());

  const calls = [];
  mock.method(gatewayClient, 'generate', async (prompt) => {
    calls.push(prompt);
    return 'bad';
  });

  const steps = [
    {
      role: 'draft',
      model: 'model-a',
      buildPrompt: () => 'draft prompt',
      parse: () => {
        throw new Error('parse failed');
      },
    },
    {
      role: 'review',
      model: 'model-b',
      buildPrompt: () => 'review prompt',
      parse: (text) => text,
    },
  ];

  await assert.rejects(() => runChain(steps, 'idea-123'), /parse failed/);
  assert.equal(calls.length, 1);
});
