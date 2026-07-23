// Placeholder for Google Trends integration.
// Future: query trends API for search interest over time for the idea's keywords.
async function collectTrends(idea) {
  return {
    source: 'google-trends',
    available: false,
    note: 'Google Trends integration not yet implemented.',
  };
}

module.exports = { collectTrends };
