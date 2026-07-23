const gatewayClient = require('./gatewayClient');

const DIMENSIONS = [
  'demand',
  'competition',
  'monetizationPotential',
  'startupDifficulty',
  'automationPotential',
];

// Profitability weights. Competition and startupDifficulty are scored by the
// model using natural semantics (10 = lots of competition / very hard to
// start), so they are inverted here before being folded into the composite
// score. Weights sum to 1.
const WEIGHTS = {
  demand: 0.25,
  competition: 0.2, // inverted
  monetizationPotential: 0.25,
  startupDifficulty: 0.15, // inverted
  automationPotential: 0.15,
};

class AnalysisParseError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = 'AnalysisParseError';
    this.raw = raw;
  }
}

function buildPrompt(idea, context) {
  return `You are a business analyst evaluating opportunities for an autonomous business platform.

Analyze the following idea and score it on 5 dimensions, each from 0 to 10 (10 = best/highest on that dimension using the natural meaning of its name).

Return ONLY valid JSON, with no markdown formatting and no commentary, in exactly this shape:
{
  "demand": { "score": number, "reasoning": string },
  "competition": { "score": number, "reasoning": string },
  "monetizationPotential": { "score": number, "reasoning": string },
  "startupDifficulty": { "score": number, "reasoning": string },
  "automationPotential": { "score": number, "reasoning": string }
}

Scoring guidance:
- demand: how much market demand/interest exists (10 = huge demand)
- competition: how saturated the market is (10 = extremely saturated/competitive)
- monetizationPotential: how easily and well it can be monetized (10 = excellent monetization)
- startupDifficulty: how hard it is to start (10 = very difficult to start)
- automationPotential: how much of the business could be run by AI workers with minimal human input (10 = fully automatable)

Idea: """${idea}"""
${context ? `\nAdditional context from data sources (may be partial or unavailable):\n${JSON.stringify(context)}` : ''}`;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  return candidate.trim();
}

function parseAnalysis(text) {
  let parsed;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch (err) {
    throw new AnalysisParseError('AI Gateway response was not valid JSON', text);
  }

  const dimensions = {};
  for (const key of DIMENSIONS) {
    const entry = parsed[key];
    const score = Number(entry?.score);
    if (!entry || Number.isNaN(score)) {
      throw new AnalysisParseError(`AI response missing/invalid dimension "${key}"`, text);
    }
    dimensions[key] = {
      score: Math.min(10, Math.max(0, score)),
      reasoning: typeof entry.reasoning === 'string' ? entry.reasoning : '',
    };
  }

  return dimensions;
}

function computeProfitabilityScore(dimensions) {
  const inverted = new Set(['competition', 'startupDifficulty']);
  let total = 0;
  for (const key of DIMENSIONS) {
    const score = dimensions[key].score;
    const normalized = inverted.has(key) ? 10 - score : score;
    total += normalized * WEIGHTS[key];
  }
  // Correct for floating-point summation error (e.g. 7.749999999999999
  // instead of 7.75) which would otherwise bias .x5 boundaries downward.
  return Math.round((total + 1e-9) * 10) / 10;
}

async function analyzeOpportunity({ idea, context, model }) {
  const prompt = buildPrompt(idea, context);
  const text = await gatewayClient.generate(prompt, model);
  const dimensions = parseAnalysis(text);
  const profitabilityScore = computeProfitabilityScore(dimensions);

  return {
    idea,
    analysis: dimensions,
    profitabilityScore,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  analyzeOpportunity,
  buildPrompt,
  parseAnalysis,
  computeProfitabilityScore,
  AnalysisParseError,
  DIMENSIONS,
  WEIGHTS,
};
