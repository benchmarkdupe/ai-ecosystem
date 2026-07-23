const OPPORTUNITY_ENGINE_URL = process.env.OPPORTUNITY_ENGINE_URL || 'http://opportunity-engine:3001';

class OpportunityClientError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'OpportunityClientError';
    this.status = status;
    this.details = details;
  }
}

function authHeaders() {
  return process.env.API_KEY ? { 'x-api-key': process.env.API_KEY } : {};
}

async function getIdea(ideaId) {
  let response;
  try {
    response = await fetch(`${OPPORTUNITY_ENGINE_URL}/ideas/${ideaId}`, {
      headers: authHeaders(),
    });
  } catch (err) {
    throw new OpportunityClientError(`Failed to reach Opportunity Engine: ${err.message}`, 502);
  }

  if (response.status === 404) {
    throw new OpportunityClientError('Idea not found in Opportunity Engine', 404);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new OpportunityClientError('Opportunity Engine returned an error', response.status, data);
  }

  return data;
}

module.exports = { getIdea, OpportunityClientError, OPPORTUNITY_ENGINE_URL };
