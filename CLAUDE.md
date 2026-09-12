# pro-jection

Single-pod full-stack app. The pod IS the file storage — OpenDAL `fs` scheme on a `ReadWriteOnce` PVC. **No database, no auth.**

Sessions (controller ↔ projector pairs) live in server RAM only and are never persisted to storage.

> **This file is a map, not a spec.** It exists to save tokens by pointing at the right file instead of restating its contents. Before relying on a claim here about behavior, an API shape, or a gotcha — **open the referenced file first**; source comments there are the source of truth and this doc can lag behind them. If something here contradicts the code, trust the code and fix this file.
>
> **Keep this file up to date.** Any change that adds/removes/renames a file this doc references, adds a route, adds a layer/renderer/controller-component kind, or changes a documented convention or gotcha must update the relevant line here in the same change — don't leave it for later. Treat a stale reference here as a bug, the same as a stale code comment.

## Layout

- [backend/](backend/) — Rust single crate (no workspace). Axum 0.8, OpenDAL 0.55 (`fs` + `s3` only), tokio. Edition 2024.
- [frontend/](frontend/) — Vite + React 19 + TS. `react-router-dom` (library mode — `BrowserRouter`/`Routes`/`Route`, **not** the React Router framework). Tailwind v4 via the Vite plugin (`@tailwindcss/vite` + single `@import "tailwindcss"` in [src/index.css](frontend/src/index.css)) — no `tailwind.config.js`, no `postcss.config.js`.
- [helm-chart/](helm-chart/) — Helm chart. StatefulSet (1 replica) + PVC + Service + two Ingresses (HTTP→HTTPS via Traefik middleware) + storage ConfigMap.
- [Dockerfile](Dockerfile) — two-stage. Frontend is built on the **host** before `docker build`; the Dockerfile copies `frontend/dist/` → `/app/static/`.
- [Taskfile.yml](Taskfile.yml) — `task dev` runs both servers; `task ship` builds + pushes + deploys.

## Backend

Read [app.rs](backend/src/app.rs) for the canonical route table and middleware (CORS, static/SPA fallback, archive body-limit). Read [main.rs](backend/src/main.rs) for startup order and the two background tasks (session cleanup, scene GC). Read [state.rs](backend/src/state.rs) for `AppState`'s shape.

- [config.rs](backend/src/config.rs) — env vars: `HOST`, `PORT`, `STORAGE_CONFIG`, `STATIC_DIR`, `CORS_ALLOWED_ORIGINS` (comma-separated). Check this file for current defaults.
- [storage.rs](backend/src/storage.rs) — loads the OpenDAL operator from YAML; only `fs` and `s3` schemes accepted; relative `fs` `root` resolves against the YAML file's dir.
- Route handlers, one file per concern under [routes/](backend/src/routes/): [ws_test.rs](backend/src/routes/ws_test.rs) (echo), [sessions.rs](backend/src/routes/sessions.rs) (controller/projector WS), [history.rs](backend/src/routes/history.rs) (undo/redo — see [history.md](history.md)), [scenes.rs](backend/src/routes/scenes.rs) (saved scenes CRUD + GC — see [scenes.md](scenes.md)), [archive.rs](backend/src/routes/archive.rs) (ZIP export/import — see [scenes.md](scenes.md)), [assets.rs](backend/src/routes/assets.rs) (upload/serve media), [health.rs](backend/src/routes/health.rs).

## Session system

Read [session.rs](backend/src/session.rs) for `SessionState`'s fields and its `push`/`current` cursor helpers, and [sessions.rs](backend/src/routes/sessions.rs) for the WS handshake/broadcast logic. Key invariant to preserve: the controller's scene blob is broadcast to projectors **without JSON parsing** — the backend is a dumb relay.

**Server → client** typed JSON events (check `ServerEvent` in [session.rs](backend/src/session.rs) for the current variants): `connected` (handshake), `controller_status` (connect/disconnect), `error` (e.g. duplicate controller, connection then closed).

**Controller → server → projectors**: the raw scene JSON, no envelope — server stores it and rebroadcasts verbatim. Clients tell server events from scene updates by checking for a known `type` field.

## Frontend

- Routes defined in [App.tsx](frontend/src/App.tsx) — check it for the current path list; pages live under [pages/](frontend/src/pages/) (`HomePage`, `ControllerPage`, `ProjectorPage`, `HealthPage`, `WsTestPage`).
- [ControllerPage.tsx](frontend/src/pages/ControllerPage.tsx) — **auto-sends** the full scene at every commit point, there is no Send button (see Conventions). State and send are split: `applyObjects` updates local state/canvas; `sendNow` / `sendDebounced` / `sendCurrent` push over WebSocket.
- [ProjectorPage.tsx](frontend/src/pages/ProjectorPage.tsx) — full-screen, view-only, auto-reconnects every 3 s, double-click returns home.
- Vite dev proxy ([vite.config.ts](frontend/vite.config.ts)) must cover `/health`, `/live`, `/ready`, `/ws`, `/api` → backend on `localhost:8080`. Check this file if a new backend path stops working in dev.
- Tailwind: write classes directly in JSX. No config file by design — extend via CSS in [index.css](frontend/src/index.css) using `@theme` if needed.

