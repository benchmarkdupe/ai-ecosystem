# dashboard

Minimal personal web GUI for the AI Ecosystem. Lets you run the whole
Idea -> Research -> Script -> Production -> Render -> Review -> Publish -> Analytics
workflow from a browser instead of the terminal.

It is **not** a general frontend framework app — plain HTML/CSS/vanilla JS served as
static files, no build step. It has two jobs:

1. Serve `public/` (the UI).
2. Reverse-proxy `/api/opportunity/*` -> `opportunity-engine` and `/api/youtube/*` ->
   `youtube-worker`, attaching the shared `API_KEY` header server-side so it never
   reaches the browser and there's no CORS to configure.

It also serves rendered videos at `/videos/*` (mounted read-only from the same
`storage/videos` volume `youtube-worker` writes to) so productions can be previewed
inline.

## Running

Part of the root `docker-compose.yml` — `docker compose up -d --build` starts it
alongside the other services. Open `http://<host>:8080`.

To run outside Docker for local dev:

```bash
cd services/dashboard
npm install
OPPORTUNITY_ENGINE_URL=http://localhost:3001 \
YOUTUBE_WORKER_URL=http://localhost:3002 \
VIDEO_STORAGE_DIR=../../storage/videos \
npm start
```

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Port the dashboard listens on |
| `OPPORTUNITY_ENGINE_URL` | `http://localhost:3001` | Proxy target for `/api/opportunity/*` |
| `YOUTUBE_WORKER_URL` | `http://localhost:3002` | Proxy target for `/api/youtube/*` |
| `API_KEY` | unset | Attached as `x-api-key` on proxied requests, if set |
| `VIDEO_STORAGE_DIR` | `./data/videos` | Must match `youtube-worker`'s `VIDEO_STORAGE_DIR` mount so `videoPath` values resolve |

No auth of its own — this is a single-operator tool. If you expose port 8080 beyond
localhost/your own network, put it behind your own reverse proxy/VPN; don't expose it
raw to the internet.
