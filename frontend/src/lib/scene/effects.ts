/**
 * Scene-wide post-processing chain.
 *
 * Like the grid overlay and the keystone warp, this is not an object you add to the
 * layer stack — it is one optional field on the `Scene` that rides along on every
 * send. `Scene.effects` absent or empty means "no post-processing".
 *
 * Each entry maps onto one Phaser camera filter (see `lib/phaser/postfx.ts`) applied
 * to the whole canvas, in array order: a colour grade in front of a pixelate looks
 * different from the reverse. Every client runs the chain over its own render, so the
 * controller preview and each projector agree without anything being baked into a
 * texture — and the backend still never parses the scene.
 *
 * Ranges in the doc comments below are what the UI enforces and what the Phaser
 * filters expect; the renderer clamps anyway, but a value outside them is a bug.
 */

/** Discriminator for the effect union. */
export type EffectType =
  | 'color'
  | 'bloom'
  | 'blur'
  | 'tilt_shift'
  | 'pixelate'
  | 'posterize'
  | 'threshold'
  | 'duotone'
  | 'vignette'
  | 'barrel'

export interface BaseEffect {
  id: string
  /** Off keeps the effect (and its settings) in the chain without rendering it. */
  enabled: boolean
}

/**
 * Named colour-grade matrices from `Phaser.Display.ColorMatrix`. Applied first, then
 * the four adjustments below are multiplied on top, so a preset is a starting point
 * rather than a dead end.
 */
export type ColorGradePreset =
  | 'none'
  | 'grayscale'
  | 'mono'
  | 'negative'
  | 'sepia'
  | 'night'
  | 'kodachrome'
  | 'technicolor'
  | 'polaroid'
  | 'vintage'
  | 'brown'
  | 'lsd'
  | 'bgr'

export const COLOR_GRADE_PRESETS: { id: ColorGradePreset; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'grayscale', label: 'Greyscale' },
  { id: 'mono', label: 'Black & white' },
  { id: 'negative', label: 'Negative' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'night', label: 'Night' },
  { id: 'kodachrome', label: 'Kodachrome' },
  { id: 'technicolor', label: 'Technicolor' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'brown', label: 'Brown' },
  { id: 'lsd', label: 'LSD' },
  { id: 'bgr', label: 'Swap R/B' },
]

/** Colour grading: a preset matrix plus the four usual adjustments. */
export interface ColorEffect extends BaseEffect {
  type: 'color'
  preset: ColorGradePreset
  /** Channel multiplier, 0 (black) – 2. 1 leaves the image alone. */
  brightness: number
  /** -1 – 1. 0 leaves the image alone. */
  contrast: number
  /** -1.5 (grey) – 2. 0 leaves the image alone. */
  saturation: number
  /** Hue rotation in degrees, 0 – 360. */
  hue: number
}

/**
 * Bloom: a bright-pass is blurred and added back over the original. Built from a
 * `ParallelFilters` composite rather than a single filter — see `postfx.ts`.
 */
export interface BloomEffect extends BaseEffect {
  type: 'bloom'
  /** Luminance at which a pixel starts to bloom, 0 – 0.95. Lower = more of the frame glows. */
  threshold: number
  /** Spread of the bloom in canvas pixels, 1 – 24. */
  radius: number
  /** How much of the blurred bright-pass is added back, 0 – 2. */
  strength: number
}

/** Gaussian blur over the whole canvas. */
export interface BlurEffect extends BaseEffect {
  type: 'blur'
  /** Per-step sample offset in canvas pixels, 0 – 16. */
  radius: number
  /** Opacity of the blurred result, 0 – 4. Above 1 brightens as it blurs. */
  strength: number
}

/**
 * Tilt-shift: one sharp band across the canvas, bokeh-blurred away from it. The band
 * always runs through the centre — `falloff` sets how tight it is and `angle` which
 * way it runs.
 */
export interface TiltShiftEffect extends BaseEffect {
  type: 'tilt_shift'
  /** Bokeh sample radius at full blur, 0 – 2. */
  radius: number
  /** Highlight bloom inside the bokeh, 0 – 4. */
  amount: number
  /** Bokeh contrast, 0 – 1. */
  contrast: number
  /** How fast the blur ramps away from the centre — higher = narrower sharp band, 0.2 – 4. */
  falloff: number
  /** Orientation of the sharp band in degrees, 0 (horizontal) – 180. */
  angle: number
}

/** Mosaic. `amount` is the block size in canvas pixels. */
export interface PixelateEffect extends BaseEffect {
  type: 'pixelate'
  /** Block size in canvas pixels, 1 (off) – 48. */
  amount: number
}

/** Posterize: quantise each channel to a small number of levels. */
export interface PosterizeEffect extends BaseEffect {
  type: 'posterize'
  /** Levels per channel, 2 – 16. */
  steps: number
  /** Dither the result to break up the banding. */
  dither: boolean
  /** `rgb` quantises the channels; `hsv` quantises hue/saturation/value, which keeps hues cleaner. */
  mode: 'rgb' | 'hsv'
}

/**
 * Threshold: everything below `edge1` goes black, everything above `edge2` goes full,
 * with a ramp in between. Equal edges give a hard two-tone cut.
 */
export interface ThresholdEffect extends BaseEffect {
  type: 'threshold'
  /** Lower edge, 0 – 1. */
  edge1: number
  /** Upper edge, 0 – 1. Should be ≥ `edge1`; equal means a hard cut. */
  edge2: number
  invert: boolean
}

/** Minimum / maximum colours in a duotone ramp. */
export const DUOTONE_MIN_COLORS = 2
export const DUOTONE_MAX_COLORS = 4

