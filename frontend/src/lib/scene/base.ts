/** Extensible per-layer animation spec. Always `{}` in the current version. */
export interface Animations {
  // future: { enter?: ..., exit?: ..., loop?: ... }
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

export type Modifier = ArrayModifier

export function getArrayModifier(layer: { modifiers: Modifier[] }): ArrayModifier | undefined {
  return layer.modifiers.find((m): m is ArrayModifier => m.type === 'array')
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
