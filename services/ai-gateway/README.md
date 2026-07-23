# AI Gateway

Proxies AI generation requests to OpenRouter so other services don't each need the API key.

## Endpoints

- `POST /generate` — body `{ "prompt": string, "model"?: string }`, returns `{ text, raw }`.
  Requires the `x-api-key` header if `API_KEY` is set (see Config).
- `GET /health` — liveness check, not gated by `API_KEY`.

## Config

- `OPENROUTER_API_KEY` (required)
- `OPENROUTER_DEFAULT_MODEL` (optional, defaults to `openai/gpt-4o-mini`)
- `API_KEY` (optional) — if set, `/generate` requires an `x-api-key` header with this
  value. Leave unset for local/dev use.
- `PORT` (optional, defaults to `3000`)
