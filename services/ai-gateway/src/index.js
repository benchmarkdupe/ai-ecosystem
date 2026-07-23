require('dotenv').config();
const express = require('express');

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const DEFAULT_MODEL = process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Shared-secret auth for external callers. No-op in local/dev use when API_KEY isn't set.
app.use((req, res, next) => {
  const requiredKey = process.env.API_KEY;
  if (!requiredKey) return next();

  const providedKey = req.get('x-api-key');
  if (providedKey !== requiredKey) {
    return res.status(401).json({ error: 'Missing or invalid API key' });
  }
  next();
});

app.post('/generate', async (req, res) => {
  const { prompt, model } = req.body || {};

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: '"prompt" (string) is required' });
  }

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });
  }

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    const text = data.choices?.[0]?.message?.content ?? null;
    res.json({ text, raw: data });
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach OpenRouter', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`ai-gateway listening on port ${PORT}`);
});