### Controller architecture

Type-specific UI lives under [components/controller/](frontend/src/components/controller/). Property panels take `{ layer, controls }` where `controls: PropertyControls` bundles mutation/send helpers — check [types.ts](frontend/src/components/controller/types.ts) for the contract. One file per layer kind (`TextProperties`, `ShapeProperties`, `FillProperties`, `IconProperties`, `ImageProperties`, `VideoProperties`, `BarcodeProperties`, `RaysProperties`, `GrainProperties`, `CodeProperties`, `ConcentricProperties`, `LinesProperties`), plus per-modifier/animation panels (`ArrayModifierPanel`, `GlowModifierPanel`, `MatrixModifierPanel`, `GlowAnimationPanel`), picker modals (`FontPickerModal`, `IconPickerModal`), `SceneStorageDialogs` (save/load/export/import UI), `HotkeysMenu`, `LayerRow`, `AddObjectPanel`, `GridControl`, `ProjectionControl`, `PropertyRow`, `ColorPicker`. Open the specific file for its exact props/behavior rather than assuming from the name.

Send timing is a deliberate contract, not per-component discretion — check a component against this table before changing its send behavior:

| Input | Timing |
|---|---|
| Text input | `sendDebounced` (350 ms) |
| Font / Shape / Fill kind / Add layer / Reorder / Drag-end | `sendNow` immediate |
| Sliders (size, alpha, width, height, stroke, angle, stop alpha) | preview on `onChange`, `sendCurrent` on `onPointerUp` / `onKeyUp` |
| Mouse-wheel resize | `sendDebounced` (350 ms) per tick |
| Projection on/off / reset / calibration toggle / grid colour | `sendNow` immediate |
| Projection corner drag | throttled `sendNow` (500 ms) + `sendNow` on drag-end |
| Projection corner arrow-key nudge | `sendDebounced` (350 ms) per repeat, `sendNow` on key-up |
| Color picker | `sendDebounced` while tuning via `onChange(hex)`; `sendNow` on commit via `onCommit(hex)` — see the last Conventions bullet for why commit can't use `sendCurrent` |

The layers panel renders in **reverse** array order (top-of-panel = front-of-stack). `moveLayer(from, to)` operates on real array indices.

## Scene type system

Canonical types live under [frontend/src/lib/scene/](frontend/src/lib/scene/), one file per layer kind, re-exported from [index.ts](frontend/src/lib/scene/index.ts) — **check that file for the current `Layer` union**, it grows independently of this doc. JSON wire format is snake_case to match Rust conventions; the backend never inspects layer content. Layer kinds as of writing: text, shape (rect/circle), fill (solid/gradient), icon, image, video, barcode, rays, grain, code, concentric, lines — but verify against `index.ts` rather than this list.

`base.ts` defines `BaseLayer` (`id`, `x`/`y` 0–1, `opacity`, `animations`, `modifiers`) plus the `Animations`/`Modifier` union (glow animation; array/glow/matrix modifiers) — check it for exact fields, they carry non-obvious ranges/units in doc comments. `grid.ts` and `projection.ts` hold the two scene-wide (non-layer) settings that ride along on every send: grid overlay and keystone-warp projection; absent means off for both.

Adding a new layer type: add a file under `lib/scene/`, extend the `Layer` union in `index.ts`, add a renderer under `lib/phaser/renderers/`, add a Properties component under `components/controller/`. See [images.md](images.md) for a worked example.

## Phaser integration

