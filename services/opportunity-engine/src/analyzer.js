const { runChain, extractJson } = require('./agentChain');

const AI_MODEL_DRAFT = process.env.AI_MODEL_DRAFT || undefined;
const AI_MODEL_CRITIC = process.env.AI_MODEL_CRITIC || undefined;

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

function buildCriticPrompt(idea, context, draftAnalysis) {
  return `You are a skeptical senior analyst reviewing a junior analyst's scoring of a business idea. Your job is to catch overly optimistic or lazy scoring, not to rubber-stamp it.

Idea: """${idea}"""
${context ? `\nAdditional context from data sources (may be partial or unavailable):\n${JSON.stringify(context)}` : ''}

Junior analyst's draft scoring:
${JSON.stringify(draftAnalysis, null, 2)}

Re-score the same 5 dimensions from 0 to 10 yourself. Where you agree with the draft, you may keep the same score but should sharpen the reasoning. Where you disagree, change the score and explain specifically why the draft was wrong. Do not just copy the draft.

Return ONLY valid JSON, with no markdown formatting and no commentary, in exactly this shape:
{
  "demand": { "score": number, "reasoning": string },
  "competition": { "score": number, "reasoning": string },
  "monetizationPotential": { "score": number, "reasoning": string },
  "startupDifficulty": { "score": number, "reasoning": string },
  "automationPotential": { "score": number, "reasoning": string }
}`;
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

// Two-agent chain: an analyst drafts the scoring, then a critic (a separate,
// reasoning-oriented model) reviews and can override it. The critic's output
// is authoritative - it's what profitabilityScore is computed from.
async function analyzeOpportunity({ idea, context, model }) {
  const steps = [
    {
      role: 'analyst',
      model: model || AI_MODEL_DRAFT,
      buildPrompt: () => buildPrompt(idea, context),
      parse: parseAnalysis,
    },
    {
      role: 'critic',
      model: AI_MODEL_CRITIC,
      buildPrompt: (prior) => buildCriticPrompt(idea, context, prior.analyst),
      parse: parseAnalysis,
    },
  ];

  const { finalOutput, prior, trace } = await runChain(steps, idea);
  const profitabilityScore = computeProfitabilityScore(finalOutput);

  return {
    idea,
    analysis: finalOutput,
    draftAnalysis: prior.analyst,
    profitabilityScore,
    modelsUsed: trace,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  analyzeOpportunity,
  buildPrompt,
  buildCriticPrompt,
  parseAnalysis,
  computeProfitabilityScore,
  AnalysisParseError,
  DIMENSIONS,
  WEIGHTS,
};
