const express = require('express');
const path = require('path');
const fs = require('fs');
const { apiKeyMiddleware } = require('./auth');
const productionsStore = require('./productionsStore');
const opportunityClient = require('./opportunityClient');
const { OpportunityClientError } = opportunityClient;
const { buildManifest } = require('./manifest');
const renderer = require('./renderer');
const youtubeClient = require('./youtubeClient');
const { YoutubeClientError } = youtubeClient;

const VIDEO_STORAGE_DIR = process.env.VIDEO_STORAGE_DIR || path.join(__dirname, '..', 'data', 'videos');

function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(apiKeyMiddleware);

  // --- Production lifecycle: pending -> produced -> approved/rejected -> published ---

  app.post('/productions', async (req, res) => {
    const { ideaId } = req.body || {};
    if (!ideaId) {
      return res.status(400).json({ error: '"ideaId" is required' });
    }

    try {
      const idea = await opportunityClient.getIdea(ideaId);
      if (idea.status !== 'scripted') {
        return res.status(400).json({ error: `Idea must have status "scripted" (currently "${idea.status}")` });
      }
      const manifest = buildManifest(idea);
      const production = productionsStore.createProduction({ ideaId: idea.id, manifest });
      res.status(201).json(production);
    } catch (err) {
      if (err instanceof OpportunityClientError) {
        return res.status(err.status || 502).json({ error: err.message, details: err.details });
      }
      res.status(500).json({ error: 'Unexpected error', details: err.message });
    }
  });

  app.get('/productions', (req, res) => {
    res.json(productionsStore.listProductions({ status: req.query.status }));
  });

  app.get('/productions/:id', (req, res) => {
    const production = productionsStore.getProduction(req.params.id);
    if (!production) return res.status(404).json({ error: 'Production not found' });
    res.json(production);
  });

  app.post('/productions/:id/render', async (req, res) => {
    const production = productionsStore.getProduction(req.params.id);
    if (!production) return res.status(404).json({ error: 'Production not found' });
    if (production.status !== 'pending') {
      return res.status(400).json({ error: `Production must have status "pending" (currently "${production.status}")` });
    }

    try {
      const outDir = path.join(VIDEO_STORAGE_DIR, `idea-${production.ideaId}`, `production-${production.id}`);
      const finalPath = await renderer.renderVideo(production.manifest.scenes, outDir);
      const updated = productionsStore.updateProduction(production.id, { status: 'produced', videoPath: finalPath });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Rendering failed', details: err.message });
    }
  });

  app.post('/productions/:id/review', (req, res) => {
    const production = productionsStore.getProduction(req.params.id);
    if (!production) return res.status(404).json({ error: 'Production not found' });
    if (production.status !== 'produced') {
      return res.status(400).json({ error: `Production must have status "produced" (currently "${production.status}")` });
    }

    const { approved, notes } = req.body || {};
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: '"approved" (boolean) is required' });
    }

    const updated = productionsStore.updateProduction(production.id, {
      status: approved ? 'approved' : 'rejected',
      reviewDecision: approved ? 'approved' : 'rejected',
      reviewNotes: notes || null,
    });
    res.json(updated);
  });

  app.post('/productions/:id/publish', async (req, res) => {
    const production = productionsStore.getProduction(req.params.id);
    if (!production) return res.status(404).json({ error: 'Production not found' });
    if (production.status !== 'approved') {
      return res.status(400).json({ error: `Production must have status "approved" (currently "${production.status}")` });
    }
    if (!production.videoPath || !fs.existsSync(production.videoPath)) {
      return res.status(500).json({ error: 'Rendered video file not found on disk' });
    }

    const { privacyStatus } = req.body || {};

    try {
      const { videoId, url } = await youtubeClient.publishVideo({
        filePath: production.videoPath,
        title: production.manifest.title,
        description: production.manifest.description,
        privacyStatus,
      });
      const updated = productionsStore.updateProduction(production.id, {
        status: 'published',
        youtubeVideoId: videoId,
        youtubeUrl: url,
        publishedAt: new Date().toISOString(),
      });
      res.json(updated);
    } catch (err) {
      if (err instanceof YoutubeClientError) {
        return res.status(err.status || 502).json({ error: err.message, details: err.details });
      }
      res.status(500).json({ error: 'Unexpected error', details: err.message });
    }
  });

  app.get('/productions/:id/analytics', async (req, res) => {
    const production = productionsStore.getProduction(req.params.id);
    if (!production) return res.status(404).json({ error: 'Production not found' });
    if (!production.youtubeVideoId) {
      return res.status(400).json({ error: 'Production has not been published yet' });
    }

    try {
      const stats = await youtubeClient.getVideoStats(production.youtubeVideoId);
      const updated = productionsStore.updateProduction(production.id, {
        analytics: stats,
        analyticsUpdatedAt: stats.fetchedAt,
      });
      res.json(updated);
    } catch (err) {
      if (err instanceof YoutubeClientError) {
        return res.status(err.status || 502).json({ error: err.message, details: err.details });
      }
      res.status(500).json({ error: 'Unexpected error', details: err.message });
    }
  });

  return app;
}

module.exports = { createApp };
