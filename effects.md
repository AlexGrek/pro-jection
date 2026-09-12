# Post-processing effects

`Scene.effects` is an ordered chain of full-canvas filters. Like the grid overlay and
the keystone warp it is a scene-wide setting, not a layer: it rides along on every send,
it is not selectable or stackable in the Layers panel, and absent or empty means "no
post-processing".

Everything here is frontend-only. The backend relays the scene blob verbatim and never
parses it — see [CLAUDE.md](CLAUDE.md)'s Conventions.

| Artefact | File |
|---|---|
| The `Effect` union, defaults, catalogue | [frontend/src/lib/scene/effects.ts](frontend/src/lib/scene/effects.ts) |
| `Scene.effects` field | [frontend/src/lib/scene/index.ts](frontend/src/lib/scene/index.ts) |
| Camera filter chain | [frontend/src/lib/phaser/postfx.ts](frontend/src/lib/phaser/postfx.ts) |
| Scene wiring + calibration bypass | [frontend/src/lib/phaser/ProjectionScene.ts](frontend/src/lib/phaser/ProjectionScene.ts) (`applyEffects`, `_applyPostFx`) |
| Imperative handle | [frontend/src/components/PhaserCanvas.tsx](frontend/src/components/PhaserCanvas.tsx) (`setEffects`) |
| Controller UI | [frontend/src/components/controller/EffectsControl.tsx](frontend/src/components/controller/EffectsControl.tsx) |
| State / send plumbing | [frontend/src/pages/ControllerPage.tsx](frontend/src/pages/ControllerPage.tsx) (`changeEffects`) |

## The effects

Each entry is `{ id, enabled, type, …params }`. Ten kinds as of writing — check the
`Effect` union in `effects.ts` rather than this list, and read the doc comments there
for the exact ranges, which the UI enforces.

| Type | Phaser filter | What it's for |
|---|---|---|
| `color` | `ColorMatrix` | Preset grade (greyscale, sepia, kodachrome, …) plus brightness / contrast / saturation / hue |
| `bloom` | `ParallelFilters` (`Threshold` → `Blur`, blended `ADD`) | Blurred bright-pass added back over the image |
| `blur` | `Blur` | Soften the whole canvas |
| `warp` | `Displacement` | Ripple the image through a seeded noise field |
| `pixelate` | `Pixelate` | Mosaic blocks |
| `posterize` | `Quantize` | Quantise each channel to a few levels, RGB or HSV |
| `threshold` | `Threshold` | Crush to two tones with a soft edge |
| `duotone` | `GradientMap` | Remap luminance onto a 2–4 stop colour ramp |
| `vignette` | `Vignette` | Darken the edges of the projection |
| `barrel` | `Barrel` | Barrel / pincushion lens distortion |

`EFFECT_MAX` caps the chain at six. Each entry is another full-canvas GPU pass on every
client, and the projector is the machine that can least afford to drop frames.

## Rules that are easy to get wrong

**The chain runs on the camera's `internal` filter list.** Internal filters run on the
camera-sized texture before the camera's own transform, which is cheaper than `external`
and is the only place the keystone warp can't interfere: the warp is a CSS `matrix3d` on
the canvas element ([warp.ts](frontend/src/lib/phaser/warp.ts)), applied long after WebGL
is done, so the two compose without either knowing about the other.

**Calibration mode bypasses post-processing on every client.** A blurred, pixelated or
posterized alignment grid tells you nothing about where the quad lands on a real
surface. `_applyPostFx` passes an empty chain while `projection.editing` is on; the
settings are untouched, so leaving calibration brings the chain straight back.

**No parameter is structural — keep it that way.** `PostFxChain` only tears down and
rebuilds when the *shape* of the chain changes (the ordered list of effect ids and
types). Every other change is written straight onto the live Phaser controllers, because
the controller re-applies the whole scene on every slider frame. `enabled` maps onto
`Controller.active`, which skips a filter without removing it. If you add an effect whose
parameter can only be set through the constructor (`Glow`'s `distance` is the classic
one), fold it into `_signature` or it will silently never update.

**Anything random must be seeded.** `warp` derives its displacement map from
`mulberry32(seed)` for the same reason the grain layer does: the backend relays the scene
blob verbatim, so two clients drawing from the same JSON must produce the same map, pixel
for pixel. `Math.random()` is only ever called when a *new* effect is created, where the
result is written into the JSON and travels with it.

**Geometric effects move the image, not the hit-testing.** `warp` and `barrel` displace
pixels inside the WebGL pass; Phaser's pointer mapping is unchanged, so a click on the
controller still lands where the object *is*, not where it *looks*. This is the same
trade-off the keystone warp makes, except there the warp is severe enough that input is
disabled outright.

**The warp map fades out at its edges.** The displacement shader samples outside the
frame wherever the offset points inwards, and there is nothing there — without the
`WARP_EDGE_BAND` falloff a projector gets black scalloped borders.

**Duotone owns its `ColorRamp`.** `GradientMap` never destroys a ramp it was handed, and
a ramp allocates a GPU data texture. The ramp is therefore created once per effect,
updated in place with `setBands` (which re-encodes into the same texture), and destroyed
in `_teardown`.

## Phaser 4.1 gotcha: Bokeh / tilt-shift is unusable

`FilterBokeh.frag` ends with `gl_FragColor = vec4(Bokeh(...), 0.0)` — it writes alpha 0,
so a camera with `addBokeh`/`addTiltShift` composites to nothing and the canvas goes
black. Verified in a browser, not inferred. Don't reach for `addBokeh` or `addTiltShift`
until a Phaser release fixes the shader; `blur` covers the softening use case.

## Adding an effect

1. Add the interface to the `Effect` union in `lib/scene/effects.ts`, plus a
   `createEffect` arm (defaults visible straight away — an effect you add and can't see
   reads as broken), an `EFFECT_TYPES` entry, and an `effectSummary` arm.
2. Add `_build` and `_update` arms in `lib/phaser/postfx.ts`. Update in place; only add
   to `_signature` if a parameter genuinely cannot be set after construction.
3. Add a parameter panel arm and an icon to `EffectsControl.tsx`, obeying the
   send-timing table in CLAUDE.md — sliders preview locally (`SendMode` `'none'`) and
   commit on release, everything else sends immediately.
4. Drive it in a browser on the controller *and* a projector on the same session code.
   There is no automated suite, and a filter that silently renders nothing (see the
   Bokeh note above) looks exactly like a filter that works until you look at it.