/** Duotone: remap luminance onto a colour ramp, dark stop first. */
export interface DuotoneEffect extends BaseEffect {
  type: 'duotone'
  /** 2–4 hex colours, darkest first. Evenly spaced along the ramp. */
  colors: string[]
  /** Blend with the untouched image, 0 (original) – 1 (full duotone). */
  mix: number
  /** Dither the ramp lookup to avoid banding on gradients. */
  dither: boolean
}

/** Vignette: darken (or lighten) the canvas away from a centre point. */
export interface VignetteEffect extends BaseEffect {
  type: 'vignette'
  /** Centre, 0 – 1 across the canvas. */
  x: number
  y: number
  /** Radius of the untouched centre, 0 – 1. */
  radius: number
  /** How hard the falloff bites, 0 – 1. */
  strength: number
  /** Hex colour bled in at the edges. Black is the usual choice. */
  color: string
}

/**
 * Barrel / pincushion lens distortion. Handy for pre-compensating a short-throw lens
 * on a curved surface — note that it moves the *image* only: pointer hit-testing on
 * the controller still uses undistorted coordinates.
 */
export interface BarrelEffect extends BaseEffect {
  type: 'barrel'
  /** 1 = flat. Below 1 pincushions, above 1 barrels. Useful range 0 – 2. */
  amount: number
}

export type Effect =
  | ColorEffect
  | BloomEffect
  | BlurEffect
  | TiltShiftEffect
  | PixelateEffect
  | PosterizeEffect
  | ThresholdEffect
  | DuotoneEffect
  | VignetteEffect
  | BarrelEffect

/**
 * Chain length cap. Every entry is another full-canvas GPU pass on every client, and
 * the projector is the machine that can least afford to drop frames.
 */
export const EFFECT_MAX = 6

/** Pickable effects, in menu order. */
export const EFFECT_TYPES: { id: EffectType; label: string; hint: string }[] = [
  { id: 'color', label: 'Colour grade', hint: 'Preset matrix + brightness / contrast / saturation / hue' },
  { id: 'bloom', label: 'Bloom', hint: 'Blurred bright-pass added back over the image' },
  { id: 'blur', label: 'Blur', hint: 'Soften the whole canvas' },
  { id: 'tilt_shift', label: 'Tilt shift', hint: 'One sharp band, blurred away from it' },
  { id: 'pixelate', label: 'Pixelate', hint: 'Mosaic blocks' },
  { id: 'posterize', label: 'Posterize', hint: 'Quantise each channel to a few levels' },
  { id: 'threshold', label: 'Threshold', hint: 'Crush to two tones with a soft edge' },
  { id: 'duotone', label: 'Duotone', hint: 'Remap luminance onto a colour ramp' },
  { id: 'vignette', label: 'Vignette', hint: 'Darken the edges of the projection' },
  { id: 'barrel', label: 'Lens', hint: 'Barrel / pincushion distortion' },
]

export const effectLabel = (type: EffectType): string =>
  EFFECT_TYPES.find((t) => t.id === type)?.label ?? type

/**
 * A fresh effect of the given type, with neutral-ish defaults that are visible
 * straight away — an effect you add and can't see reads as broken.
 */
export function createEffect(type: EffectType): Effect {
  const id = crypto.randomUUID()
  switch (type) {
    case 'color':
      return { id, enabled: true, type, preset: 'none', brightness: 1, contrast: 0.2, saturation: 0.3, hue: 0 }
    case 'bloom':
      return { id, enabled: true, type, threshold: 0.6, radius: 8, strength: 1 }
    case 'blur':
      return { id, enabled: true, type, radius: 4, strength: 1 }
    case 'tilt_shift':
      return { id, enabled: true, type, radius: 0.8, amount: 1, contrast: 0.2, falloff: 1, angle: 0 }
    case 'pixelate':
      return { id, enabled: true, type, amount: 12 }
    case 'posterize':
      return { id, enabled: true, type, steps: 4, dither: false, mode: 'rgb' }
    case 'threshold':
      return { id, enabled: true, type, edge1: 0.35, edge2: 0.55, invert: false }
    case 'duotone':
      return { id, enabled: true, type, colors: ['#0b1026', '#f472b6'], mix: 1, dither: true }
    case 'vignette':
      return { id, enabled: true, type, x: 0.5, y: 0.5, radius: 0.5, strength: 0.6, color: '#000000' }
    case 'barrel':
      return { id, enabled: true, type, amount: 1.2 }
  }
}

/** One-line value summary for the effect list row. */
export function effectSummary(effect: Effect): string {
  switch (effect.type) {
    case 'color': {
      const preset = COLOR_GRADE_PRESETS.find((p) => p.id === effect.preset)
      return effect.preset === 'none' ? 'custom' : (preset?.label.toLowerCase() ?? effect.preset)
    }
    case 'bloom':
      return `×${effect.strength.toFixed(1)} @ ${effect.radius}px`
    case 'blur':
      return `${effect.radius}px`
    case 'tilt_shift':
      return `${effect.radius.toFixed(1)} @ ${Math.round(effect.angle)}°`
    case 'pixelate':
      return `${effect.amount}px`
    case 'posterize':
      return `${effect.steps} levels`
    case 'threshold':
      return `${effect.edge1.toFixed(2)} – ${effect.edge2.toFixed(2)}`
    case 'duotone':
      return `${effect.colors.length} stops`
    case 'vignette':
      return `${Math.round(effect.strength * 100)}%`
    case 'barrel':
      return effect.amount.toFixed(2)
  }
}
