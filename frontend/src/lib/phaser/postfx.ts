import Phaser from 'phaser'
import type {
  ColorEffect,
  DuotoneEffect,
  Effect,
  NoiseEffect,
  PaletteEffect,
  ScanlinesEffect,
  WarpEffect,
} from '@/lib/scene'
import { paletteColors } from '@/lib/scene'
import { hexToInt } from './colors'
import { CANVAS_H, CANVAS_W, POSTFX_TEXTURE_PREFIX } from './constants'

/**
 * Scene-wide post-processing: maps `Scene.effects` onto the main camera's *internal*
 * filter list, in array order.
 *
 * Internal rather than external because internal filters run on the camera-sized
 * texture before the camera's own transform, which is both cheaper and the only place
 * the keystone warp doesn't interfere — the warp is a CSS `matrix3d` on the canvas
 * element (see `warp.ts`), applied long after WebGL is done, so filters and warp
 * compose without either knowing about the other.
 *
 * Filters are WebGL-only. Under the Canvas renderer `camera.filters` is absent and
 * every call here degrades to a no-op rather than throwing.
 *
 * ## Reconciliation
 *
 * Rebuilding a filter allocates GPU resources, and the controller re-applies the whole
 * scene on every slider frame — so the chain is only torn down when its *shape*
 * changes (the ordered list of effect ids and types). Parameter changes are written
 * straight onto the live filter controllers, and `enabled` maps onto
 * `Controller.active`, which skips a filter without removing it.
 *
 * Every mutable knob we expose is a plain property on the Phaser controller, so no
 * parameter is "structural". If you add an effect whose parameter can only be set
 * through the constructor (`Glow`'s `distance` is the classic one), fold it into
 * `_signature` or it will silently never update.
 */

/** One live chain entry: the effect it came from plus the Phaser objects backing it. */
interface Entry {
  type: Effect['type']
  controller: Phaser.Filters.Controller
  /** Bloom is a `ParallelFilters` composite — its inner passes are updated directly. */
  bloom?: {
    parallel: Phaser.Filters.ParallelFilters
    threshold: Phaser.Filters.Threshold
    blur: Phaser.Filters.Blur
  }
  /** Chromatic aberration is a `ParallelFilters` composite of two shifted channel sets. */
  chroma?: {
    parallel: Phaser.Filters.ParallelFilters
    red: Phaser.Filters.Displacement
    rest: Phaser.Filters.Displacement
  }
  /** Duotone and palette own their ramp: `GradientMap` never destroys the one it is handed. */
  ramp?: Phaser.Display.ColorRamp
  /**
   * A canvas texture this effect generated (warp map, scanline pattern, noise), plus
   * the signature it was last drawn for. Redrawn only when that signature moves.
   */
  gen?: { key: string; drawnFor: string; retarget: (key: string) => void }
}

type FilterList = Phaser.GameObjects.Components.FilterList

const clamp = Phaser.Math.Clamp

/**
 * Resolution of the warp displacement map. It is stretched across the whole canvas and
 * then smoothed by bilinear sampling, so it can be far smaller than the canvas — this
 * keeps regenerating it on a slider drag cheap.
 */
const WARP_MAP_SIZE = 192

/** Fraction of the map over which the warp eases back to zero at each edge. */
const WARP_EDGE_BAND = 0.12

/**
 * Channel isolation matrices for `chroma`, in Phaser's 4×5 `ColorMatrix` layout.
 * Alpha is left alone so the two branches still add back to the original coverage.
 */
const RED_ONLY = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]
const NO_RED = [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]

/** Blur sample count. More steps = smoother at a wider radius, at a linear GPU cost. */
const blurSteps = (radius: number): number => clamp(Math.round(radius), 3, 10)

