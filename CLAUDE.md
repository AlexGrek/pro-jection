# pro-jection

Single-pod full-stack app. The pod IS the file storage — OpenDAL `fs` scheme on a `ReadWriteOnce` PVC. **No database, no auth.**

Sessions (controller ↔ projector pairs) live in server RAM only and are never persisted to storage.

## Layout

- [backend/](backend/) — Rust single crate (no workspace). Axum 0.8, OpenDAL 0.55 (`fs` + `s3` only), tokio. Edition 2024.
- [frontend/](frontend/) — Vite + React 19 + TS. `react-router-dom` (library mode — `BrowserRouter`/`Routes`/`Route`, **not** the React Router framework). Tailwind v4 via the Vite plugin (`@tailwindcss/vite` + single `@import "tailwindcss"` in [src/index.css](frontend/src/index.css)) — no `tailwind.config.js`, no `postcss.config.js`.
- [helm-chart/](helm-chart/) — Helm chart. StatefulSet (1 replica) + PVC + Service + two Ingresses (HTTP→HTTPS via Traefik middleware) + storage ConfigMap.
- [Dockerfile](Dockerfile) — two-stage. Frontend is built on the **host** before `docker build`; the Dockerfile copies `frontend/dist/` → `/app/static/`.
- [Taskfile.yml](Taskfile.yml) — `task dev` runs both servers; `task ship` builds + pushes + deploys.

## Backend

- Entry: [backend/src/main.rs](backend/src/main.rs). Reads env via [config.rs](backend/src/config.rs), loads OpenDAL operator from a YAML file ([storage.rs](backend/src/storage.rs)), spawns the session cleanup task, starts the axum app.
- Routes (all unauthenticated):
  - `GET /live` — liveness, always 200
  - `GET /ready` — readiness, probes OpenDAL backend
  - `GET /health` — JSON health summary
  - `GET /ws/echo` — WebSocket echo for manual testing ([ws_test.rs](backend/src/routes/ws_test.rs))
  - `GET /ws/controller/{code}` — WebSocket: controller slot for session `code` ([sessions.rs](backend/src/routes/sessions.rs))
  - `GET /ws/projector/{code}` — WebSocket: projector subscriber for session `code` ([sessions.rs](backend/src/routes/sessions.rs))
  - `/assets/*` → ServeDir (no fallback, so a missing hashed chunk 404s cleanly)
  - everything else → SPA fallback to `index.html`
- Env vars (with defaults): `HOST=0.0.0.0`, `PORT=8080`, `STORAGE_CONFIG=config/storage.yaml`, `STATIC_DIR=../frontend/dist`, `CORS_ALLOWED_ORIGINS=` (comma-separated).
- Storage YAML: only `fs` and `s3` schemes are accepted. For `fs`, relative `root` resolves against the YAML file's dir. See [storage.rs](backend/src/storage.rs).

## Session system

- [session.rs](backend/src/session.rs) — `SessionState` (message log, `controller_connected` bool, `projector_count`, `last_disconnect: Option<Instant>`, `tx: broadcast::Sender<String>`). `SessionStore = Arc<Mutex<HashMap<String, SessionState>>>`.
- [routes/sessions.rs](backend/src/routes/sessions.rs) — WS handlers. Controller slot is exclusive: if `session.controller_connected` is already true the new connection receives `{"type":"error"}` and is closed immediately. Projectors subscribe to the broadcast channel and receive all events via `tokio::select!`. New messages are stored in `session.messages` and broadcast as pre-serialized JSON strings.
- `AppState.sessions` is the shared store; it is cloned (Arc clone) for the cleanup task.
- Cleanup task (spawned from `main.rs`): runs every 60 s, retains sessions that have active clients OR whose `last_disconnect` is less than 10 minutes ago.

### WebSocket events (server → client, JSON)

| `type` | Fields | When |
|---|---|---|
| `connected` | `role`, `session_code` | On handshake |
| `history` | `messages[]` | Backfill on connect |
| `display` | `text`, `timestamp` | New message from controller |
| `controller_status` | `connected` bool | Controller connects/disconnects |
| `error` | `message` | Rejected connection |

Controller sends: `{"type":"send","text":"..."}`. Projectors are receive-only.

## Frontend

- Pages: [App.tsx](frontend/src/App.tsx) routes:
  - `/` → [HomePage.tsx](frontend/src/pages/HomePage.tsx) — mode picker (Controller / Projector) + 6-digit `CodeInput` dialog; navigates to `/{mode}/{code}`.
  - `/controller/:code` → [ControllerPage.tsx](frontend/src/pages/ControllerPage.tsx) — connects to `/ws/controller/:code`. Hosts a Phaser canvas (editable: text draggable) + font-size slider + color picker. Sends `{type,text,x,y,font_size,color}` on Enter/button. Compact history below canvas.
  - `/projector/:code` → [ProjectorPage.tsx](frontend/src/pages/ProjectorPage.tsx) — connects to `/ws/projector/:code`. Full-screen Phaser canvas (view-only). Auto-reconnects every 3 s. Double-click returns home.
  - `/health` → [HealthPage.tsx](frontend/src/pages/HealthPage.tsx)
  - `/ws-test` → [WsTestPage.tsx](frontend/src/pages/WsTestPage.tsx)
