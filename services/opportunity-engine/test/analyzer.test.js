const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const gatewayClient = require('../src/gatewayClient');
const {
  parseAnalysis,
  computeProfitabilityScore,
  analyzeOpportunity,
  AnalysisParseError,
} = require('../src/analyzer');

const VALID_DIMENSIONS_JSON = JSON.stringify({
  demand: { score: 8, reasoning: 'high interest' },
  competition: { score: 2, reasoning: 'few players' },
  monetizationPotential: { score: 7, reasoning: 'subscriptions work well' },
  startupDifficulty: { score: 3, reasoning: 'easy to launch' },
  automationPotential: { score: 9, reasoning: 'mostly automatable' },
});

test('parseAnalysis parses well-formed JSON', () => {
  const dimensions = parseAnalysis(VALID_DIMENSIONS_JSON);
  assert.equal(dimensions.demand.score, 8);
  assert.equal(dimensions.competition.score, 2);
});

test('parseAnalysis strips markdown code fences', () => {
  const fenced = '```json\n' + VALID_DIMENSIONS_JSON + '\n```';
  const dimensions = parseAnalysis(fenced);
  assert.equal(dimensions.monetizationPotential.score, 7);
});

test('parseAnalysis clamps out-of-range scores', () => {
  const raw = JSON.stringify({
    demand: { score: 15, reasoning: 'x' },
    competition: { score: -5, reasoning: 'x' },
    monetizationPotential: { score: 5, reasoning: 'x' },
    startupDifficulty: { score: 5, reasoning: 'x' },
    automationPotential: { score: 5, reasoning: 'x' },
  });
  const dimensions = parseAnalysis(raw);
  assert.equal(dimensions.demand.score, 10);
  assert.equal(dimensions.competition.score, 0);
});

test('parseAnalysis throws AnalysisParseError on invalid JSON', () => {
  assert.throws(() => parseAnalysis('not json'), AnalysisParseError);
});

test('parseAnalysis throws AnalysisParseError on missing dimension', () => {
  const raw = JSON.stringify({ demand: { score: 5, reasoning: 'x' } });
  assert.throws(() => parseAnalysis(raw), AnalysisParseError);
});

test('computeProfitabilityScore inverts competition and startupDifficulty', () => {
  const dimensions = parseAnalysis(VALID_DIMENSIONS_JSON);
  const score = computeProfitabilityScore(dimensions);
  // demand 8*0.25 + (10-2)*0.20 + 7*0.25 + (10-3)*0.15 + 9*0.15
  // = 2 + 1.6 + 1.75 + 1.05 + 1.35 = 7.75 -> rounded to 1 decimal = 7.8
  assert.equal(score, 7.8);
});

test('analyzeOpportunity runs an analyst -> critic chain and returns both passes', async (t) => {
  t.after(() => mock.restoreAll());

  const CRITIC_JSON = JSON.stringify({
    demand: { score: 6, reasoning: 'critic thinks demand is overstated' },
    competition: { score: 2, reasoning: 'few players' },
    monetizationPotential: { score: 7, reasoning: 'subscriptions work well' },
    startupDifficulty: { score: 3, reasoning: 'easy to launch' },
    automationPotential: { score: 9, reasoning: 'mostly automatable' },
  });

  let callCount = 0;
  const generateMock = mock.method(gatewayClient, 'generate', async (prompt, model) => {
    callCount += 1;
    assert.match(prompt, /Idea: """a pet-sitting marketplace"""/);
    if (callCount === 2) {
      // The critic's prompt should include the analyst's draft for review.
      assert.match(prompt, /"demand"/);
      assert.match(prompt, /high interest/);
    }
    return callCount === 1 ? VALID_DIMENSIONS_JSON : CRITIC_JSON;
  });

  const result = await analyzeOpportunity({ idea: 'a pet-sitting marketplace' });

  assert.equal(generateMock.mock.callCount(), 2);
  assert.equal(result.idea, 'a pet-sitting marketplace');
  assert.ok(result.generatedAt);

  // Analyst's draft is preserved...
  assert.equal(result.draftAnalysis.demand.score, 8);
  // ...but the critic's revision is authoritative.
  assert.equal(result.analysis.demand.score, 6);
  assert.equal(result.profitabilityScore, computeProfitabilityScore(parseAnalysis(CRITIC_JSON)));

  assert.equal(result.modelsUsed.length, 2);
  assert.deepEqual(result.modelsUsed.map((m) => m.role), ['analyst', 'critic']);
});
