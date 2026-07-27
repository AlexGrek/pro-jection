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
  - `GET /api/scenes` · `POST /api/scenes` — list / create persisted scenes; `GET|PUT|DELETE /api/scenes/{id}` — load / re-save / delete ([scenes.rs](backend/src/routes/scenes.rs)). 14-day TTL, reference-counted artifacts. See [scenes.md](scenes.md)
  - `POST /api/useruploads` — multipart image/video upload (png/jpg/webp/svg + mp4/webm/ogv/mov, 200 MB max), stores via OpenDAL, returns URL ([assets.rs](backend/src/routes/assets.rs))
  - `GET /api/useruploads/{key}` — serve uploaded image/video from OpenDAL with the matching content-type ([assets.rs](backend/src/routes/assets.rs))
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
  - `/controller/:code` → [ControllerPage.tsx](frontend/src/pages/ControllerPage.tsx) — two-row layout: top row is Phaser canvas + layers panel; bottom row is properties + modifiers + animations + add-object panels. **Auto-sends** the full scene at every commit point — there is no Send button. State and send are deliberately split: `applyObjects` updates local state and the canvas; `sendNow` / `sendDebounced` / `sendCurrent` push the scene over WebSocket.
  - `/projector/:code` → [ProjectorPage.tsx](frontend/src/pages/ProjectorPage.tsx) — full-screen Phaser canvas (view-only). Auto-reconnects every 3 s. Double-click returns home.
  - `/health` → [HealthPage.tsx](frontend/src/pages/HealthPage.tsx)
  - `/ws-test` → [WsTestPage.tsx](frontend/src/pages/WsTestPage.tsx)
- Vite dev server proxies `/health`, `/live`, `/ready`, `/ws`, `/api` → backend on `localhost:8080` ([vite.config.ts](frontend/vite.config.ts)).
- Tailwind: write classes directly in JSX. No config file by design — extend via CSS in [index.css](frontend/src/index.css) using `@theme` if needed.

### Controller architecture

Type-specific UI lives under [components/controller/](frontend/src/components/controller/). Each property panel takes `{ layer, controls }` where `controls: PropertyControls` bundles the mutation/send helpers ([types.ts](frontend/src/components/controller/types.ts)):

- [TextProperties.tsx](frontend/src/components/controller/TextProperties.tsx) · [ShapeProperties.tsx](frontend/src/components/controller/ShapeProperties.tsx) · [FillProperties.tsx](frontend/src/components/controller/FillProperties.tsx) · [IconProperties.tsx](frontend/src/components/controller/IconProperties.tsx) · [ImageProperties.tsx](frontend/src/components/controller/ImageProperties.tsx)
- [LayerRow.tsx](frontend/src/components/controller/LayerRow.tsx) — single row in the Layers panel with reorder buttons (front/forward/backward/back).
- [AddObjectPanel.tsx](frontend/src/components/controller/AddObjectPanel.tsx) — Text / Rectangle / Circle / Background / Icon / Image / Video buttons.
- [GridControl.tsx](frontend/src/components/controller/GridControl.tsx) — header popover toggling the scene-wide grid overlay and picking its pattern (off / grid / dots / thirds / columns).
- [ProjectionControl.tsx](frontend/src/components/controller/ProjectionControl.tsx) — header popover for the scene-wide keystone warp: on/off, flat-vs-projected preview, calibration mode plus its grid-colour swatches, the corner picker with live readouts, a nudge pad, and reset.
- [PropertyRow.tsx](frontend/src/components/controller/PropertyRow.tsx) — shared label/content row layout.

