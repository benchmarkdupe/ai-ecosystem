// Placeholder for YouTube Data API integration.
// Future: pull related video counts, view counts, and upload frequency for the idea's niche.
async function collectYoutubeSignals(idea) {
  return {
    source: 'youtube',
    available: false,
    note: 'YouTube Data API integration not yet implemented.',
  };
}

module.exports = { collectYoutubeSignals };
