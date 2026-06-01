/** "Breathing" pulse of the layer's glow modifier. Requires a glow modifier to have any effect. */
export interface GlowAnimation {
  /** Full breathe-in/breathe-out period in seconds (0.5–4). */
  period: number
}

/** Extensible per-layer animation spec. */
export interface Animations {
  /** Pulses the glow modifier's strength in and out. */
  glow?: GlowAnimation
  // future: enter / exit / move …
}

export interface ArrayModifier {
  type: 'array'
  /** Total number of copies including the original (min 2). */
  count: number
  /** X offset per step. In absolute mode: fraction of canvas width. In relative mode: fraction of object width. */
  offset_x: number
  /** Y offset per step. In absolute mode: fraction of canvas height. In relative mode: fraction of object height. */
  offset_y: number
  /** Which axis the offset applies to. */
  direction: 'x' | 'y' | 'both'
  /** When true, offset is multiplied by the object's own dimensions (text/shape only). */
  relative: boolean
}

export interface GlowModifier {
  type: 'glow'
  /** Hex color string, e.g. '#ffffff'. */
  color: string
  /** Strength of the glow radiating outward (0–20). */
  outer_strength: number
  /** Strength of the glow radiating inward (0–10). */
  inner_strength: number
  /** Glow spread distance in canvas pixels (5–50). Immutable once applied — changes recreate the filter. */
  distance: number
}

export interface MatrixModifier {
  type: 'matrix'
  /** Columns in the grid (≥ 1). */
  cols: number
  /** Rows in the grid (≥ 1). */
  rows: number
  /** X step per column. Absolute: fraction of canvas width. Relative: fraction of object width. */
  offset_x: number
  /** Y step per row. Absolute: fraction of canvas height. Relative: fraction of object height. */
  offset_y: number
  /** When true, offsets are multiplied by the object's own dimensions. */
  relative: boolean
}

export type Modifier = ArrayModifier | GlowModifier | MatrixModifier

export function getArrayModifier(layer: { modifiers: Modifier[] }): ArrayModifier | undefined {
  return layer.modifiers.find((m): m is ArrayModifier => m.type === 'array')
}

export function getGlowModifier(layer: { modifiers: Modifier[] }): GlowModifier | undefined {
  return layer.modifiers.find((m): m is GlowModifier => m.type === 'glow')
}

export function getMatrixModifier(layer: { modifiers: Modifier[] }): MatrixModifier | undefined {
  return layer.modifiers.find((m): m is MatrixModifier => m.type === 'matrix')
}

/** Fields shared by every layer type. */
export interface BaseLayer {
  id: string
  /** Normalized horizontal position: 0 = left edge, 1 = right edge. */
  x: number
  /** Normalized vertical position: 0 = top edge, 1 = bottom edge. */
  y: number
  /** Layer alpha, 0 (transparent) to 1 (fully opaque). */
  opacity: number
  animations: Animations
  /** Stack of modifiers applied in order. Empty for now. */
  modifiers: Modifier[]
}

export const DEFAULT_ANIMATIONS: Animations = {}

/** Default glow-breathing spec: a calm ~1 s pulse. Period range is 0.5–4 s. */
export const DEFAULT_GLOW_ANIMATION: GlowAnimation = { period: 1 }

/** Inclusive bounds for the glow-breathing period slider, in seconds. */
export const GLOW_PERIOD_MIN = 0.5
export const GLOW_PERIOD_MAX = 4