Send timing per input kind:
| Input | Timing |
|---|---|
| Text input | `sendDebounced` (350 ms) |
| Font / Shape / Fill kind / Add layer / Reorder / Drag-end | `sendNow` immediate |
| Sliders (size, alpha, width, height, stroke, angle, stop alpha) | preview on `onChange`, `sendCurrent` on `onPointerUp` / `onKeyUp` |
| Mouse-wheel resize (text / shape / icon / image / video) | `sendDebounced` (350 ms) per tick |
| Projection on/off / reset / calibration toggle / grid colour | `sendNow` immediate |
| Projection corner drag | throttled `sendNow` (500 ms, throttled in the scene) + `sendNow` on drag-end |
| Projection corner arrow-key nudge | `sendDebounced` (350 ms) per repeat, `sendNow` on key-up |
| Color picker ([ColorPicker.tsx](frontend/src/components/controller/ColorPicker.tsx)) | `sendDebounced` (350 ms) while tuning (slider drag / hex typing / system-picker drag) via `onChange(hex)`; `sendNow` on release / swatch click / hex blur / system close / popover dismiss via `onCommit(hex)` |

The layers panel renders in **reverse** array order so top-of-panel = front-of-stack (Photoshop convention). `moveLayer(from, to)` operates on real array indices.

## Scene type system

Canonical types live under [frontend/src/lib/scene/](frontend/src/lib/scene/), one file per layer kind, re-exported from [index.ts](frontend/src/lib/scene/index.ts). The JSON wire format uses snake_case to match the Rust backend conventions. The backend never inspects layer content.

```
lib/scene/
├── index.ts    # Layer union, Scene, EMPTY_SCENE, barrel
├── base.ts     # BaseLayer, Animations, Modifier
├── fonts.ts    # FONT_OPTIONS (7 fonts), FontId, FONT_CSS
├── text.ts     # TextLayer + DEFAULT_TEXT_LAYER
├── shape.ts    # ShapeLayer (rectangle | circle, filled or outlined) + DEFAULT_RECT_LAYER + DEFAULT_CIRCLE_LAYER
├── fill.ts     # FillLayer (solid | linear gradient with rgba stops) + DEFAULT_FILL_LAYER
├── icon.ts     # IconLayer + DEFAULT_ICON_LAYER
├── image.ts    # ImageLayer (url + width; height from aspect ratio) + DEFAULT_IMAGE_LAYER
├── video.ts    # VideoLayer (url + width + loop + muted; height from aspect ratio) + DEFAULT_VIDEO_LAYER
├── grid.ts     # GridSettings (scene-wide overlay, not a layer) + GRID_TYPES + DEFAULT_GRID
└── projection.ts # ProjectionSettings (scene-wide keystone warp) + IDENTITY_CORNERS + isValidCorners/withCorner + CALIBRATION_COLORS
```

`BaseLayer` carries `id`, `x` and `y` (0–1), `opacity` (0–1), `animations: {}`, and `modifiers: []`. `Layer` is the discriminated union of `TextLayer | ShapeLayer | FillLayer | IconLayer | ImageLayer | VideoLayer`. Adding a new layer type means: add a file under `lib/scene/`, extend the `Layer` union in `index.ts`, add a renderer under `lib/phaser/renderers/`, and add a Properties component under `components/controller/`. See [images.md](images.md) for a worked example. `Scene` also carries two scene-wide settings that are not layers and ride along on every send/apply: `grid?: GridSettings` (an overlay drawn by `ProjectionScene` above all layers) and `projection?: ProjectionSettings` (the keystone warp — four corners in normalised canvas coordinates, plus `editing` and the calibration-grid `color`). Absent means off in both cases.

## Phaser integration

