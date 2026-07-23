// Placeholder for TikTok integration.
// Future: pull hashtag/video volume and engagement signals for the idea's niche.
async function collectTiktokSignals(idea) {
  return {
    source: 'tiktok',
    available: false,
    note: 'TikTok integration not yet implemented.',
  };
}

module.exports = { collectTiktokSignals };
