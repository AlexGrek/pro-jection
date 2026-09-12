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

Type-specific UI lives under [components/controller/](frontend/src/components/controller/). Property panels take `{ layer, controls }` where `controls: PropertyControls` bundles mutation/send helpers — check [types.ts](frontend/src/components/controller/types.ts) for the contract. One file per layer kind (`TextProperties`, `ShapeProperties`, `FillProperties`, `IconProperties`, `ImageProperties`, `VideoProperties`, `BarcodeProperties`, `RaysProperties`), plus per-modifier/animation panels (`ArrayModifierPanel`, `GlowModifierPanel`, `MatrixModifierPanel`, `GlowAnimationPanel`), picker modals (`FontPickerModal`, `IconPickerModal`), `SceneStorageDialogs` (save/load/export/import UI), `HotkeysMenu`, `LayerRow`, `AddObjectPanel`, `GridControl`, `ProjectionControl`, `PropertyRow`, `ColorPicker`. Open the specific file for its exact props/behavior rather than assuming from the name.

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

Canonical types live under [frontend/src/lib/scene/](frontend/src/lib/scene/), one file per layer kind, re-exported from [index.ts](frontend/src/lib/scene/index.ts) — **check that file for the current `Layer` union**, it grows independently of this doc. JSON wire format is snake_case to match Rust conventions; the backend never inspects layer content. Layer kinds as of writing: text, shape (rect/circle), fill (solid/gradient), icon, image, video, barcode, rays, grain, concentric, lines — but verify against `index.ts` rather than this list.

`base.ts` defines `BaseLayer` (`id`, `x`/`y` 0–1, `opacity`, `animations`, `modifiers`) plus the `Animations`/`Modifier` union (glow animation; array/glow/matrix modifiers) — check it for exact fields, they carry non-obvious ranges/units in doc comments. `grid.ts` and `projection.ts` hold the two scene-wide (non-layer) settings that ride along on every send: grid overlay and keystone-warp projection; absent means off for both.

Adding a new layer type: add a file under `lib/scene/`, extend the `Layer` union in `index.ts`, add a renderer under `lib/phaser/renderers/`, add a Properties component under `components/controller/`. See [images.md](images.md) for a worked example.

## Phaser integration

