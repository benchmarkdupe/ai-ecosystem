const express = require('express');
const { analyzeOpportunity, AnalysisParseError } = require('./analyzer');
const { collectContext } = require('./collectors');
const { GatewayError } = require('./gatewayClient');
const { generateScript, ScriptParseError } = require('./scriptGenerator');
const ideasStore = require('./ideasStore');
const { apiKeyMiddleware } = require('./auth');

function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(apiKeyMiddleware);

  app.post('/analyze', async (req, res) => {
    const { idea, context, model } = req.body || {};

    if (!idea || typeof idea !== 'string') {
      return res.status(400).json({ error: '"idea" (string) is required' });
    }

    try {
      const collected = await collectContext(idea);
      const mergedContext = { ...collected, ...(context || {}) };
      const result = await analyzeOpportunity({ idea, context: mergedContext, model });
      res.json(result);
    } catch (err) {
      if (err instanceof AnalysisParseError) {
        return res.status(422).json({ error: err.message, raw: err.raw });
      }
      if (err instanceof GatewayError) {
        return res.status(err.status || 502).json({ error: err.message, details: err.details });
      }
      res.status(500).json({ error: 'Unexpected error', details: err.message });
    }
  });

  // --- Idea lifecycle: new -> researched -> scripted ---
  // (production -> review -> published is owned by the youtube-worker service)

  app.post('/ideas', (req, res) => {
    const { title, notes, type } = req.body || {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: '"title" (string) is required' });
    }
    const idea = ideasStore.createIdea({ title, notes, type });
    res.status(201).json(idea);
  });

  app.get('/ideas', (req, res) => {
    const { status } = req.query;
    res.json(ideasStore.listIdeas({ status }));
  });

  app.get('/ideas/:id', (req, res) => {
    const idea = ideasStore.getIdea(req.params.id);
    if (!idea) return res.status(404).json({ error: 'Idea not found' });
    res.json(idea);
  });

  app.patch('/ideas/:id', (req, res) => {
    const existing = ideasStore.getIdea(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Idea not found' });

    const { title, notes, status } = req.body || {};
    if (status !== undefined && !ideasStore.VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `"status" must be one of: ${ideasStore.VALID_STATUSES.join(', ')}` });
    }
    const idea = ideasStore.updateIdea(req.params.id, { title, notes, status });
    res.json(idea);
  });

  app.delete('/ideas/:id', (req, res) => {
    const deleted = ideasStore.deleteIdea(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Idea not found' });
    res.status(204).end();
  });

  app.post('/ideas/:id/research', async (req, res) => {
    const idea = ideasStore.getIdea(req.params.id);
    if (!idea) return res.status(404).json({ error: 'Idea not found' });

    const { context, model } = req.body || {};

    try {
      const collected = await collectContext(idea.title);
      const mergedContext = { ...collected, ...(context || {}) };
      const result = await analyzeOpportunity({ idea: idea.title, context: mergedContext, model });
      const updated = ideasStore.updateIdea(idea.id, {
        status: 'researched',
        research: result,
        profitabilityScore: result.profitabilityScore,
      });
      res.json(updated);
    } catch (err) {
      if (err instanceof AnalysisParseError) {
        return res.status(422).json({ error: err.message, raw: err.raw });
      }
      if (err instanceof GatewayError) {
        return res.status(err.status || 502).json({ error: err.message, details: err.details });
      }
      res.status(500).json({ error: 'Unexpected error', details: err.message });
    }
  });

  app.post('/ideas/:id/script', async (req, res) => {
    const idea = ideasStore.getIdea(req.params.id);
    if (!idea) return res.status(404).json({ error: 'Idea not found' });

    const { model } = req.body || {};

    try {
      const script = await generateScript({
        title: idea.title,
        notes: idea.notes,
        research: idea.research,
        model,
      });
      const updated = ideasStore.updateIdea(idea.id, { status: 'scripted', script });
      res.json(updated);
    } catch (err) {
      if (err instanceof ScriptParseError) {
        return res.status(422).json({ error: err.message, raw: err.raw });
      }
      if (err instanceof GatewayError) {
        return res.status(err.status || 502).json({ error: err.message, details: err.details });
      }
      res.status(500).json({ error: 'Unexpected error', details: err.message });
    }
  });

  return app;
}

module.exports = { createApp };
