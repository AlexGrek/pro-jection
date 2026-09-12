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
  | 'warp'
  | 'pixelate'
  | 'blocky'
  | 'posterize'
  | 'palette'
  | 'scanlines'
  | 'chroma'
  | 'noise'
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
 * Warp: push every pixel along a smooth noise field — uneven glass, heat haze, a
 * rippled surface. Deterministic on purpose: `seed` drives the noise, so the
 * controller and every projector bend the image identically from the same scene JSON.
 * Never regenerate this from `Math.random()` at render time.
 *
 * Unlike the keystone warp this is a per-pixel image distortion, not a quad transform,
 * and like `barrel` it moves the image without moving the controller's hit-testing.
 */
export interface WarpEffect extends BaseEffect {
  type: 'warp'
  /** Peak displacement as a fraction of the canvas, 0 – 0.3. */
  amount: number
  /** Noise cells across the canvas, 2 – 32. Higher = finer, busier ripples. */
  scale: number
  /** PRNG seed. Same seed + scale always produce the same distortion. */
  seed: number
}

export function randomWarpSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000)
}

/** Mosaic. `amount` is the block size in canvas pixels. */
export interface PixelateEffect extends BaseEffect {
  type: 'pixelate'
  /** Block size in canvas pixels, 1 (off) – 48. */
  amount: number
}

/**
 * Blocks: the same idea as `pixelate` but with independent width and height, so the
 * grid can be a non-square "text mode" or CRT cell rather than a square pixel. The
 * offset slides the grid, which is what stops a block edge landing on a hard line.
 */
export interface BlockyEffect extends BaseEffect {
  type: 'blocky'
  /** Block width in canvas pixels, 1 – 64. */
  size_x: number
  /** Block height in canvas pixels, 1 – 64. */
  size_y: number
  /** Grid offset in canvas pixels, 0 – 32 on each axis. */
  offset_x: number
  offset_y: number
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

/**
 * Retro palettes, luminance-ordered darkest → lightest. `palette` maps each pixel's
 * luminance onto one of these entries with no interpolation, so the output only ever
 * contains these exact colours. Order matters: `GradientMap` walks the ramp by
 * luminance, so an out-of-order entry reads as a banding artefact.
 */
export type PalettePreset = 'mono' | 'gameboy' | 'green' | 'amber' | 'cga' | 'c64' | 'nes' | 'pico8'

export const PALETTES: { id: PalettePreset; label: string; colors: string[] }[] = [
  { id: 'mono', label: '1-bit', colors: ['#000000', '#ffffff'] },
  { id: 'gameboy', label: 'Game Boy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  { id: 'green', label: 'Green phosphor', colors: ['#000000', '#003b00', '#008f11', '#00ff41'] },
  { id: 'amber', label: 'Amber phosphor', colors: ['#0d0600', '#552200', '#b26b00', '#ffb000'] },
  { id: 'cga', label: 'CGA', colors: ['#000000', '#ff55ff', '#55ffff', '#ffffff'] },
  {
    id: 'c64',
    label: 'C64',
    colors: [
      '#000000', '#352879', '#574200', '#883932', '#6f3d86', '#8b5429', '#626262',
      '#6c5eb5', '#9a6759', '#adadad', '#b8c76f', '#aaff66', '#ffffff',
    ],
  },
  {
    id: 'nes',
    label: 'NES',
    colors: [
      '#000000', '#0000bc', '#bc0000', '#6844fc', '#00a800', '#f83800', '#00e8d8',
      '#f878f8', '#f8b800', '#bcbcbc', '#b8f818', '#fcfcfc',
    ],
  },
  {
    id: 'pico8',
    label: 'PICO-8',
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#ff004d', '#5f574f', '#008751', '#ab5236',
      '#83769c', '#29adff', '#00e436', '#ff77a8', '#ffa300', '#c2c3c7', '#ffccaa',
      '#ffec27', '#fff1e8',
    ],
  },
]

export const paletteColors = (preset: PalettePreset): string[] =>
  (PALETTES.find((p) => p.id === preset) ?? PALETTES[0]).colors

/**
 * Palette: crush the image to a fixed retro palette by luminance. Same machinery as
 * `duotone` (a `GradientMap` ramp) but with flat bands and a curated colour list, which
 * is what makes it read as hardware rather than as a colour wash.
 */
export interface PaletteEffect extends BaseEffect {
  type: 'palette'
  preset: PalettePreset
  /** Blend with the untouched image, 0 (original) – 1 (full palette). */
  mix: number
  /** Dither the lookup, trading banding for a stipple — the classic 8-bit compromise. */
  dither: boolean
}

/** Which CRT pattern `scanlines` lays over the canvas. */
export type ScanlineMode = 'lines' | 'grille' | 'dots'

export const SCANLINE_MODES: { id: ScanlineMode; label: string }[] = [
  { id: 'lines', label: 'Scanlines' },
  { id: 'grille', label: 'Aperture grille' },
  { id: 'dots', label: 'Dot screen' },
]

/**
 * Scanlines: multiply a repeating CRT pattern over the canvas. `lines` darkens every
 * Nth row, `grille` splits into R/G/B columns like an aperture-grille tube, and `dots`
 * lays down a fixed print-style dot screen (a fixed screen, not a true luminance
 * halftone).
 *
 * The pattern is drawn at full canvas resolution with nearest-neighbour filtering — a
 * scaled-down pattern turns into grey mush.
 */
export interface ScanlinesEffect extends BaseEffect {
  type: 'scanlines'
  mode: ScanlineMode
  /** Pattern period in canvas pixels, 2 – 24. */
  spacing: number
  /** Line height / dot diameter in canvas pixels, 1 – 12. Clamped below `spacing`. */
  thickness: number
  /** How hard the pattern bites, 0 – 1. */
  intensity: number
}

/**
 * Chromatic aberration: split the red channel away from green and blue along an axis.
 * Built from a `ParallelFilters` composite — see `postfx.ts`.
 */
export interface ChromaEffect extends BaseEffect {
  type: 'chroma'
  /** Separation as a fraction of canvas width, 0 – 0.05. */
  amount: number
  /** Direction of the split in degrees, 0 – 360. */
  angle: number
}

/**
 * Noise: overlay seeded grain — film stock, VHS, video hiss. Deterministic for the same
 * reason `warp` is: every client must generate the same grain from the same scene JSON.
 */
export interface NoiseEffect extends BaseEffect {
  type: 'noise'
  /** How strongly the grain is mixed in, 0 – 1. */
  amount: number
  /** Grain size in canvas pixels, 1 (per-pixel) – 12 (chunky). */
  size: number
  /** Monochrome grain, or independent per-channel colour speckle. */
  mono: boolean
  /** PRNG seed. Same seed + size always produce the same grain. */
  seed: number
}

export function randomNoiseSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000)
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
  | WarpEffect
  | PixelateEffect
  | BlockyEffect
  | PosterizeEffect
  | PaletteEffect
  | ScanlinesEffect
  | ChromaEffect
  | NoiseEffect
  | ThresholdEffect
  | DuotoneEffect
  | VignetteEffect
  | BarrelEffect

