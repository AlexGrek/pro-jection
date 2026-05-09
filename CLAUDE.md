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
  - `GET /ws/controller/{code}` — WebSocket: exclusive controller slot ([sessions.rs](backend/src/routes/sessions.rs))
  - `GET /ws/projector/{code}` — WebSocket: projector subscriber ([sessions.rs](backend/src/routes/sessions.rs))
  - `GET /api/sessions/{code}/history` — full history array + cursor ([history.rs](backend/src/routes/history.rs))
  - `POST /api/sessions/{code}/history/undo` — step cursor back, broadcast ([history.rs](backend/src/routes/history.rs))
  - `POST /api/sessions/{code}/history/redo` — step cursor forward, broadcast ([history.rs](backend/src/routes/history.rs))
  - `/assets/*` → ServeDir (no fallback, so a missing hashed chunk 404s cleanly)
  - everything else → SPA fallback to `index.html`
- Env vars (with defaults): `HOST=0.0.0.0`, `PORT=8080`, `STORAGE_CONFIG=config/storage.yaml`, `STATIC_DIR=../frontend/dist`, `CORS_ALLOWED_ORIGINS=` (comma-separated).
- Storage YAML: only `fs` and `s3` schemes are accepted. For `fs`, relative `root` resolves against the YAML file's dir. See [storage.rs](backend/src/storage.rs).

## Session system

- [session.rs](backend/src/session.rs) — `SessionState` holds `history: Vec<String>` (raw scene JSON blobs), `cursor: usize`, `controller_connected` bool, `projector_count`, `last_disconnect: Option<Instant>`, `tx: broadcast::Sender<String>`. Helper methods: `push(scene)` appends and advances cursor (truncating redo history), `current()` returns the scene at the cursor.
- [routes/sessions.rs](backend/src/routes/sessions.rs) — WS handlers. Controller slot is exclusive: second controller gets `{"type":"error"}` and is closed. On any text frame from the controller, `session.push(raw)` is called and the raw string is broadcast to projectors — **no JSON parsing**. Late-joining clients receive `session.current()` replayed verbatim.
- [routes/history.rs](backend/src/routes/history.rs) — HTTP undo/redo. Moves the cursor and broadcasts the scene at the new position. Responses embed raw scene blobs via string formatting, no serialisation round-trip. See [history.md](history.md) for full behaviour.
- `AppState.sessions` is the shared store; it is cloned (Arc clone) for the cleanup task.
- Cleanup task (spawned from `main.rs`): runs every 60 s, retains sessions that have active clients OR whose `last_disconnect` is less than 10 minutes ago.

### WebSocket protocol

**Server → client** (typed JSON events):

| `type` | Fields | When |
|---|---|---|
| `connected` | `role`, `session_code` | On handshake |
| `controller_status` | `connected` bool | Controller connects/disconnects |
| `error` | `message` | Connection rejected (e.g. duplicate controller) |

**Controller → server → projectors** (raw scene blob, no envelope):

The controller sends the full scene JSON directly. The server stores it and broadcasts it verbatim to all projectors. There is no type wrapper added by the server.

```json
{ "objects": [ { "id": "…", "type": "text", "x": 0.5, "y": 0.3, … } ] }
```

Clients distinguish server events from scene updates by checking for a known `type` field.

## Frontend

- Pages: [App.tsx](frontend/src/App.tsx) routes:
  - `/` → [HomePage.tsx](frontend/src/pages/HomePage.tsx) — mode picker + 6-digit `CodeInput` dialog.
  - `/controller/:code` → [ControllerPage.tsx](frontend/src/pages/ControllerPage.tsx) — two-row layout: top row is Phaser canvas + layers panel; bottom row is properties panel + log + add-object panel. Sends raw scene JSON on Send / Enter. Maintains local log (not persisted by server).
  - `/projector/:code` → [ProjectorPage.tsx](frontend/src/pages/ProjectorPage.tsx) — full-screen Phaser canvas (view-only). Auto-reconnects every 3 s. Double-click returns home.
  - `/health` → [HealthPage.tsx](frontend/src/pages/HealthPage.tsx)
  - `/ws-test` → [WsTestPage.tsx](frontend/src/pages/WsTestPage.tsx)
- Vite dev server proxies `/health`, `/live`, `/ready`, `/ws`, `/api` → backend on `localhost:8080` ([vite.config.ts](frontend/vite.config.ts)).
- Tailwind: write classes directly in JSX. No config file by design — extend via CSS in [index.css](frontend/src/index.css) using `@theme` if needed.

## Scene type system

Canonical types live in [frontend/src/lib/scene.ts](frontend/src/lib/scene.ts). The JSON wire format uses snake_case to match the Rust backend conventions.

```typescript
interface Animations {}          // always {} — extensible placeholder

interface TextLayer extends BaseLayer {
  type: 'text'
  text: string
  font_size: number              // canvas pixels in 1920×1080 space
  color: string                  // #rrggbb
}

type Layer = TextLayer           // union grows as new types are added

interface Scene {
  objects: Layer[]               // ordered layer list
}
```

`BaseLayer` carries `id`, `x` (0–1), `y` (0–1), `animations`. The backend never inspects layer content.

## Phaser integration

- Scene: [ProjectionScene.ts](frontend/src/lib/phaser/ProjectionScene.ts) — 1920×1080 canvas. Maintains a `Map<id, Phaser.GameObjects.Text>` and a `Map<id, Layer>`. `applyScene(scene)` diffs the current objects against the new list, creating/updating/destroying Phaser objects as needed. In `editable` mode each text object is draggable; drag-end fires `onPositionChange(id, x, y)`. Clicking a text fires `onObjectSelect(id)`. `selectObject(id)` applies a blue stroke to the selected object.
- Wrapper: [PhaserCanvas.tsx](frontend/src/components/PhaserCanvas.tsx) — `forwardRef` component. Handle: `applyScene(scene)`, `selectObject(id | null)`, `getScene()`. Buffers calls that arrive before the game is ready (`pendingRef`). Callback refs keep `onPositionChange` / `onObjectSelect` fresh without recreating the game.
- `Phaser.Scale.FIT + CENTER_BOTH` — canvas scales to fill its container while holding 16:9. The black background hides any letterbox bars.
- Font: `"Outfit Variable"` (loaded via `@fontsource-variable/outfit` in [index.css](frontend/src/index.css)).

## History API

See [history.md](history.md) for the full cursor model, truncation-on-send behaviour, endpoint contracts, and frontend integration notes.

Summary: `GET /api/sessions/{code}/history` returns the full stack and cursor; `POST …/undo` and `POST …/redo` move the cursor and broadcast the scene at the new position to projectors. The controller applies the returned scene to its own canvas from the HTTP response body.

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
- The backend is a dumb relay for scene data — it never parses scene JSON. Keep it that way.
- Tailwind v4 only — never reintroduce `tailwind.config.js` or PostCSS configs (the Vite plugin handles everything).
- React Router stays in **library mode** (`react-router-dom` `BrowserRouter`). Don't migrate to the framework/data-router setup.
- The projector page auto-reconnects; the controller page does not (manual reconnect button only, to surface the "already connected" error clearly).
- Phaser game instances are owned by `PhaserCanvas` and destroyed on unmount. Never call `game.destroy()` from outside the component. Communicate with the scene exclusively through `PhaserCanvasHandle` (`applyScene`, `selectObject`, `getScene`).
- Don't add Phaser audio, physics, or asset loaders — the scene is text-only by design.
- The Vite proxy must cover `/api` as well as `/ws` and `/health` paths.