Core files — read them directly, their doc comments carry the non-obvious reasoning (pointer-mapping math, why a tween trick doesn't work, etc.) rather than restating it here:

- [ProjectionScene.ts](frontend/src/lib/phaser/ProjectionScene.ts) — 1920×1080 scene, owns `gameObjects`/`layerData` maps, dispatches `applyScene` to per-type renderers, implements [`RenderCtx`](frontend/src/lib/phaser/renderers/types.ts), handles canvas layout/centring (`_layoutCanvas`) and the keystone CSS transform.
- [lib/phaser/renderers/](frontend/src/lib/phaser/renderers/) — one file per layer kind (`text`, `shape`, `fill`, `icon`, `image`, `video`, `barcode`, `rays`) plus `grid.ts`/`calibration.ts` for the two overlay grids, dispatched outside the per-layer loop.
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


---

# Agent Skills & Workflows


# Adding a layer or scene-wide function

pro-jection has **no database and the backend never parses scene JSON** — it
is a dumb relay that stores and rebroadcasts whatever string blob the
controller sends (`SessionState::push` in `backend/src/session.rs`). That
means **every** new feature described here is 100% frontend work: a TypeScript
type, a Phaser renderer, and UI wiring. Never add backend-side parsing to
"support" a new layer — if you find yourself doing that, stop and re-read
`GEMINI.md`.

Read `GEMINI.md`'s "Scene type system" and "Phaser integration" sections
first. `frontend/src/lib/scene/rays.ts` + `renderers/rays.ts` are the
reference pair for a **fullscreen-capable procedural** layer; copy their
*shape*, not their content. `frontend/src/lib/scene/grain.ts` +
`renderers/grain.ts` add a **deterministic seeded PRNG** and a **multi-color
palette** on top of that same shape — copy from there instead if the new
layer is random/procedural or needs more than one color. `images.md` is the
worked-example doc for a **non-procedural, network-backed** layer (uploads +
async texture load) if the new type talks to a new HTTP route instead of
drawing into a canvas.

---

## The contract — what "done" means

- [ ] `lib/scene/<name>.ts` — the type + `DEFAULT_<NAME>_LAYER`
- [ ] `lib/scene/index.ts` — import, `export *`, add to the `Layer` union
- [ ] `lib/phaser/constants.ts` — a `<NAME>_TEXTURE_PREFIX` (only if canvas-drawn)
- [ ] `lib/phaser/renderers/<name>.ts` — the renderer
- [ ] `lib/phaser/ProjectionScene.ts` — import + dispatch + texture cleanup +
      selection/glow opt-outs if procedural or fullscreen
- [ ] `components/controller/<Name>Properties.tsx` — the properties panel
- [ ] `components/controller/AddObjectPanel.tsx` — icon + button + prop
- [ ] `components/controller/LayerRow.tsx` — icon + label functions
- [ ] `pages/ControllerPage.tsx` — imports, `resizeLayer` arm, `add<Name>`
      handler, **both** `<AddObjectPanel>` call sites (mobile + desktop),
      properties dispatch, and any modifiers/animations/color-row opt-outs
- [ ] `npx tsc --noEmit` and `npx eslint` clean, `npm run build` succeeds
- [ ] Manually driven in a real browser — controller **and** projector, same
      session code, side by side (see Step 8 — there is no automated suite)
- [ ] `GEMINI.md`'s scene-type file tree updated; a new root-level `<name>.md`
      only if the feature is complex enough to need one (see Step 9)

---

## Step 0 — decide the shape

Answer these before writing code — each maps to a concrete decision later.

| Question | Where it lands |
|---|---|
| A per-object layer, or a scene-wide setting? | Layers live in `Scene.objects[]`; scene-wide settings (grid, projection) are a single optional field on `Scene` itself, applied outside the per-layer dispatch. Almost everything is a layer — only reach for scene-wide when the concept genuinely isn't a discrete, orderable, selectable object. |
| Does it need to look **identical** on the controller and every projector? | If it has any randomness, derive it from a `seed: number` field + a seeded PRNG (mulberry32 — copy it from `renderers/grain.ts`) called inside the renderer. **Never call `Math.random()` inside a renderer** — the backend relays the scene blob verbatim, so each client would draw a different pattern from the same JSON. `Math.random()` is fine only at the moment a fresh layer/value is created (e.g. `randomGrainSeed()`, `randomBarcodeValue()`), because that result gets written into the JSON and travels with it. |
| Fullscreen-capable? | Follow the `rays`/`grain` `fullscreen: boolean` pattern: fullscreen renders at `CANVAS_W × CANVAS_H`, is not draggable, and is skipped by the selection box and the "Pos" row. Non-fullscreen uses `width`/`height` fractions (or `cell_size`, if it's a repeating grid like `rays`) and is a normal draggable bounded box. |
| Procedural (canvas-drawn) or a real Phaser GameObject? | `fill`, `icon`, `barcode`, `rays`, `grain` all paint into a `Phaser.Textures.CanvasTexture` and display it as a plain `Image` — this is almost always the right call, and it means `renderers/types.ts`'s `LayerObject` union (`Text \| Rectangle \| Ellipse \| Image \| Video`) does **not** need a new member. Only touch that union if the layer truly needs a Phaser GameObject class not already listed. |
| One color or several? | One → reuse the generic Color row that `ControllerPage.tsx` renders automatically below the type-specific panel (don't opt out). Several/a palette → build the color list into the Properties panel yourself (see `GrainProperties.tsx`) and add the type to the opt-out list. |
| Does it make sense with Array/Matrix/Glow modifiers or the Glow animation? | `fill`/`rays`/`grain` all opt out of every modifier and animation panel because they're full-canvas procedural effects, not discrete shapes to clone or glow. Decide up front; opting out later means touching `ControllerPage.tsx` again. |
| Does mouse-wheel resize mean anything for it? | If yes, add an arm to `resizeLayer()`; a fullscreen instance should usually be a no-op there, same as `rays`/`grain`. |

---

## Step 1 — the scene type

`frontend/src/lib/scene/<name>.ts`:

```typescript
import type { BaseLayer } from './base'
import { DEFAULT_ANIMATIONS } from './base'

export interface <Name>Layer extends BaseLayer {
  type: '<name>'
  // ...your fields, snake_case to match the Rust wire format
}

export const DEFAULT_<NAME>_LAYER: Omit<<Name>Layer, 'id'> = {
  type: '<name>',
  x: 0.5,
  y: 0.5,
  opacity: 1,
  animations: DEFAULT_ANIMATIONS,
  modifiers: [],
  // ...your defaults
}
```

`BaseLayer` (`id`, `x`, `y`, `opacity`, `animations`, `modifiers`) is shared by
every layer — don't redeclare it. Field names are snake_case because the JSON
wire format matches the Rust backend's serde conventions, even though the
backend never actually reads these fields.

---

## Step 2 — wire the union

`frontend/src/lib/scene/index.ts` — three edits:

```typescript
import type { <Name>Layer } from './<name>'
export * from './<name>'
export type Layer = TextLayer | ShapeLayer | ... | <Name>Layer
```

---

## Step 3 — the Phaser renderer

`frontend/src/lib/phaser/renderers/<name>.ts`. Copy `renderers/rays.ts`
(simplest fullscreen-capable example) or `renderers/grain.ts` (adds seeded
randomness + a palette) wholesale and adapt the drawing function. The shape
that recurs across every procedural renderer:

```typescript
export function apply<Name>(ctx: RenderCtx, layer: <Name>Layer): void {
  const key = `${<NAME>_TEXTURE_PREFIX}${layer.id}`
  const [tw, th] = textureSize(layer)          // CANVAS_W×CANVAS_H if fullscreen
  const px = layer.fullscreen ? CANVAS_W / 2 : layer.x * CANVAS_W
  const py = layer.fullscreen ? CANVAS_H / 2 : layer.y * CANVAS_H

  // destroy-and-recreate the texture if its size changed or the existing
  // GameObject is the wrong type, otherwise reuse it and just redraw
  // ...(copy verbatim from rays.ts/grain.ts — this bookkeeping is identical
  // for every procedural layer)

  const c2d = canvasTex.getContext()
  if (c2d) draw<Name>(c2d, layer, tw, th)       // your pure drawing function
  canvasTex.refresh()

  // create-or-reposition the Image, attachInteractive(img, layer.id, { draggable: !layer.fullscreen })
}
```

If it needs randomness, seed a PRNG from `layer.seed` at the top of the draw
function (mulberry32 from `renderers/grain.ts` — self-contained, no
dependency). If it's canvas-drawn, add its own prefix constant in
`lib/phaser/constants.ts`: `export const <NAME>_TEXTURE_PREFIX = '<name>-'`.

---

## Step 4 — `ProjectionScene.ts` touch points

Five spots, easy to miss one:

1. Import: `import { apply<Name> } from './renderers/<name>'`
2. Import the texture prefix constant alongside the others at the top.
3. Dispatch, in `_dispatchApply`: `else if (layer.type === '<name>') apply<Name>(this, layer)`
4. Texture cleanup, in `destroyGameObject`: add `<NAME>_TEXTURE_PREFIX` to the
   prefix array that's swept on layer removal.
5. If fullscreen-capable: add `(layer.type === '<name>' && layer.fullscreen)`
   to the `_updateSelection` early-return (search for the existing
   `rays && fullscreen` check and extend the same condition).
   If it opts out of glow: add `&& layer.type !== '<name>'` to the
   `_applyGlow` guard in `applyScene`.

---

## Step 5 — the Properties panel

`components/controller/<Name>Properties.tsx`. Every control in this panel
must obey the send-timing contract from `GEMINI.md` — getting this wrong is
the single easiest way to make a "working" feature feel broken (laggy, or
spamming the socket):

| Input kind | Call `patch()` on... | Then call... |
|---|---|---|
| Select / checkbox / discrete choice | `onChange` | `sendNow(patch({...}))` immediately |
| Text input | `onChange` | `sendDebounced(patch({...}))` |
| Slider | `onChange` (preview only) | `sendCurrent` on `onPointerUp` **and** `onKeyUp` |
| Color | `ColorPicker`'s `onChange` | `sendDebounced`; its `onCommit` → `sendNow` |
| A "randomize/shuffle" button | — | `sendNow(patch({ seed: newSeed }))` directly, immediate |

`patch()` returns the new objects array — pass it straight into
`sendNow`/`sendDebounced` rather than calling `sendCurrent` afterward,
because `objectsRef` lags a render (see the `ColorPicker` note in
`GEMINI.md`'s Conventions section for why this matters).

If the layer has a color palette instead of one color, model it on
`GrainProperties.tsx`'s `colors` array: a `ColorPicker` per swatch, a bounded
add button, and a remove button per swatch gated on `colors.length > 1`.

---

## Step 6 — Add-object button and layer list

`components/controller/AddObjectPanel.tsx`:

```tsx
import { Icon<Something> } from '@tabler/icons-react'
// add to Props: onAdd<Name>: () => void
<AddButton disabled={disabled} icon={<Icon<Something> size={13} />} label="<Name>" onClick={onAdd<Name>} />
```

Pick an icon **not already used** by another entry in this file or in
`LayerRow.tsx`'s `LayerIcon` — reusing one (e.g. `rays`'s `IconGridDots`)
makes the Add panel and Layers list ambiguous at a glance. Check
`node_modules/@tabler/icons-react/dist/esm/icons/` for candidates before
inventing a name.

`components/controller/LayerRow.tsx` — two small if-chains, no lookup table
to maintain elsewhere:

```tsx
// in LayerIcon:
if (layer.type === '<name>') return <Icon<Something> size={11} className="shrink-0" />
// in layerLabel:
if (layer.type === '<name>') return layer.fullscreen ? '<Name> (fullscreen)' : '<Name>'
```

---

## Step 7 — `ControllerPage.tsx` wiring

The most error-prone step because it's one large file with several
independent touch points:

1. **Imports** — the Properties component, `DEFAULT_<NAME>_LAYER`, and the
   `<Name>Layer` type, alongside their siblings.
2. **`resizeLayer()`** — add a `case '<name>':` arm if mouse-wheel resize
   means anything for this type (a no-op for fullscreen, matching `rays`).
3. **`add<Name>`** handler alongside `addRays`/`addGrain`:
   ```tsx
   const add<Name> = () => addLayerAtEnd({ ...DEFAULT_<NAME>_LAYER, id: crypto.randomUUID() } as <Name>Layer)
   ```
   If it has a `seed`, regenerate it here (`seed: random<Name>Seed()`) rather
   than relying on the module-level default — otherwise every "add" produces
   the same pattern until shuffled.
4. **Both `<AddObjectPanel>` JSX call sites** — mobile and desktop render the
   same panel with identical props; there are two copies in this file. Add
   `onAdd<Name>={add<Name>}` to **both** (a single `replace_all` edit on the
   line above `/>` works since the surrounding props are identical).
5. **`propertiesContent`** — add the `selected.type === '<name>' && <...Properties .../>` line, and if the type has a multi-color palette or otherwise shouldn't get the generic Color row, add `selected.type !== '<name>'` to that row's condition (and to the "Pos" row's condition if fullscreen-capable).
6. **`modifiersContent` / `animationsContent`** — if the type opts out (per
   Step 0), add `'<name>'` to the existing `type === 'rays'` / `'grain'`-style
   checks rather than writing a new branch.

---

## Step 8 — test it (there is no automated suite)

This repo has no Rust unit tests and no Playwright specs — GEMINI.md's rule
applies literally: *"start the dev server and use the feature in a browser
before reporting the task as complete."* Do all of these, in order:

```bash
cd frontend
npx tsc --noEmit -p .
npx eslint src/lib/scene/<name>.ts src/lib/phaser/renderers/<name>.ts \
  src/lib/phaser/ProjectionScene.ts src/components/controller/<Name>Properties.tsx \
  src/components/controller/AddObjectPanel.tsx src/components/controller/LayerRow.tsx \
  src/pages/ControllerPage.tsx
npm run build
```

Then drive it in a real browser: `task dev` (or run the backend directly with
`cargo run` from `backend/` if you need a non-default port — see gotchas
below), open `/controller/<code>`, add the new layer from the Add panel, and
exercise **every** control in its Properties panel — not just the default
state.

**If the feature has any randomness or is fullscreen/procedural, open
`/projector/<code>` for the *same* session code in a second tab and compare.**
This is the actual test for anything seed-based: the controller and the
projector must render *pixel-identical* patterns from the same scene JSON,
because the backend only ever relays the raw string — any divergence means
something inside the renderer is non-deterministic (usually a stray
`Math.random()` call). Check the browser console on both tabs for errors.

### Gotchas that will cost you time

- **`crypto.randomUUID()` throws outside a "secure context."** It's used by
  every `add<Name>` handler. `https://` and `http://localhost` (any port) are
  secure contexts; a LAN IP like `http://192.168.x.x:8080` is not, and the
  failure shows up as a page error the moment you click an Add button, not as
  anything layer-specific. Always test against `localhost`.
- **Something else may already be listening on port 8080** (an IDE's own dev
  tooling, another project). Two processes can both show as "listening" on
  macOS if one binds `0.0.0.0` and the other binds specifically to
  `localhost` — connections to `127.0.0.1`/`localhost` are then silently
  routed to whichever bound the more specific address, and you'll get an
  empty reply from the wrong process instead of a connection error. If
  `task dev`'s backend seems unreachable on `localhost:8080` despite logging
  that it's listening, check `lsof -i :8080 -P` before assuming your code
  broke something. Run the backend on an alternate port instead of fighting
  the conflict: `PORT=8090 STATIC_DIR=../frontend/dist cargo run` from
  `backend/`, then hit `http://localhost:8090` directly — the backend serves
  the built `frontend/dist` itself via SPA fallback, so this works even
  without Vite running, as long as you've run `npm run build` first.
- **The controller's WebSocket connects on a deferred `setTimeout(0)`**, not
  immediately on mount (this dodges a React StrictMode double-connect race).
  Give the page ~1–1.5s after navigation before interacting with it in an
  automated script.

---

## Step 9 — update the docs

- **`GEMINI.md`** — add the new file to the `lib/scene/` tree listing under
  "Scene type system", and update the "Layer kinds are text / shape / fill /
  icon / image / video" sentence in Conventions if the new type changes that
  enumeration. This is the one edit that's never optional.
- **A new root-level `<name>.md`** — only for a feature complex enough to
  need worked documentation of its own (uploads + async loading, like
  `images.md`; a cursor model, like `history.md`). A small layer type that
  fits entirely in the scene-type file + renderer does **not** need one —
  don't create documentation busywork for a five-field layer.
- If you *do* write one, close it with the same "artefact → file" reference
  table `images.md` ends on — it doubles as a checklist for the next person
  copying this pattern.
- Update `README.md` only if you changed a setup/run step, which this kind of
  feature never does.

---

## Reference implementations, ranked by how much to copy

1. **`rays.ts` / `renderers/rays.ts`** — the simplest fullscreen-capable
   procedural layer. Start here for anything canvas-drawn with a single
   color and no randomness.
2. **`grain.ts` / `renderers/grain.ts`** — adds a seeded PRNG (determinism
   across controller/projector) and a bounded multi-color palette. Start
   here if the new layer is random, or needs more than one color.
3. **`images.md`** (doc) + `image.ts` / `renderers/image.ts` — a
   network-backed layer with async texture loading instead of canvas
   drawing. Start here if the feature needs a new upload/fetch endpoint
   rather than procedural drawing.
4. **`grid.ts` / `projection.ts`** (scene-wide settings, not layers) — if
   Step 0 concluded the feature isn't a discrete object at all.
