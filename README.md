# AI Ecosystem

Backend intelligence and automation engine for autonomous content businesses, built for
personal use first. Includes a minimal built-in web GUI (`dashboard`) so the whole
Idea -> YouTube pipeline is usable without touching the terminal. An external frontend
(e.g. Opportunity OS) can also consume these services over HTTP directly.

```
        BROWSER (you)                EXTERNAL FRONTEND (e.g. Opportunity OS)
              |                                    |
              v                                    |
        +-----------+                              |
        | dashboard |  (GUI + reverse proxy)        |
        +-----------+                              |
              |                                     |
              +-------------- API requests (x-api-key) --------------+
                                     |
                                     v
   +-----------------------------------------------+
   |                AI ECOSYSTEM                    |
   |                                                 |
   |   Opportunity Engine  --->  YouTube Worker      |
   |    (idea/research/script)   (produce/review/    |
   |          |                   publish/analytics) |
   |          v                        |             |
   |     AI Gateway  <------------------              |
   |          |                                      |
   +----------|--------------------------------------+
              v
          OpenRouter
```

## Services

| Service | Port | Owns | Status |
|---|---|---|---|
| [`dashboard`](services/dashboard) | 8080 | Web GUI + reverse proxy for the two APIs below | working |
| [`ai-gateway`](services/ai-gateway) | 3000 | Single OpenRouter credential; proxies text generation for every other service | working |
| [`opportunity-engine`](services/opportunity-engine) | 3001 | Idea record: research/scoring, YouTube script generation | working |
| [`youtube-worker`](services/youtube-worker) | 3002 | Production record: video rendering, review, YouTube publish, analytics | working |
| [`scheduler`](services/scheduler) | — | Recurring/automated triggering of the pipeline (e.g. daily idea generation) | not yet built |
| [`memory`](services/memory) | — | Cross-run AI memory/context | not yet built |

## The end-to-end workflow

```
Idea -> Research -> Script -> Video Production -> Review -> YouTube Publish -> Analytics
```

**Easiest way to run this: open the dashboard at `http://<your-server>:8080` and work
through Ideas -> Productions in the browser.** Every step below has a matching button
there. The curl walkthrough is kept for scripting/debugging.

```bash
# 1. Create an idea
curl -X POST http://localhost:3001/ideas \
  -H 'Content-Type: application/json' \
  -d '{"title": "Why compound interest feels like magic"}'
# -> { "id": 1, "status": "new", ... }

# 2. Research it: an analyst model drafts the scoring, a critic model
#    (separate, more reasoning-heavy) reviews and can override it - see
#    services/opportunity-engine/README.md#multi-agent-researchscript-chains
curl -X POST http://localhost:3001/ideas/1/research
# -> status: "researched", profitabilityScore, research.analysis (critic's) + research.draftAnalysis (analyst's)

# 3. Generate a script: same pattern, writer drafts then editor revises
curl -X POST http://localhost:3001/ideas/1/script
# -> status: "scripted", script.scenes (editor's) + script.draftScript (writer's)

# 4. Start a production from the scripted idea
curl -X POST http://localhost:3002/productions -H 'Content-Type: application/json' \
  -d '{"ideaId": 1}'
# -> { "id": 1, "status": "pending", manifest: {...} }

# 5. Render it (local TTS + ffmpeg, no external API key needed for this step)
curl -X POST http://localhost:3002/productions/1/render
# -> status: "produced", videoPath: ".../final.mp4"

# 6. Review it
curl -X POST http://localhost:3002/productions/1/review \
  -H 'Content-Type: application/json' -d '{"approved": true}'
# -> status: "approved"

# 7. Publish to YouTube (needs YOUTUBE_* credentials, see youtube-worker README)
curl -X POST http://localhost:3002/productions/1/publish
# -> status: "published", youtubeVideoId, youtubeUrl

# 8. Pull analytics
curl http://localhost:3002/productions/1/analytics
# -> viewCount, likeCount, commentCount
```

This is exercised end-to-end (steps 1-6, real containers, real ffmpeg/espeak-ng render) as
part of building this out — see each service's README for full endpoint docs and error
responses.

## Running it

```bash
cp .env.example .env   # fill in OPENROUTER_API_KEY at minimum
docker compose up -d --build
docker compose ps
```

- Open `http://<your-server>:8080` for the dashboard GUI.
- The default models (`OPENROUTER_DEFAULT_MODEL`, `AI_MODEL_DRAFT`, `AI_MODEL_CRITIC`) are
  all OpenRouter free-tier (`:free`) models — no credits required, just a free OpenRouter
  account/API key. Free tier is capped at 50 requests/day, 20/min account-wide; research +
  script on one idea uses 4 of those (2-step chain each). If a default model ID stops
  resolving, check https://openrouter.ai/models?max_price=0 for current free models.
- `ai-gateway`, `opportunity-engine`, `youtube-worker`, `dashboard` each expose `GET /health`.
- SQLite databases persist under `storage/db/<service>/`; rendered videos under
  `storage/videos/`. Both are host-mounted volumes, so data survives
  `docker compose restart`/`down`.
- Set `API_KEY` in `.env` to require an `x-api-key` header on every endpoint except
  `/health` — this is what an external frontend (Opportunity OS or otherwise) authenticates
  with. Leave it unset for local/dev use.

## Design principles

- **Single AI credential.** Only `ai-gateway` holds `OPENROUTER_API_KEY`; every other
  service calls it over HTTP instead of talking to OpenRouter directly.
- **Each service owns its own data.** `opportunity-engine` owns ideas (research + script);
  `youtube-worker` owns productions (render/review/publish/analytics). They talk to each
  other over HTTP, not a shared database.
- **Real over mocked, where feasible without paid credentials.** Research and script
  generation are real AI Gateway calls. Video rendering is a real local TTS + ffmpeg
  pipeline, not a stub — see `services/youtube-worker/src/renderer.js` for the extension
  point to swap in a higher-fidelity renderer later.
- **No multi-tenant/SaaS surface area.** No user accounts, billing, or org model — a single
  shared-secret `API_KEY` is the only auth, sized for one operator (you) and one trusted
  external frontend.
