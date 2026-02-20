# Instagram Post Automation (React + Node)

A bold AI-assisted Instagram automation dashboard:

- Upload photo + write caption
- Choose post type: Feed, Reel, or Story
- Optional AI caption optimization
- Optional random auto-comment after publish (feed/reel media)
- Schedule date/time
- Automatic publish at scheduled time (background scheduler)
- Optional autopilot agent that continuously generates and schedules baby reels

## Project structure

- `server/` - Node + Express API, scheduler, publisher
- `client/` - React + Vite dashboard

## 1) Install dependencies

```bash
npm run install:all
```

## 2) Configure environment

Copy `.env.example` to `.env` (at project root) and edit values.

Important fields:

- `PUBLISH_MODE=mock` keeps publishing local for testing.
- Set `PUBLISH_MODE=live`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID` to publish through Instagram Graph API.
- Set `OPENAI_API_KEY` to enable real AI caption optimization (otherwise fallback optimization is used).
- Set `AUTOPILOT_ENABLED=true` to run the automated reel agent.

## 3) Run server

```bash
npm run dev:server
```

Server runs at `http://localhost:4000`.

## 4) Run client

```bash
npm run dev:client
```

Client runs at `http://localhost:5173`.

## Deploy on Render (single service)

This repo includes `render.yaml` so backend + frontend can run in one web service.

1. Push this repository to GitHub.
2. In Render, create a new Blueprint/Web Service from the repo.
3. Set required environment values in Render:
   - `SERVER_BASE_URL` = your Render service URL (for example `https://your-app.onrender.com`)
   - `INSTAGRAM_ACCESS_TOKEN`
   - `INSTAGRAM_ACCOUNT_ID`
   - `PUBLISH_MODE=live`
   - Optional: `AUTOPILOT_ENABLED=true`, `AUTOPILOT_DELAY_MINUTES=60`
4. Deploy.

The server will:
- serve API under `/api/*`
- serve uploads under `/uploads/*`
- serve React app from `client/dist`

## Autopilot Agent (Set-and-Forget Mode)

When `AUTOPILOT_ENABLED=true`, a background AI agent runs automatically:

1. Generates a short animated baby reel (~10s mp4)
2. Writes an engagement-focused caption with hashtags
3. Schedules that reel for publishing after 1 hour (configurable)
4. Scheduler publishes it automatically with no manual actions

Control/status endpoints:

- `GET /api/agent/status`
- `POST /api/agent/run-now`

Note: Reel generation requires `ffmpeg` to be available on the host runtime.

## API overview

- `GET /api/health`
- `GET /api/posts`
- `POST /api/posts` (multipart fields: `media` image, `caption`, `scheduledAt`, `optimizeWithAi`)
- `PATCH /api/posts/:id`
- `POST /api/posts/:id/optimize-caption`
- `POST /api/posts/:id/publish-now`

## Notes on real Instagram publishing

For live publishing, this app assumes:

- Instagram Business/Creator account linked to a Facebook Page
- Valid long-lived access token with required permissions
- Media URL reachable by Meta Graph API

Localhost URLs are not publicly reachable by Graph API in production. Use a public URL for `SERVER_BASE_URL` (for example via a reverse proxy/tunnel).
