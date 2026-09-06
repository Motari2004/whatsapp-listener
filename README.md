# WhatsApp Listener

A deployable service that:
- Serves a scannable QR code on a web page (`/qr`) instead of a terminal
- Persists the WhatsApp Web session to disk via `LocalAuth`, so you only scan once
- Listens for incoming messages, logs them, and optionally forwards them to a webhook

Built on [`whatsapp-web.js`](https://wwebjs.dev/), which drives a real WhatsApp Web
session under the hood via a headless browser (Puppeteer).

## ⚠️ Before you deploy this anywhere

- This automates *your personal* WhatsApp Web session. It is **not** the official
  WhatsApp Business API, and using it for bulk messaging or automated outbound spam
  violates WhatsApp's Terms of Service and risks your number getting banned. Personal
  automation / notifications / a single bot account is the intended use case.
- **Protect the dashboard.** Anyone who loads your `/qr` page while it's showing an
  unscanned code can link their own device to your WhatsApp account. Always set
  `DASHBOARD_TOKEN` in production so the pages require `?token=...`.
- The session data in `.wwebjs_auth` is equivalent to being logged into your WhatsApp.
  Never commit it to git or expose it publicly (the included `.gitignore` handles this).

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Then open `http://localhost:3000/qr` and scan it with **WhatsApp app → Settings →
Linked Devices → Link a Device**. Once you see `ready` in the terminal/dashboard,
incoming messages will start showing up in the terminal and at `/messages`.

Session data is saved to `./.wwebjs_auth`, so stopping and restarting `node server.js`
should NOT require rescanning.

## Deploy to Render

This repo includes a `Dockerfile` (needed because Render's default Node environment
doesn't ship Chromium's system libraries — Puppeteer needs them) and a `render.yaml`
blueprint.

1. Push this project to a GitHub repo.
2. In Render, choose **New → Blueprint**, point it at your repo. Render will read
   `render.yaml` automatically.
3. **Persistent disk requires a paid instance type** (not the free tier) — the
   blueprint uses `plan: starter`. Without a real disk, the session resets on every
   restart/deploy and you'll have to rescan the QR code each time.
4. After the first deploy, set these environment variables in the Render dashboard
   (they're marked `sync: false` in the blueprint so Render won't ask for them in git):
   - `DASHBOARD_TOKEN` — make up a long random string
   - `WEBHOOK_URL` — optional, only if you want messages forwarded somewhere
5. Once deployed, visit `https://your-service.onrender.com/qr?token=YOUR_TOKEN` and
   scan it. Check `/status?token=YOUR_TOKEN` to confirm it flips to `ready`.
6. From then on, as long as the disk persists, redeploys/restarts should NOT require
   rescanning — only a manual WhatsApp unlink or a wiped disk will require it again.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /` | Dashboard: status + last 50 messages |
| `GET /qr` | Shows the QR code image (only relevant before authentication) |
| `GET /status` | JSON status (`starting`, `qr`, `authenticated`, `ready`, `disconnected`, `auth_failure`) |
| `GET /messages` | JSON array of recently received messages |
| `GET /health` | Plain health check for Render |

All except `/health` require `?token=YOUR_TOKEN` (or an `x-dashboard-token` header) if
`DASHBOARD_TOKEN` is set.

## Customizing message handling

Edit the `client.on('message', ...)` handler in `server.js`. There's a commented-out
auto-reply example (`ping` → `pong`) to show the pattern — uncomment and extend as
needed, or route messages into `WEBHOOK_URL` and handle logic elsewhere (e.g. Zapier,
n8n, your own backend).