export class PostFxChain {
  /**
   * One slot per effect, index-aligned with the scene's array. An unrecognised effect
   * type — a scene saved by a newer build — holds a `null` slot rather than being
   * skipped, so every later effect still lines up with its own controller.
   */
  private _entries: (Entry | null)[] = []
  /** Ordered `id:type` of the live chain. A mismatch means rebuild. */
  private _signature = ''
  private readonly scene: Phaser.Scene

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * Reconcile the camera's filter list against `effects`. Pass an empty array (or
   * nothing) to bypass post-processing entirely — the caller keeps the settings, so
   * this is also how calibration mode temporarily turns the chain off.
   */
  apply(effects: Effect[] = []): void {
    const list = this._list()
    if (!list) return

    const signature = effects.map((e) => `${e.id}:${e.type}`).join('|')
    if (signature !== this._signature) {
      this._teardown(list)
      for (const effect of effects) {
        this._entries.push(this._build(list, effect))
      }
      this._signature = signature
    }

    effects.forEach((effect, i) => {
      const entry = this._entries[i]
      if (!entry || entry.type !== effect.type) return
      entry.controller.active = effect.enabled
      if (effect.enabled) this._update(entry, effect)
    })
  }

  /** Drop every filter. Safe to call repeatedly and after the scene has shut down. */
  destroy(): void {
    const list = this._list()
    if (list) this._teardown(list)
    this._entries = []
    this._signature = ''
  }

  private _list(): FilterList | undefined {
    return this.scene.cameras?.main?.filters?.internal
  }

  /**
   * Redraw an effect's generated texture when the parameters it depends on move.
   * `setSize` can reallocate the backing GL texture, so the filter is always re-pointed
   * at the key afterwards rather than being left holding a stale wrapper.
   */
  private _regenerate<T extends Effect>(
    entry: Entry,
    want: string,
    draw: (scene: Phaser.Scene, key: string, effect: T) => string,
    effect: T,
  ): void {
    if (!entry.gen || entry.gen.drawnFor === want) return
    entry.gen.drawnFor = draw(this.scene, entry.gen.key, effect)
    entry.gen.retarget(entry.gen.key)
  }

  private _teardown(list: FilterList): void {
    for (const entry of this._entries) {
      if (!entry) continue
      // ParallelFilters holds two FilterLists of its own and has no destroy override,
      // so its inner passes would outlive it. Clear them before the outer list goes.
      entry.bloom?.parallel.top.clear()
      entry.bloom?.parallel.bottom.clear()
      entry.chroma?.parallel.top.clear()
      entry.chroma?.parallel.bottom.clear()
      entry.ramp?.destroy()
      if (entry.gen && this.scene.textures.exists(entry.gen.key)) {
        this.scene.textures.remove(entry.gen.key)
      }
    }
    this._entries = []
    list.clear()
    this._signature = ''
  }

  private _build(list: FilterList, effect: Effect): Entry | null {
    switch (effect.type) {
      case 'color':
        return { type: effect.type, controller: list.addColorMatrix() }

      case 'bloom': {
        const parallel = list.addParallelFilters()
        // Bright-pass then blur on the top branch; the bottom branch stays empty, so
        // Phaser blends the top output back over the *original* input. `blend.texture`
        // is overwritten by the renderer each frame — only mode and amount are ours.
        const threshold = parallel.top.addThreshold(effect.threshold, 1, false)
        const blur = parallel.top.addBlur(1, effect.radius, effect.radius, 1, 0xffffff, blurSteps(effect.radius))
        parallel.blend.blendMode = Phaser.BlendModes.ADD
        return { type: effect.type, controller: parallel, bloom: { parallel, threshold, blur } }
      }

      case 'blur':
        return {
          type: effect.type,
          controller: list.addBlur(1, effect.radius, effect.radius, effect.strength, 0xffffff, blurSteps(effect.radius)),
        }

      case 'warp': {
        const key = `${POSTFX_TEXTURE_PREFIX}${effect.id}`
        const drawnFor = drawWarpMap(this.scene, key, effect)
        const controller = list.addDisplacement(key, effect.amount, effect.amount)
        return {
          type: effect.type,
          controller,
          gen: { key, drawnFor, retarget: (k) => controller.setTexture(k) },
        }
      }

      case 'blocky':
        return {
          type: effect.type,
          controller: list.addBlocky({
            size: { x: effect.size_x, y: effect.size_y },
            offset: { x: effect.offset_x, y: effect.offset_y },
          }),
        }

      case 'palette': {
        const ramp = new Phaser.Display.ColorRamp(this.scene, paletteBands(effect), true)
        return { type: effect.type, controller: list.addGradientMap({ ramp }), ramp }
      }

      case 'scanlines': {
        const key = `${POSTFX_TEXTURE_PREFIX}${effect.id}`
        const drawnFor = drawScanlines(this.scene, key, effect)
        const controller = list.addBlend(key, Phaser.BlendModes.MULTIPLY, effect.intensity)
        return {
          type: effect.type,
          controller,
          gen: { key, drawnFor, retarget: (k) => controller.setTexture(k) },
        }
      }

      case 'noise': {
        const key = `${POSTFX_TEXTURE_PREFIX}${effect.id}`
        const drawnFor = drawNoise(this.scene, key, effect)
        const controller = list.addBlend(key, Phaser.BlendModes.OVERLAY, effect.amount)
        return {
          type: effect.type,
          controller,
          gen: { key, drawnFor, retarget: (k) => controller.setTexture(k) },
        }
      }

      case 'chroma': {
        // Split into two branches over the *same* input: red on one, green+blue on the
        // other, each displaced the opposite way, then added back together. Phaser's
        // built-in '__WHITE' texture is a uniform displacement map, so the shift is a
        // constant set entirely by the filter's own x/y — no generated texture needed.
        const parallel = list.addParallelFilters()
        parallel.top.addColorMatrix().colorMatrix.set(RED_ONLY)
        const red = parallel.top.addDisplacement('__WHITE')
        parallel.bottom.addColorMatrix().colorMatrix.set(NO_RED)
        const rest = parallel.bottom.addDisplacement('__WHITE')
        parallel.blend.blendMode = Phaser.BlendModes.ADD
        return { type: effect.type, controller: parallel, chroma: { parallel, red, rest } }
      }

      case 'pixelate':
        return { type: effect.type, controller: list.addPixelate(effect.amount) }

      case 'posterize':
        // The typings say addQuantize returns the FilterList; it actually returns the
        // controller, like every other add* method.
        return {
          type: effect.type,
          controller: list.addQuantize() as unknown as Phaser.Filters.Quantize,
        }

      case 'threshold':
        return { type: effect.type, controller: list.addThreshold(effect.edge1, effect.edge2, effect.invert) }

      case 'duotone': {
        const ramp = new Phaser.Display.ColorRamp(this.scene, rampBands(effect), true)
        return { type: effect.type, controller: list.addGradientMap({ ramp }), ramp }
      }

      case 'vignette':
        return {
          type: effect.type,
          controller: list.addVignette(effect.x, effect.y, effect.radius, effect.strength, hexToInt(effect.color)),
        }

      case 'barrel':
        return { type: effect.type, controller: list.addBarrel(effect.amount) }

      default:
        return null
    }
  }

  private _update(entry: Entry, effect: Effect): void {
    switch (effect.type) {
      case 'color':
        applyColorMatrix((entry.controller as Phaser.Filters.ColorMatrix).colorMatrix, effect)
        break

      case 'bloom': {
        const b = entry.bloom
        if (!b) break
        b.threshold.setEdge(effect.threshold, 1)
        b.blur.x = effect.radius
        b.blur.y = effect.radius
        b.blur.steps = blurSteps(effect.radius)
        b.parallel.blend.amount = effect.strength
        break
      }

      case 'blur': {
        const f = entry.controller as Phaser.Filters.Blur
        f.x = effect.radius
        f.y = effect.radius
        f.strength = effect.strength
        f.steps = blurSteps(effect.radius)
        break
      }

      case 'warp': {
        const f = entry.controller as Phaser.Filters.Displacement
        f.x = effect.amount
        f.y = effect.amount
        this._regenerate(entry, warpSignature(effect), drawWarpMap, effect)
        break
      }

      case 'blocky': {
        const f = entry.controller as Phaser.Filters.Blocky
        f.size = { x: Math.max(1, effect.size_x), y: Math.max(1, effect.size_y) }
        f.offset = { x: effect.offset_x, y: effect.offset_y }
        break
      }

      case 'palette': {
        const f = entry.controller as Phaser.Filters.GradientMap
        entry.ramp?.setBands(paletteBands(effect))
        f.dither = effect.dither
        f.alpha = effect.mix
        break
      }

      case 'scanlines': {
        const f = entry.controller as Phaser.Filters.Blend
        f.amount = effect.intensity
        this._regenerate(entry, scanlineSignature(effect), drawScanlines, effect)
        break
      }

      case 'noise': {
        const f = entry.controller as Phaser.Filters.Blend
        f.amount = effect.amount
        this._regenerate(entry, noiseSignature(effect), drawNoise, effect)
        break
      }

      case 'chroma': {
        const c = entry.chroma
        if (!c) break
        // The displacement map is uniform white, so the shader's offset is
        // `(1 - 0.5) * amount` — hence the doubling. Y is scaled by the canvas aspect
        // so the split travels the same number of pixels at any angle.
        const theta = Phaser.Math.DegToRad(effect.angle)
        const dx = 2 * effect.amount * Math.cos(theta)
        const dy = 2 * effect.amount * Math.sin(theta) * (CANVAS_W / CANVAS_H)
        c.red.x = dx
        c.red.y = dy
        c.rest.x = -dx
        c.rest.y = -dy
        break
      }

      case 'pixelate':
        ;(entry.controller as Phaser.Filters.Pixelate).amount = effect.amount
        break

      case 'posterize': {
        const f = entry.controller as Phaser.Filters.Quantize
        const steps = Math.max(2, Math.round(effect.steps))
        // HSVA wants far more steps on hue than on saturation/value to stay readable.
        f.mode = effect.mode === 'hsv' ? 1 : 0
        f.steps = effect.mode === 'hsv' ? [steps * 4, steps, steps, 1] : [steps, steps, steps, 1]
        f.dither = effect.dither
        break
      }

      case 'threshold': {
        const f = entry.controller as Phaser.Filters.Threshold
        f.setEdge(effect.edge1, Math.max(effect.edge1, effect.edge2))
        f.setInvert(effect.invert)
        break
      }

      case 'duotone': {
        const f = entry.controller as Phaser.Filters.GradientMap
        // setBands re-encodes into the ramp's existing data texture rather than
        // allocating a new one, which is why the ramp is created once and kept.
        entry.ramp?.setBands(rampBands(effect))
        f.dither = effect.dither
        f.alpha = effect.mix
        break
      }

      case 'vignette': {
        const f = entry.controller as Phaser.Filters.Vignette
        f.x = effect.x
        f.y = effect.y
        f.radius = effect.radius
        f.strength = effect.strength
        f.setColor(hexToInt(effect.color))
        break
      }

      case 'barrel':
        ;(entry.controller as Phaser.Filters.Barrel).amount = effect.amount
        break
    }
  }
}

