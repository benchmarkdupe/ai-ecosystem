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

test('analyzeOpportunity calls the AI Gateway (not OpenRouter) and returns structured output', async (t) => {
  t.after(() => mock.restoreAll());
  const generateMock = mock.method(gatewayClient, 'generate', async (prompt, model) => {
    assert.match(prompt, /Idea: """a pet-sitting marketplace"""/);
    return VALID_DIMENSIONS_JSON;
  });

  const result = await analyzeOpportunity({ idea: 'a pet-sitting marketplace' });

  assert.equal(generateMock.mock.callCount(), 1);
  assert.equal(result.idea, 'a pet-sitting marketplace');
  assert.equal(result.profitabilityScore, 7.8);
  assert.ok(result.generatedAt);
  assert.equal(result.analysis.demand.score, 8);
});
