const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL || 'http://ai-gateway:3000';

class GatewayError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
    this.details = details;
  }
}

// The Opportunity Engine never calls OpenRouter (or any model provider)
// directly - all AI calls go through the AI Gateway.
async function generate(prompt, model) {
  let response;
  try {
    response = await fetch(`${AI_GATEWAY_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model }),
    });
  } catch (err) {
    throw new GatewayError(`Failed to reach AI Gateway: ${err.message}`, 502);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new GatewayError('AI Gateway returned an error', response.status, data);
  }

  if (!data.text) {
    throw new GatewayError('AI Gateway response did not include text', 502, data);
  }

  return data.text;
}

module.exports = { generate, GatewayError, AI_GATEWAY_URL };