- Vite dev server proxies `/health`, `/live`, `/ready`, `/ws` → backend on `localhost:8080` ([vite.config.ts](frontend/vite.config.ts)). The `/ws` prefix covers both `/ws/controller/*` and `/ws/projector/*`.
- Tailwind: write classes directly in JSX. No config file by design — extend via CSS in [index.css](frontend/src/index.css) using `@theme` if needed.

## Phaser integration

- Scene: [ProjectionScene.ts](frontend/src/lib/phaser/ProjectionScene.ts) — 1920×1080 canvas, one `Phaser.GameObjects.Text` object. In `editable` mode the text is interactive and draggable; drag-end fires `onPositionChange(x, y)` (normalized 0–1). `applySlide(patch)` updates text, position, font size, and color. Shows a dim placeholder hint when `text` is empty and `editable = true`.
- Wrapper: [PhaserCanvas.tsx](frontend/src/components/PhaserCanvas.tsx) — `forwardRef` component; exposes `applySlide` / `getSlide` via handle. Buffers `applySlide` calls that arrive before the game is ready (`pendingRef`). Callback ref pattern keeps `onPositionChange` fresh without recreating the game. Passes `audio: { noAudio: true }` to suppress AudioContext warnings.
- `Phaser.Scale.FIT + CENTER_BOTH` — canvas scales to fit its container while holding 16:9. Container sizing (16:9 `aspect-ratio` on controller, `w-screen h-screen` on projector) controls how large it renders.
- Font: `"Outfit Variable"` (already loaded via `@fontsource-variable/outfit` in [index.css](frontend/src/index.css)).

## Slide data model (frontend ↔ backend)

```typescript
interface SlideData {
  text: string
  x: number       // 0–1 normalized horizontal position
  y: number       // 0–1 normalized vertical position
  fontSize: number // canvas pixels in 1920×1080 coordinate space (default 96)
  color: string   // #rrggbb (default #ffffff)
}
```

Backend field name is `font_size` (snake_case); frontend converts on read (`last.font_size`) and write (`font_size: slide.fontSize`). Serde defaults in `StoredMessage` ensure old messages without these fields still deserialize correctly.

## Deployment

- Image: `grekodocker/pro-jection`. Tagged `:latest` and `:<git-short-hash>`.
- Ingress host: **proj.alexgr.space**. TLS secret defaults to `pro-jection-tls`. Wire cert-manager via `ingress.annotations` in [values.yaml](helm-chart/values.yaml).
- HTTP→HTTPS: Traefik `Middleware` (`redirectScheme`, permanent), referenced from the HTTP ingress.
- PVC: 2Gi default at `/storage`, kept across `helm uninstall` (StatefulSet semantics). The OpenDAL storage YAML is rendered by [storage-config.yaml](helm-chart/templates/storage-config.yaml) and mounted at `/etc/pro-jection/storage.yaml`.
- Probes: `/live` (liveness), `/ready` (readiness — does an OpenDAL `check()` per request, fine for one pod).

## Common tasks

- `task dev` — backend + Vite in parallel (kills existing :8080/:5173 first)
- `task frontend:build` — produces `frontend/dist/`
- `task docker:build` — builds frontend, then image with persistent buildx cache
- `task ship` — frontend install → docker push → `helm upgrade --install`
- `task template` / `task lint` — render/lint the chart locally
- `task logs` — tail pod logs

## Conventions

- Single crate at [backend/](backend/) — don't split into a workspace until there's a real second binary.
- Don't add a database or auth without explicit ask. The whole design assumes one stateful pod owning its PVC.
- Sessions are RAM-only by design. Don't persist them to the OpenDAL storage without explicit ask.
- Tailwind v4 only — never reintroduce `tailwind.config.js` or PostCSS configs (the Vite plugin handles everything).
- React Router stays in **library mode** (`react-router-dom` `BrowserRouter`). Don't migrate to the framework/data-router setup.
- The projector page auto-reconnects; the controller page does not (manual reconnect button only, to surface the "already connected" error clearly).
- Phaser game instances are owned by `PhaserCanvas` and destroyed on unmount. Never call `game.destroy()` from outside the component. Communicate with the scene exclusively through the `PhaserCanvasHandle` ref (`applySlide`, `getSlide`).
- Don't add Phaser audio, physics, or asset loaders — the scene is text-only by design.
