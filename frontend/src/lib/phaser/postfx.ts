import Phaser from 'phaser'
import type { ColorEffect, DuotoneEffect, Effect } from '@/lib/scene'
import { hexToInt } from './colors'

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
  /** Duotone owns its ramp: `GradientMap` never destroys the one it is handed. */
  ramp?: Phaser.Display.ColorRamp
}

type FilterList = Phaser.GameObjects.Components.FilterList

const clamp = Phaser.Math.Clamp

/** Blur sample count. More steps = smoother at a wider radius, at a linear GPU cost. */
const blurSteps = (radius: number): number => clamp(Math.round(radius), 3, 10)

export class PostFxChain {
  private _entries: Entry[] = []
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
        const entry = this._build(list, effect)
        if (entry) this._entries.push(entry)
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

  private _teardown(list: FilterList): void {
    for (const entry of this._entries) {
      // ParallelFilters holds two FilterLists of its own and has no destroy override,
      // so its inner passes would outlive it. Clear them before the outer list goes.
      entry.bloom?.parallel.top.clear()
      entry.bloom?.parallel.bottom.clear()
      entry.ramp?.destroy()
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

      case 'tilt_shift':
        return { type: effect.type, controller: list.addTiltShift() }

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

      case 'tilt_shift': {
        const f = entry.controller as Phaser.Filters.Bokeh
        const theta = Phaser.Math.DegToRad(effect.angle)
        f.radius = effect.radius
        f.amount = effect.amount
        f.contrast = effect.contrast
        f.strength = effect.falloff
        // The shader ramps the blur by `length(uv * blur)`, so `blur` is the axis the
        // image goes *soft* along: (0,1) blurs vertically and leaves a horizontal band.
        f.blurX = Math.sin(theta)
        f.blurY = Math.cos(theta)
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
