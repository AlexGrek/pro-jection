/**
 * Canonical scene type system.
 *
 * The JSON wire format matches the Rust backend (snake_case field names).
 * Every layer carries the base fields plus its own discriminated `type` and props.
 *
 * Example JSON:
 * {
 *   "objects": [
 *     {
 *       "id": "abc",
 *       "type": "text",
 *       "x": 0.5,
 *       "y": 0.3,
 *       "animations": {},
 *       "text": "Hello",
 *       "font_size": 96,
 *       "color": "#ffffff"
 *     }
 *   ]
 * }
 */

/** Extensible per-layer animation spec. Always `{}` in the current version. */
export interface Animations {
  // future: { enter?: ..., exit?: ..., loop?: ... }
}

/** Fields shared by every layer type. */
export interface BaseLayer {
  id: string
  /** Normalized horizontal position: 0 = left edge, 1 = right edge. */
  x: number
  /** Normalized vertical position: 0 = top edge, 1 = bottom edge. */
  y: number
  animations: Animations
}

/** A text layer. Matches `TextLayer` in the Rust backend. */
export interface TextLayer extends BaseLayer {
  type: 'text'
  text: string
  /** Font size in 1920×1080 canvas pixels. */
  font_size: number
  /** Text color as #rrggbb. */
  color: string
}

/** Union of all known layer types. Grows as new types are added. */
export type Layer = TextLayer

/** A full slide: an ordered list of layers. */
export interface Scene {
  objects: Layer[]
}

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_ANIMATIONS: Animations = {}

export const DEFAULT_TEXT_LAYER: Omit<TextLayer, 'id'> = {
  type: 'text',
  text: '',
  x: 0.5,
  y: 0.5,
  font_size: 96,
  color: '#ffffff',
  animations: DEFAULT_ANIMATIONS,
}

export const EMPTY_SCENE: Scene = { objects: [] }
