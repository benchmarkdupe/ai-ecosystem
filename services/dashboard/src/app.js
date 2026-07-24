const path = require('path');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const OPPORTUNITY_ENGINE_URL = process.env.OPPORTUNITY_ENGINE_URL || 'http://localhost:3001';
const YOUTUBE_WORKER_URL = process.env.YOUTUBE_WORKER_URL || 'http://localhost:3002';
const API_KEY = process.env.API_KEY || '';
// Must match youtube-worker's VIDEO_STORAGE_DIR mount point so stored videoPath
// values (container paths from that service) resolve to real files here too.
const VIDEO_STORAGE_DIR = process.env.VIDEO_STORAGE_DIR || path.join(__dirname, '..', 'data', 'videos');

function attachApiKey(proxyReq) {
  if (API_KEY) proxyReq.setHeader('x-api-key', API_KEY);
}

function createApp() {
  const app = express();

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Reverse proxy to the backend services so the browser only ever talks to
  // this one origin (no CORS) and the shared-secret API key never reaches the client.
  app.use('/api/opportunity', createProxyMiddleware({
    target: OPPORTUNITY_ENGINE_URL,
    changeOrigin: true,
    pathRewrite: { '^/api/opportunity': '' },
    on: { proxyReq: attachApiKey },
  }));

  app.use('/api/youtube', createProxyMiddleware({
    target: YOUTUBE_WORKER_URL,
    changeOrigin: true,
    pathRewrite: { '^/api/youtube': '' },
    on: { proxyReq: attachApiKey },
  }));

  // Serves rendered mp4s so the browser can preview them; production.videoPath
  // (e.g. "/app/videos/idea-3/production-2/final.mp4") maps directly to /videos/...
  app.use('/videos', express.static(VIDEO_STORAGE_DIR));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

module.exports = { createApp };
