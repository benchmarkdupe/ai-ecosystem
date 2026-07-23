const { collectTrends } = require('./trends');
const { collectYoutubeSignals } = require('./youtube');
const { collectTiktokSignals } = require('./tiktok');
const { collectProductData } = require('./productData');

// Data collection is kept separate from AI analysis so new sources can be
// added here without touching the analyzer. Each collector is isolated so
// one failing/unimplemented source never blocks the others.
const COLLECTORS = [collectTrends, collectYoutubeSignals, collectTiktokSignals, collectProductData];

async function collectContext(idea) {
  const results = await Promise.all(
    COLLECTORS.map(async (collector) => {
      try {
        return await collector(idea);
      } catch (err) {
        return { source: collector.name, available: false, error: err.message };
      }
    })
  );

  return { signals: results };
}

module.exports = { collectContext };
