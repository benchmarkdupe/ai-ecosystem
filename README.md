# AI Ecosystem

Backend intelligence and automation engine for autonomous content businesses, built for
personal use first. An external frontend (e.g. Opportunity OS) is expected to consume
these services over HTTP — this repo has no frontend of its own.

```
        EXTERNAL FRONTEND (e.g. Opportunity OS)
                     |
                API requests (x-api-key)
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
| [`ai-gateway`](services/ai-gateway) | 3000 | Single OpenRouter credential; proxies text generation for every other service | working |
| [`opportunity-engine`](services/opportunity-engine) | 3001 | Idea record: research/scoring, YouTube script generation | working |
| [`youtube-worker`](services/youtube-worker) | 3002 | Production record: video rendering, review, YouTube publish, analytics | working |
| [`scheduler`](services/scheduler) | — | Recurring/automated triggering of the pipeline (e.g. daily idea generation) | not yet built |
| [`memory`](services/memory) | — | Cross-run AI memory/context | not yet built |

## The end-to-end workflow

```
Idea -> Research -> Script -> Video Production -> Review -> YouTube Publish -> Analytics
```

Concretely, against the running services:

```bash
# 1. Create an idea
curl -X POST http://localhost:3001/ideas \
  -H 'Content-Type: application/json' \
  -d '{"title": "Why compound interest feels like magic"}'
# -> { "id": 1, "status": "new", ... }

# 2. Research it (scores demand/competition/monetization/etc via the AI Gateway)
curl -X POST http://localhost:3001/ideas/1/research
# -> status: "researched", profitabilityScore, research.analysis populated

# 3. Generate a script (scene-by-scene, ready for production)
curl -X POST http://localhost:3001/ideas/1/script
# -> status: "scripted", script.scenes populated

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

- `ai-gateway`, `opportunity-engine`, `youtube-worker` each expose `GET /health`.
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
