# Opportunity Engine

Owns the **Idea** record for the AI Ecosystem: research/scoring an idea and generating a
YouTube script for it. Persists ideas in SQLite so callers (e.g. an external Opportunity OS
frontend, or the youtube-worker service) can move an idea through its lifecycle over
multiple requests instead of everything happening in one call.

## Architecture

```
Data Collectors -> Opportunity Engine -> AI Gateway -> OpenRouter
```

The Opportunity Engine never calls OpenRouter (or any model provider) directly — all AI
calls go through the AI Gateway (`AI_GATEWAY_URL`). Data collection
(`src/collectors/`) is kept separate from AI analysis (`src/analyzer.js`) so new data
sources (trend APIs, YouTube, TikTok, Google Trends, product/marketplace data) can be
added without changing the analysis logic. The collectors currently return stub/placeholder
data — they define the extension points for real integrations.

### Multi-agent research/script chains

Both research scoring and script generation run as a 2-step chain instead of a single AI
call, via the generic runner in `src/agentChain.js`:

- **Research**: `analyst` (drafts the 5-dimension scoring) → `critic` (a separate, more
  reasoning-heavy model that reviews and can override the draft — a red-team pass, not a
  rubber stamp). `profitabilityScore` is computed from the critic's numbers.
- **Script**: `writer` (drafts the scene-by-scene script) → `editor` (reviews/revises for
  hook strength, pacing, and TTS-readability). The editor's version ships.

`src/agentChain.js`'s `runChain(steps, initialInput)` is domain-agnostic — each step is
`{ role, model, buildPrompt(prior), parse(text) }` and `prior` gives every step access to
all earlier steps' parsed output by role. Adding a third role to either chain (or a new
chain entirely) means adding a step object, not changing the runner.

Models are configured via `AI_MODEL_DRAFT` (analyst/writer) and `AI_MODEL_CRITIC`
(critic/editor) — see Config below. Responses include `draftAnalysis`/`draftScript`
(the first pass) alongside the final `analysis`/`script`, plus `modelsUsed` (which model
played which role), so both passes stay inspectable.

## Idea lifecycle

```
new -> researched -> scripted
```

(Production, review, YouTube publishing, and analytics happen in the `youtube-worker`
service, which reads the idea's script back from here.)

## Endpoints

All endpoints except `GET /health` require the `x-api-key` header if `API_KEY` is set
(no-op otherwise — see Config below).

### `POST /ideas`

Create an idea. Body: `{ "title": string, "notes"?: string, "type"?: string }`
(`type` defaults to `"youtube_video"`). Returns the idea with `status: "new"`.

### `GET /ideas`

List ideas. Optional `?status=new|researched|scripted` filter.

### `GET /ideas/:id`

Fetch one idea.

### `PATCH /ideas/:id`

Update `title`, `notes`, and/or `status` (status must be one of `new`, `researched`,
`scripted`).

### `DELETE /ideas/:id`

Remove an idea. Returns `204`.

### `POST /ideas/:id/research`

Runs the same research/scoring pipeline as `POST /analyze` (below), but against the
idea's title, and persists the result onto the idea: sets `research`,
`profitabilityScore`, and moves `status` to `researched`.

Body (optional): `{ "context"?: object, "model"?: string }`

### `POST /ideas/:id/script`

Generates a YouTube script via the AI Gateway, using the idea's title/notes/research as
context, and persists it onto the idea (`status` -> `scripted`). The script is broken into
scenes so the youtube-worker's production step can render it directly:

```json
{
  "title": "...",
  "hook": "...",
  "scenes": [{ "sceneNumber": 1, "voiceover": "...", "visual": "..." }],
  "callToAction": "...",
  "estimatedDurationSeconds": 40
}
```

Body (optional): `{ "model"?: string }`

### `POST /analyze`

Stateless one-off analysis — same scoring pipeline as `/ideas/:id/research`, but for an
idea that isn't (yet) persisted. Useful for ad-hoc evaluation before deciding to create an
idea.

Request body:

```json
{
  "idea": "a subscription box for local coffee roasters",
  "context": { "notes": "optional extra context, merged with collected signals" },
  "model": "optional model override passed through to the AI Gateway"
}
```

Response:

```json
{
  "idea": "a subscription box for local coffee roasters",
  "analysis": {
    "demand": { "score": 8, "reasoning": "..." },
    "competition": { "score": 4, "reasoning": "..." },
    "monetizationPotential": { "score": 7, "reasoning": "..." },
    "startupDifficulty": { "score": 3, "reasoning": "..." },
    "automationPotential": { "score": 6, "reasoning": "..." }
  },
  "draftAnalysis": { "...": "the analyst's first pass, same shape as analysis" },
  "modelsUsed": [
    { "role": "analyst", "model": "openai/gpt-oss-20b:free" },
    { "role": "critic", "model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" }
  ],
  "profitabilityScore": 7.2,
  "generatedAt": "2026-07-23T00:00:00.000Z"
}
```

Each dimension is scored 0-10 by the model using natural semantics (10 = high demand,
high competition, high difficulty, etc). `profitabilityScore` is computed deterministically
in code (not trusted directly from the model output) as a weighted composite, inverting
`competition` and `startupDifficulty` since higher values there are worse. See
`src/analyzer.js` for the weights. `analysis` is the critic's (final) scoring; `analysis`
comes from a 2-step analyst→critic chain — see "Multi-agent research/script chains" above.

Error responses (both `/analyze` and `/ideas/:id/research`):
- `400` — missing/invalid `idea`
- `422` — AI Gateway responded but the content wasn't valid/complete JSON (includes `raw` text)
- `502` — AI Gateway was unreachable or returned an error

### `GET /health`

Liveness check, returns `{ "status": "ok" }`. Not gated by `API_KEY`.

## Config

- `AI_GATEWAY_URL` (optional, defaults to `http://ai-gateway:3000` for the Docker network)
- `AI_MODEL_DRAFT` (optional) — model used for the analyst/writer (drafting) role in both
  chains. Falls back to the AI Gateway's own default model if unset.
- `AI_MODEL_CRITIC` (optional) — model used for the critic/editor (review) role in both
  chains. Falls back to the AI Gateway's own default model if unset. Pick a different,
  reasoning-oriented model here so the review pass is a genuine second opinion, not the same
  model grading its own homework.
- `API_KEY` (optional) — if set, all endpoints except `/health` require an `x-api-key`
  header with this value. Leave unset for local/dev use.
- `DB_PATH` (optional, defaults to `./data/opportunity-engine.db`; set to `:memory:` for
  ephemeral/tests)
- `PORT` (optional, defaults to `3001`)

## Tests

```
npm test
```

Uses Node's built-in test runner (`node:test`). The AI Gateway call is mocked in tests —
no network access or API key is required to run the suite. `DB_PATH` is set to `:memory:`
for tests.
