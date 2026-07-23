# YouTube Worker

Owns the **Production** record: takes a scripted idea from the Opportunity Engine through
rendering, human review, YouTube publishing, and analytics.

## Architecture

```
Opportunity Engine (scripted idea) -> YouTube Worker -> local renderer -> YouTube Data API v3
```

The YouTube Worker never generates text itself — script content comes from the Opportunity
Engine's `/ideas/:id/script`. This service is only responsible for turning that script into
a video file and getting it published.

## Production lifecycle

```
pending -> produced -> approved/rejected -> published
```

## Rendering (video production)

`src/renderer.js` is a real, working, zero-external-API-key video pipeline:

- **Voiceover**: [`espeak-ng`](https://github.com/espeak-ng/espeak-ng) synthesizes each
  scene's voiceover text locally.
- **Visuals**: each scene becomes a title-card clip (solid background + on-screen scene
  label) built with `ffmpeg`, timed to that scene's audio duration.
- **Assembly**: scenes are concatenated into one `final.mp4` under
  `VIDEO_STORAGE_DIR/idea-<ideaId>/production-<productionId>/`.

This is intentionally a baseline, not a final-quality renderer — swap `src/renderer.js` for
something that plugs into a real TTS voice and stock footage/b-roll later without touching
the production/review/publish routes, which only depend on `renderVideo(scenes, outDir)`
returning a file path.

## Endpoints

All endpoints except `GET /health` require the `x-api-key` header if `API_KEY` is set.

### `POST /productions`

Start a production from a scripted idea. Body: `{ "ideaId": number }`. Fetches the idea
from the Opportunity Engine (`OPPORTUNITY_ENGINE_URL`), requires `idea.status ===
"scripted"`, builds a scene manifest (hook + script scenes + call-to-action), and creates a
production with `status: "pending"`.

### `GET /productions`

List productions. Optional `?status=pending|produced|approved|rejected|published` filter.

### `GET /productions/:id`

Fetch one production, including its manifest, video path, review decision, YouTube video
ID/URL, and last-fetched analytics.

### `POST /productions/:id/render`

Requires `status: "pending"`. Runs the local renderer against the manifest's scenes,
writes `final.mp4`, sets `videoPath` and `status: "produced"`.

### `POST /productions/:id/review`

Requires `status: "produced"`. Body: `{ "approved": boolean, "notes"?: string }`. Sets
`status` to `"approved"` or `"rejected"` and records `reviewNotes`.

### `POST /productions/:id/publish`

Requires `status: "approved"`. Uploads `videoPath` to YouTube via the YouTube Data API v3
(OAuth2 refresh-token flow — see Config), using the manifest's title/description. Defaults
to `privacyStatus: "private"` unless `YOUTUBE_DEFAULT_PRIVACY` or the request body's
`privacyStatus` says otherwise — nothing goes public without an explicit choice. On
success, sets `status: "published"`, `youtubeVideoId`, `youtubeUrl`, `publishedAt`.

Returns `500` with a clear message if `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`/
`YOUTUBE_REFRESH_TOKEN` aren't configured yet.

### `GET /productions/:id/analytics`

Requires the production to already be published. Fetches current `viewCount`,
`likeCount`, `commentCount` from the YouTube Data API and persists them onto the
production (`analytics`, `analyticsUpdatedAt`).

### `GET /health`

Liveness check, returns `{ "status": "ok" }`. Not gated by `API_KEY`.

## Getting a YouTube refresh token

YouTube publishing/analytics need an OAuth2 refresh token for your channel:

1. In [Google Cloud Console](https://console.cloud.google.com/), enable the **YouTube Data
   API v3** and create an OAuth 2.0 Client ID of type **Desktop app**.
2. Set `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` in this service's `.env`.
3. On a machine with a browser (not the headless VPS), run:
   ```
   npm run get-refresh-token
   ```
   Add `http://localhost:53682/oauth2callback` as an authorized redirect URI on the OAuth
   client first (see `scripts/get-refresh-token.js` for details/port override). Open the
   printed URL, approve access, and the script prints a `YOUTUBE_REFRESH_TOKEN` value.
4. Put that value in the VPS's `.env` (or the `youtube-worker` environment in
   `docker-compose.yml`).

## Config

- `OPPORTUNITY_ENGINE_URL` (optional, defaults to `http://opportunity-engine:3001`)
- `API_KEY` (optional) — shared secret required on all endpoints except `/health` when set.
- `VIDEO_STORAGE_DIR` (optional, defaults to `./data/videos`) — where rendered videos are
  written.
- `DB_PATH` (optional, defaults to `./data/youtube-worker.db`; `:memory:` for tests)
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` — required for
  `/publish` and `/analytics`.
- `YOUTUBE_DEFAULT_PRIVACY` (optional, defaults to `private`) — one of `private`,
  `unlisted`, `public`.
- `FONT_PATH` (optional) — override the font used for on-screen scene text if
  `ttf-dejavu`/`fonts-dejavu-core` isn't available at its usual path.
- `PORT` (optional, defaults to `3002`)

## Tests

```
npm test
```

Uses Node's built-in test runner (`node:test`). The Opportunity Engine call, renderer, and
YouTube API calls are mocked for the HTTP-layer tests — no network access or credentials
required. `test/renderer.test.js` includes one real integration test that actually shells
out to `espeak-ng`/`ffmpeg`/`ffprobe`; it auto-skips if those binaries aren't on `PATH`.
