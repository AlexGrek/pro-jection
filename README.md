# pro-jection

Wireless slide projector control over WebSocket. A controller screen sends text messages; a projector screen displays them full-screen in real time. Sessions are identified by a 6-digit numeric code and managed entirely in server RAM — no database.

## How it works

1. Open the app on two devices (or two browser tabs).
2. Pick **Controller** on one, enter any 6-digit code.
3. Pick **Projector** on the other, enter the same code.
4. Type a message on the controller and press Enter — it appears on the projector instantly.

Sessions are created on first connect and survive client disconnects. They are cleaned up automatically after all clients have been gone for 10 minutes.

## Session rules

| Rule | Detail |
|---|---|
| Code format | 6 digits, user-chosen |
| Controllers per session | **1** — a second controller is rejected with an error message |
| Projectors per session | Unlimited |
| State kept | Full message log + last message with timestamp |
| Persistence | RAM only; lost on pod restart |
| Cleanup | Removed 10 min after last client disconnects |

## WebSocket protocol

Two endpoints, both under `/ws/`:

```
ws://<host>/ws/controller/<code>
ws://<host>/ws/projector/<code>
```

### Slide data

Each `display` event and `history` message carries the full slide state:

| Field | Type | Default | Description |
|---|---|---|---|
| `text` | string | — | Message text |
| `x` | number | `0.5` | Horizontal position, 0–1 (left to right) |
| `y` | number | `0.5` | Vertical position, 0–1 (top to bottom) |
| `font_size` | number | `96` | Font size in 1920×1080 canvas pixels |
| `color` | string | `#ffffff` | Text color (hex) |

The controller sends these fields with each `send` message. The Phaser canvas on both sides operates in 1920×1080 logical pixels and scales via `Phaser.Scale.FIT` to fit the viewport.

### Server → client (JSON, tagged by `type`)

| `type` | Fields | Sent when |
|---|---|---|
| `connected` | `role`, `session_code` | On successful handshake |
| `history` | `messages[]` (`text`, `timestamp`) | After `connected`, backfills existing messages |
| `display` | `text`, `timestamp` | Controller sends a new message |
| `controller_status` | `connected` (bool) | Controller connects or disconnects |
| `error` | `message` | Connection refused (e.g. duplicate controller) |

### Client → server (controller only)

```json
{ "type": "send", "text": "Hello, world", "x": 0.5, "y": 0.3, "font_size": 96, "color": "#ffffff" }
```

All fields except `type` and `text` are optional; the server fills defaults. Projectors are receive-only.

## Stack

| Layer | Tech |
|---|---|
| Backend | Rust, Axum 0.8, tokio, `tokio::sync::broadcast` for fan-out |
| Frontend | Vite + React 19 + TypeScript, Tailwind v4, `react-router-dom`, Phaser 3 |
| Deployment | Single StatefulSet pod, Helm chart, Traefik ingress, cert-manager TLS |
| Storage | OpenDAL (`fs` on a `ReadWriteOnce` PVC) — not used for sessions |

## Running locally

```bash
task dev          # starts backend :8080 and Vite :5173 in parallel
```

Open `http://localhost:5173`. The Vite dev server proxies all `/ws/*` and `/health` paths to the backend.

## Project layout

```
backend/
  src/
    main.rs          # entry point, starts cleanup task
    app.rs           # axum router
    config.rs        # env vars
    session.rs       # SessionState, SessionStore, ServerEvent
    state.rs         # AppState (config + storage + sessions)
    storage.rs       # OpenDAL operator loader
    routes/
      health.rs      # /live, /ready, /health
      sessions.rs    # /ws/controller/:code, /ws/projector/:code
      ws_test.rs     # /ws/echo (echo test)
frontend/
  src/
    App.tsx          # routes
    pages/
      HomePage.tsx        # mode picker + 6-digit code dialog
      ControllerPage.tsx  # WS client, editable Phaser canvas, style controls, history
      ProjectorPage.tsx   # WS client, full-screen Phaser canvas, auto-reconnect
      HealthPage.tsx      # /health viewer
      WsTestPage.tsx      # /ws/echo tester
    components/
      PhaserCanvas.tsx    # forwardRef wrapper: creates/destroys Phaser.Game, exposes applySlide/getSlide
      CodeInput.tsx       # 6-digit entry dialog
      ui/                 # button, card, dialog, input
    lib/
      phaser/
        ProjectionScene.ts  # Phaser.Scene: 1920×1080 text canvas, drag support, applySlide()
helm-chart/          # StatefulSet + PVC + two Ingresses + storage ConfigMap
Dockerfile           # two-stage: host builds frontend, image copies dist/
Taskfile.yml         # dev, build, ship, logs
```

## Deployment

```bash
task ship   # frontend install → docker build+push → helm upgrade --install
```

- Image: `grekodocker/pro-jection` (`:latest` + `:<git-short-hash>`)
- Host: `proj.alexgr.space`, TLS via cert-manager
- HTTP → HTTPS redirect via Traefik `Middleware`
- PVC survives `helm uninstall` (StatefulSet volumeClaimTemplates)

## Env vars (backend)

| Var | Default | Purpose |
|---|---|---|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8080` | Bind port |
| `STORAGE_CONFIG` | `config/storage.yaml` | OpenDAL YAML path |
| `STATIC_DIR` | `../frontend/dist` | Served as SPA |
| `CORS_ALLOWED_ORIGINS` | _(empty)_ | Extra allowed origins, comma-separated |
