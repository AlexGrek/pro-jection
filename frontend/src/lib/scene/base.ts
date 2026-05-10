/** Extensible per-layer animation spec. Always `{}` in the current version. */
export interface Animations {
  // future: { enter?: ..., exit?: ..., loop?: ... }
}

/** Per-layer modifier (Blender-style: array, filters, phaser options).
 *  Empty placeholder for now — actual modifier types will be a discriminated union later. */
export interface Modifier {
  // future: { id: string, type: 'array' | 'filter' | 'glow' | ..., ... }
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