const warpSignature = (effect: WarpEffect): string => `${effect.seed}:${Math.round(effect.scale)}`

/**
 * Draw (or redraw) the warp displacement map. The shader reads R as the X offset and G
 * as the Y offset, both centred on 0.5, so the map is value noise per channel: a coarse
 * grid of seeded random values, smoothstep-interpolated into a continuous field.
 *
 * Seeded rather than `Math.random()` because the scene blob is relayed verbatim — two
 * clients drawing from the same JSON must produce the same map, pixel for pixel.
 *
 * The field is faded back to neutral over the outer `WARP_EDGE_BAND` of the map. The
 * shader samples outside the frame where the displacement points inwards, and there is
 * nothing there — without the fade a projector gets black scalloped borders.
 *
 * Returns the signature the map was drawn for.
 */
function drawWarpMap(scene: Phaser.Scene, key: string, effect: WarpEffect): string {
  const tex = scene.textures.exists(key)
    ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture)
    : scene.textures.createCanvas(key, WARP_MAP_SIZE, WARP_MAP_SIZE)
  const ctx = tex?.getContext()
  if (!tex || !ctx) return warpSignature(effect)

  const cells = clamp(Math.round(effect.scale), 2, 64)
  const rand = mulberry32(effect.seed)
  // One extra row/column so the interpolation at the last cell has a neighbour.
  const grid = new Float32Array((cells + 1) * (cells + 1) * 2)
  for (let i = 0; i < grid.length; i++) grid[i] = rand()

  const at = (gx: number, gy: number, ch: number) => grid[(gy * (cells + 1) + gx) * 2 + ch]
  const smooth = (t: number) => t * t * (3 - 2 * t)

  /** 0 at the very edge of the map, 1 once past the falloff band. */
  const edgeFade = (n: number) => smooth(clamp(Math.min(n, 1 - n) / WARP_EDGE_BAND, 0, 1))

  const image = ctx.createImageData(WARP_MAP_SIZE, WARP_MAP_SIZE)
  const data = image.data
  for (let y = 0; y < WARP_MAP_SIZE; y++) {
    const fy = (y / WARP_MAP_SIZE) * cells
    const gy = Math.floor(fy)
    const ty = smooth(fy - gy)
    const fadeY = edgeFade(y / WARP_MAP_SIZE)
    for (let x = 0; x < WARP_MAP_SIZE; x++) {
      const fx = (x / WARP_MAP_SIZE) * cells
      const gx = Math.floor(fx)
      const tx = smooth(fx - gx)
      const fade = fadeY * edgeFade(x / WARP_MAP_SIZE)
      const o = (y * WARP_MAP_SIZE + x) * 4
      for (let ch = 0; ch < 2; ch++) {
        const top = at(gx, gy, ch) + (at(gx + 1, gy, ch) - at(gx, gy, ch)) * tx
        const bottom = at(gx, gy + 1, ch) + (at(gx + 1, gy + 1, ch) - at(gx, gy + 1, ch)) * tx
        const value = top + (bottom - top) * ty
        data[o + ch] = Math.round((0.5 + (value - 0.5) * fade) * 255)
      }
      data[o + 2] = 0
      data[o + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  tex.refresh()
  return warpSignature(effect)
}

/** Deterministic PRNG (mulberry32), byte-for-byte the same as `renderers/grain.ts`. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Get a canvas texture at the requested size, creating or resizing it as needed, with
 * nearest-neighbour filtering — these are patterns and noise, and linear filtering
 * smears a one-pixel scanline into grey.
 */
function generatedTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
): Phaser.Textures.CanvasTexture | null {
  if (scene.textures.exists(key)) {
    const existing = scene.textures.get(key) as Phaser.Textures.CanvasTexture
    existing.setSize(width, height)
    return existing
  }
  const created = scene.textures.createCanvas(key, width, height)
  created?.setFilter(Phaser.Textures.FilterMode.NEAREST)
  return created ?? null
}

const scanlineSignature = (effect: ScanlinesEffect): string =>
  `${effect.mode}:${Math.round(effect.spacing)}:${Math.round(effect.thickness)}`

/**
 * Draw the CRT pattern that `scanlines` multiplies over the canvas: white where the
 * image passes through untouched, dark (or channel-tinted) where it is masked.
 *
 * Drawn at full canvas resolution so a line is a real pixel on the projector output,
 * but built by filling one small tile and repeating it with `createPattern` — a
 * per-pixel loop over 1920×1080 would stall the controller on every parameter change.
 */
function drawScanlines(scene: Phaser.Scene, key: string, effect: ScanlinesEffect): string {
  const tex = generatedTexture(scene, key, CANVAS_W, CANVAS_H)
  const ctx = tex?.getContext()
  if (!tex || !ctx) return scanlineSignature(effect)

  const spacing = clamp(Math.round(effect.spacing), 2, 24)
  // Always leave at least one pass-through pixel, or the pattern is a solid block.
  const thickness = clamp(Math.round(effect.thickness), 1, spacing - 1)

  const tile = document.createElement('canvas')
  const tctx = tile.getContext('2d')
  if (!tctx) return scanlineSignature(effect)

  if (effect.mode === 'grille') {
    // Three equal columns of pure R, G and B: multiplying leaves each column carrying
    // only its own channel, which is what an aperture-grille tube actually does.
    const band = Math.max(1, Math.round(spacing / 3))
    tile.width = band * 3
    tile.height = 1
    const channels = ['#ff0000', '#00ff00', '#0000ff']
    channels.forEach((color, i) => {
      tctx.fillStyle = color
      tctx.fillRect(i * band, 0, band, 1)
    })
  } else if (effect.mode === 'dots') {
    tile.width = spacing
    tile.height = spacing
    tctx.fillStyle = '#ffffff'
    tctx.fillRect(0, 0, spacing, spacing)
    tctx.fillStyle = '#000000'
    tctx.beginPath()
    tctx.arc(spacing / 2, spacing / 2, thickness / 2, 0, Math.PI * 2)
    tctx.fill()
  } else {
    tile.width = 1
    tile.height = spacing
    tctx.fillStyle = '#ffffff'
    tctx.fillRect(0, 0, 1, spacing)
    tctx.fillStyle = '#000000'
    tctx.fillRect(0, 0, 1, thickness)
  }

  const pattern = ctx.createPattern(tile, 'repeat')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  if (pattern) {
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }
  tex.refresh()
  return scanlineSignature(effect)
}

const noiseSignature = (effect: NoiseEffect): string =>
  `${effect.seed}:${Math.round(effect.size)}:${effect.mono}`

/**
 * Draw the grain that `noise` overlays. Generated at canvas resolution divided by the
 * grain size and scaled back up with nearest filtering, so a big grain costs *less*
 * to build rather than more.
 *
 * Seeded for the same reason `warp` is: the scene blob is relayed verbatim, so every
 * client has to produce the same grain from the same JSON.
 */
function drawNoise(scene: Phaser.Scene, key: string, effect: NoiseEffect): string {
  const size = clamp(Math.round(effect.size), 1, 12)
  const width = Math.ceil(CANVAS_W / size)
  const height = Math.ceil(CANVAS_H / size)
  const tex = generatedTexture(scene, key, width, height)
  const ctx = tex?.getContext()
  if (!tex || !ctx) return noiseSignature(effect)

  const rand = mulberry32(effect.seed)
  const image = ctx.createImageData(width, height)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    if (effect.mono) {
      const v = Math.round(rand() * 255)
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
    } else {
      data[i] = Math.round(rand() * 255)
      data[i + 1] = Math.round(rand() * 255)
      data[i + 2] = Math.round(rand() * 255)
    }
    data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  tex.refresh()
  return noiseSignature(effect)
}

/** Flat, evenly spaced bands — `colorEnd` defaults to `colorStart`, so nothing blends. */
function paletteBands(effect: PaletteEffect): Phaser.Types.Display.ColorBandConfig[] {
  const colors = paletteColors(effect.preset)
  const span = 1 / colors.length
  return colors.map((color, i) => ({
    colorStart: hexToInt(color),
    start: i * span,
    end: (i + 1) * span,
  }))
}

/** Even bands across the ramp, darkest stop first. */
function rampBands(effect: DuotoneEffect): Phaser.Types.Display.ColorBandConfig[] {
  const colors = effect.colors.length > 1 ? effect.colors : [effect.colors[0] ?? '#000000', '#ffffff']
  const span = 1 / (colors.length - 1)
  return colors.slice(0, -1).map((color, i) => ({
    colorStart: hexToInt(color),
    colorEnd: hexToInt(colors[i + 1]),
    start: i * span,
    end: (i + 1) * span,
  }))
}

/**
 * Rebuild a colour-grade matrix from scratch: the preset *sets* the matrix, then each
 * adjustment multiplies onto it. Order is deliberate (exposure, then contrast, then
 * saturation, then hue) and the neutral value differs per knob — 1 for brightness,
 * 0 for the other three — because these mirror Phaser's own `ColorMatrix` helpers.
 */
function applyColorMatrix(cm: Phaser.Display.ColorMatrix, effect: ColorEffect): void {
  cm.reset()
  switch (effect.preset) {
    case 'grayscale': cm.grayscale(); break
    case 'mono': cm.blackWhite(); break
    case 'negative': cm.negative(); break
    case 'sepia': cm.sepia(); break
    case 'night': cm.night(); break
    case 'kodachrome': cm.kodachrome(); break
    case 'technicolor': cm.technicolor(); break
    case 'polaroid': cm.polaroid(); break
    case 'vintage': cm.vintagePinhole(); break
    case 'brown': cm.brown(); break
    case 'lsd': cm.lsd(); break
    case 'bgr': cm.shiftToBGR(); break
    case 'none': break
  }
  if (effect.brightness !== 1) cm.brightness(effect.brightness, true)
  if (effect.contrast !== 0) cm.contrast(effect.contrast, true)
  if (effect.saturation !== 0) cm.saturate(effect.saturation, true)
  if (effect.hue !== 0) cm.hue(effect.hue, true)
}
