---
name: add-function
description: Add a new layer/object type (text, shape, fill, icon, image, video, barcode, rays, grain, …) or a new scene-wide function (like the grid overlay or the projection warp) to pro-jection. Covers the scene-type file, the Phaser renderer, every ControllerPage/AddObjectPanel/LayerRow touch point, manual browser verification (no automated test suite exists), and updating CLAUDE.md + docs. Use whenever someone says "add a layer", "new object type", "add a function/effect", or a new field needs to ride along on the scene.
---

# Adding a layer or scene-wide function

pro-jection has **no database and the backend never parses scene JSON** — it
is a dumb relay that stores and rebroadcasts whatever string blob the
controller sends (`SessionState::push` in `backend/src/session.rs`). That
means **every** new feature described here is 100% frontend work: a TypeScript
type, a Phaser renderer, and UI wiring. Never add backend-side parsing to
"support" a new layer — if you find yourself doing that, stop and re-read
`CLAUDE.md`.

Read `CLAUDE.md`'s "Scene type system" and "Phaser integration" sections
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
- [ ] `CLAUDE.md`'s scene-type file tree updated; a new root-level `<name>.md`
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
must obey the send-timing contract from `CLAUDE.md` — getting this wrong is
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
`CLAUDE.md`'s Conventions section for why this matters).

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

This repo has no Rust unit tests and no Playwright specs — CLAUDE.md's rule
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

- **`CLAUDE.md`** — add the new file to the `lib/scene/` tree listing under
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