Core files — read them directly, their doc comments carry the non-obvious reasoning (pointer-mapping math, why a tween trick doesn't work, etc.) rather than restating it here:

- [ProjectionScene.ts](frontend/src/lib/phaser/ProjectionScene.ts) — 1920×1080 scene, owns `gameObjects`/`layerData` maps, dispatches `applyScene` to per-type renderers, implements [`RenderCtx`](frontend/src/lib/phaser/renderers/types.ts), handles canvas layout/centring (`_layoutCanvas`) and the keystone CSS transform.
- [lib/phaser/renderers/](frontend/src/lib/phaser/renderers/) — one file per layer kind (`text`, `shape`, `fill`, `icon`, `image`, `video`, `barcode`, `rays`, `grain`, `code`, `concentric`, `lines`) plus `grid.ts`/`calibration.ts` for the two overlay grids, dispatched outside the per-layer loop.
- [warp.ts](frontend/src/lib/phaser/warp.ts) — pure homography math for the keystone `matrix3d`. Read its header comment before touching corner/projection logic; it explains why the warp is CSS-only (Phaser 4 has no Mesh/Plane) and the pointer-mapping consequences.
- [PhaserCanvas.tsx](frontend/src/components/PhaserCanvas.tsx) — `forwardRef` wrapper; handle is `applyScene`/`selectObject`/`getScene`, buffers calls before the game is ready.
- [constants.ts](frontend/src/lib/phaser/constants.ts) — selection styling and other shared constants.
- Fonts: `@fontsource*` packages imported in [index.css](frontend/src/index.css); catalogue in [scene/fonts.ts](frontend/src/lib/scene/fonts.ts).

**Known gotcha (kept here because it's a trap, not documented in a docstring you'd find first):** `this.tweens.add({ targets: this, … })` where `this` is the `Phaser.Scene` does not reliably update custom properties. For per-frame animation in `update()`, compute the value from `this.time.now` directly instead.

## History API

See [history.md](history.md) for the full cursor model, truncation-on-send behaviour, endpoint contracts, and frontend integration notes — don't infer this from route names, the truncation-on-send rule is easy to get wrong.

## Deployment

- Image: `grekodocker/pro-jection`. Tagged `:latest` and `:<git-short-hash>`.
- Ingress host: **proj.alexgr.space**. TLS secret defaults to `pro-jection-tls`. Wire cert-manager via `ingress.annotations` in [values.yaml](helm-chart/values.yaml).
- HTTP→HTTPS: Traefik `Middleware` (`redirectScheme`, permanent), referenced from the HTTP ingress.
- PVC: 2Gi default at `/storage`, kept across `helm uninstall` (StatefulSet semantics). OpenDAL storage YAML rendered by [storage-config.yaml](helm-chart/templates/storage-config.yaml), mounted at `/etc/pro-jection/storage.yaml`.
- Probes: `/live` (liveness), `/ready` (readiness — OpenDAL `check()` per request, fine for one pod).

## Common tasks

- `task dev` — backend + Vite in parallel (kills existing :8080/:5173 first)
- `task frontend:build` — produces `frontend/dist/`
- `task docker:build` — builds frontend, then image with persistent buildx cache
- `task ship` — frontend install → docker push → `helm upgrade --install`
- `task template` / `task lint` — render/lint the chart locally
- `task logs` — tail pod logs

Check [Taskfile.yml](Taskfile.yml) for the full list and exact behavior before assuming a task does what its name implies.

## Conventions

- Single crate at [backend/](backend/) — don't split into a workspace until there's a real second binary.
- Don't add a database or auth without explicit ask. The whole design assumes one stateful pod owning its PVC.
- Sessions are RAM-only by design. Don't persist them to OpenDAL storage without explicit ask. **Saved scenes** ([scenes.rs](backend/src/routes/scenes.rs), [scenes.md](scenes.md)) are a separate, deliberately persisted concept — `scenes/{id}.json` with a 14-day TTL — not the same as RAM sessions.
- The backend is a dumb relay for scene data — it never parses scene JSON. Keep it that way; see [scenes.md](scenes.md) for how saved scenes and ZIP archives preserve this (raw JSON round-trip, frontend-supplied artifact lists, stable upload keys).
- Tailwind v4 only — never reintroduce `tailwind.config.js` or PostCSS configs.
- React Router stays in **library mode** (`BrowserRouter`). Don't migrate to the framework/data-router setup.
- The projector page auto-reconnects; the controller page does not (manual reconnect button only, to surface the "already connected" error clearly).
- Phaser game instances are owned by `PhaserCanvas` and destroyed on unmount. Never call `game.destroy()` from outside the component — go through `PhaserCanvasHandle`.
- Don't add Phaser audio or physics. Extend layer kinds via a new file under `lib/scene/` plus a matching renderer under `lib/phaser/renderers/`, not by reaching into existing renderers.
- The projector always renders the live projection; the controller's Flat/Projected switch is a **local preview only**, never serialised into the scene. Calibration mode (`projection.editing`) *is* on the scene — every client draws the warped alignment grid while it's on. See [projection.ts](frontend/src/lib/scene/projection.ts) and `ProjectionControl.tsx` before changing calibration behavior.
- Corner edits go through `withCorner`/`isValidCorners` ([scene/projection.ts](frontend/src/lib/scene/projection.ts)), which reject a fold — a non-convex quad makes the homography singular and clips the canvas away entirely.
- Auto-send is the contract: never reintroduce a Send button. Mutations always go `patch → applyObjects → sendNow/sendDebounced/sendCurrent`. The colour picker's commit path sends the freshly-patched array directly (`sendNow(patch(...))`) rather than `sendCurrent`, because `objectsRef` lags a render — check `ColorPicker.tsx` usage sites if touching this.
- The Vite proxy must cover `/api` as well as `/ws` and `/health` paths.
