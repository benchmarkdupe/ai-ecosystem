const gatewayClient = require('./gatewayClient');

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  return candidate.trim();
}

// Runs an ordered list of AI Gateway calls, threading each step's parsed output
// into every later step via `prior`. Each step: { role, model, buildPrompt(prior), parse(text) }.
// Generic and domain-agnostic - callers configure the chain as data, not code.
async function runChain(steps, initialInput) {
  const prior = { input: initialInput };
  const trace = [];

  for (const step of steps) {
    const prompt = step.buildPrompt(prior);
    const text = await gatewayClient.generate(prompt, step.model);
    const parsed = step.parse(text);
    prior[step.role] = parsed;
    trace.push({ role: step.role, model: step.model });
  }

  const lastRole = steps[steps.length - 1].role;
  return { finalOutput: prior[lastRole], prior, trace };
}

module.exports = { runChain, extractJson };