/**
 * Chain length cap. Every entry is another full-canvas GPU pass on every client, and
 * the projector is the machine that can least afford to drop frames.
 */
export const EFFECT_MAX = 8

/** Pickable effects, in menu order. */
export const EFFECT_TYPES: { id: EffectType; label: string; hint: string }[] = [
  { id: 'color', label: 'Colour grade', hint: 'Preset matrix + brightness / contrast / saturation / hue' },
  { id: 'bloom', label: 'Bloom', hint: 'Blurred bright-pass added back over the image' },
  { id: 'blur', label: 'Blur', hint: 'Soften the whole canvas' },
  { id: 'warp', label: 'Warp', hint: 'Ripple the image through a seeded noise field' },
  { id: 'pixelate', label: 'Pixelate', hint: 'Square mosaic blocks' },
  { id: 'blocky', label: 'Blocks', hint: 'Non-square pixel grid with an offset' },
  { id: 'posterize', label: 'Posterize', hint: 'Quantise each channel to a few levels' },
  { id: 'palette', label: 'Palette', hint: 'Crush to a retro palette — Game Boy, CGA, C64, PICO-8…' },
  { id: 'scanlines', label: 'Scanlines', hint: 'CRT scanlines, aperture grille or dot screen' },
  { id: 'chroma', label: 'Chromatic', hint: 'Split the red channel away from green and blue' },
  { id: 'noise', label: 'Noise', hint: 'Seeded film / VHS grain over everything' },
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
    case 'warp':
      return { id, enabled: true, type, amount: 0.06, scale: 8, seed: randomWarpSeed() }
    case 'pixelate':
      return { id, enabled: true, type, amount: 12 }
    case 'blocky':
      return { id, enabled: true, type, size_x: 16, size_y: 6, offset_x: 0, offset_y: 0 }
    case 'palette':
      return { id, enabled: true, type, preset: 'gameboy', mix: 1, dither: true }
    case 'scanlines':
      return { id, enabled: true, type, mode: 'lines', spacing: 6, thickness: 3, intensity: 0.7 }
    case 'chroma':
      return { id, enabled: true, type, amount: 0.008, angle: 0 }
    case 'noise':
      return { id, enabled: true, type, amount: 0.35, size: 2, mono: true, seed: randomNoiseSeed() }
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
    case 'warp':
      return `${Math.round(effect.amount * 100)}% × ${effect.scale}`
    case 'pixelate':
      return `${effect.amount}px`
    case 'blocky':
      return `${effect.size_x}×${effect.size_y}px`
    case 'palette':
      return PALETTES.find((p) => p.id === effect.preset)?.label.toLowerCase() ?? effect.preset
    case 'scanlines':
      return `${SCANLINE_MODES.find((m) => m.id === effect.mode)?.label.toLowerCase()} ${effect.spacing}px`
    case 'chroma':
      return `${(effect.amount * 100).toFixed(1)}% @ ${Math.round(effect.angle)}°`
    case 'noise':
      return `${Math.round(effect.amount * 100)}% × ${effect.size}px`
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