- Scene: [ProjectionScene.ts](frontend/src/lib/phaser/ProjectionScene.ts) — 1920×1080 canvas. Owns the `gameObjects: Map<id, LayerObject>` and `layerData: Map<id, Layer>` maps and dispatches `applyScene` to per-type renderers under [lib/phaser/renderers/](frontend/src/lib/phaser/renderers/). Implements [`RenderCtx`](frontend/src/lib/phaser/renderers/types.ts) so renderers operate via its public surface (`add`, `textures`, `gameObjects`, `layerData`, `selectedId`, `editable`, `attachInteractive`, `destroyGameObject`).
- Renderers: [text.ts](frontend/src/lib/phaser/renderers/text.ts) creates `Phaser.GameObjects.Text`; [shape.ts](frontend/src/lib/phaser/renderers/shape.ts) creates `Rectangle` or `Ellipse` and resolves the filled / outlined / selected style permutation; [fill.ts](frontend/src/lib/phaser/renderers/fill.ts) paints into a `CanvasTexture` (HTML5 `createLinearGradient` for true rgba multi-stop gradients) and displays it as an `Image` at canvas center; [image.ts](frontend/src/lib/phaser/renderers/image.ts) / [video.ts](frontend/src/lib/phaser/renderers/video.ts) load uploaded media (a placeholder rectangle until the source resolves, then sized from the natural aspect ratio). Each renderer exports `apply…` and (for text/shape) `refreshSelection`. The grid overlay is drawn directly by `ProjectionScene._applyGrid` via [grid.ts](frontend/src/lib/phaser/renderers/grid.ts)'s pure `drawGrid`, not the per-layer dispatch; the calibration grid works the same way via [calibration.ts](frontend/src/lib/phaser/renderers/calibration.ts)'s `drawCalibrationGrid`.
- `attachInteractive(go, id, opts)` is unified for all draggable / clickable layers. Text passes `{ margin: 80 }`; shapes default `margin: 0`; fills pass `{ draggable: false }` (selectable but not movable). Drag-end updates `layerData` and fires `onPositionChange`. Pointer-down fires `onObjectSelect`. Mouse-wheel over the editable canvas fires `onWheelResize(id, factor)` — targeting the selected layer, or the one under the pointer when nothing is selected — and the controller scales the layer's size per type (`resizeLayer`).
- Selection style: text uses `setStroke('#3b82f6', 4)`; shapes overlay a blue stroke via `setStrokeStyle` (and restore the configured stroke on deselect); fills have no visual selection mark — the panel highlight is the indicator. Constants in [constants.ts](frontend/src/lib/phaser/constants.ts).
- Z-order: `applyScene` calls `setDepth(i)` for each layer in array order, so reordering the array reorders the visual stack.
- Wrapper: [PhaserCanvas.tsx](frontend/src/components/PhaserCanvas.tsx) — `forwardRef` component. Handle: `applyScene(scene)`, `selectObject(id | null)`, `getScene()`. Buffers calls that arrive before the game is ready (`pendingRef`). Callback refs keep `onPositionChange` / `onObjectSelect` fresh without recreating the game. The canvas container has `touch-action: none` so touch drags don't trigger browser scrolling/zooming.
- `Phaser.Scale.FIT + NO_CENTER` — canvas scales to fill its container while holding 16:9. The black background hides any letterbox bars. Centring is done by `ProjectionScene._layoutCanvas` (margins from `scale.parentSize`/`displaySize`) rather than `autoCenter`, because `ScaleManager.updateCenter` derives its margins from `getBoundingClientRect()`, which the keystone warp invalidates.
- **3D projection (keystone):** Phaser 4 has no `Mesh`/`Plane`, so the warp is a CSS `matrix3d` written onto the game canvas by `_layoutCanvas`; the homography lives in [warp.ts](frontend/src/lib/phaser/warp.ts) (pure). Consequences worth remembering: Phaser maps pointers through `canvasBounds` *and* `displayScale`, both taken from the same bounding rect, so canvas input is disabled while warped and both values are recomputed by hand on the way back to flat (`scale.refresh()` would re-emit `RESIZE` and recurse). Corner handles are drawn in canvas space, so they are hidden while warped — under the warp they would land at `H(corner)`, not on the quad. The canvas container must stay unpositioned: giving it a `position` lifts it over the header popovers in paint order.
- Fonts: loaded via `@fontsource-variable/*` and `@fontsource/*` packages, imported in [index.css](frontend/src/index.css). Selectable per text layer; catalogue in [scene/fonts.ts](frontend/src/lib/scene/fonts.ts).
- **Tween caveat:** `this.tweens.add({ targets: this, … })` where `this` is the `Phaser.Scene` instance does not reliably update custom properties — the property stays at its initial value. For per-frame animation inside `update()`, compute the value directly from `this.time.now` (e.g. a sine expression) instead of relying on a tween.

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
- Sessions are RAM-only by design. Don't persist them to the OpenDAL storage without explicit ask. **Saved scenes** ([scenes.rs](backend/src/routes/scenes.rs), [scenes.md](scenes.md)) are a separate, deliberately persisted concept — `scenes/{id}.json` on OpenDAL with a 14-day TTL — not the same as RAM sessions.
- The backend is a dumb relay for scene data — it never parses scene JSON. Keep it that way. Saved scenes preserve this: the scene blob is round-tripped via `serde_json::value::RawValue`, and the `artifacts` list a scene references is supplied by the frontend, not extracted server-side. An upload lives as long as ≥1 scene references it; re-save/delete clean up orphans immediately, the periodic GC sweeps the rest (24 h grace for not-yet-saved uploads).
- Tailwind v4 only — never reintroduce `tailwind.config.js` or PostCSS configs (the Vite plugin handles everything).
- React Router stays in **library mode** (`react-router-dom` `BrowserRouter`). Don't migrate to the framework/data-router setup.
- The projector page auto-reconnects; the controller page does not (manual reconnect button only, to surface the "already connected" error clearly).
- Phaser game instances are owned by `PhaserCanvas` and destroyed on unmount. Never call `game.destroy()` from outside the component. Communicate with the scene exclusively through `PhaserCanvasHandle` (`applyScene`, `selectObject`, `getScene`).
- Don't add Phaser audio or physics. Layer kinds are text / shape / fill / icon / image / video — extend by adding a new file under [lib/scene/](frontend/src/lib/scene/) plus a matching renderer in [lib/phaser/renderers/](frontend/src/lib/phaser/renderers/), not by reaching into the existing renderers. Video uses `Video.loadURL` (no preload loader), plays muted+looping by default, and reveals itself on the `created` event once its aspect ratio is known.
- The projector always renders the projection. The controller's Flat/Projected switch is a **local preview** — it lives in React state and is never serialised into the scene. Calibration mode (`projection.editing`) *is* on the scene on purpose: every client draws the warped alignment grid while it is on, so you can see the quad land on the real surface. Its `color` (yellow / cyan / red, [CALIBRATION_COLORS](frontend/src/lib/scene/projection.ts)) travels for the same reason — it is a legibility control for the physical surface, not a design choice, which is why it is a fixed palette rather than a colour picker. The grid's white border and diagonals stay white at any setting: they are the structural reference and want maximum contrast.
- Corner edits go through `withCorner`/`isValidCorners` ([scene/projection.ts](frontend/src/lib/scene/projection.ts)), which reject a fold. A non-convex quad makes the homography singular and the browser clips the canvas away entirely — it reads as the projection crashing.
- Auto-send is the contract: never reintroduce a Send button. Mutations always go `patch → applyObjects → sendNow/sendDebounced/sendCurrent`. Sliders preview on `onChange` and commit on release/blur — don't send during continuous input. The colour picker is the exception: it **streams debounced sends while tuning** (`onChange → sendDebounced`) and flushes an immediate `sendNow` on commit. Because its `onCommit(hex)` carries the final hex, callers send the freshly-`patch`ed array directly (`sendNow(patch({ color: hex }))`) rather than `sendCurrent` — `objectsRef` lags a render, so a synchronous swatch/system commit via `sendCurrent` would send the previous colour.
- The Vite proxy must cover `/api` as well as `/ws` and `/health` paths.
