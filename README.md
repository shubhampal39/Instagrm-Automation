# Instagram Post Automation (React + Node)

A simple AI-assisted Instagram automation dashboard:

- Upload photo + write caption
- Optional AI caption optimization
- Schedule date/time
- Automatic publish at scheduled time (background scheduler)

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
