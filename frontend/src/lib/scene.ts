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
 *       "color": "#ffffff",
 *       "font_family": "outfit"
 *     }
 *   ]
 * }
 */

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

// ── Font catalogue ───────────────────────────────────────────────────────────

export const FONT_OPTIONS = [
  { id: 'outfit',        label: 'Outfit',           css: '"Outfit Variable", "Outfit", sans-serif' },
  { id: 'inter',         label: 'Inter',             css: '"Inter Variable", "Inter", sans-serif' },
  { id: 'space-grotesk', label: 'Space Grotesk',     css: '"Space Grotesk Variable", "Space Grotesk", sans-serif' },
  { id: 'playfair',      label: 'Playfair Display',  css: '"Playfair Display Variable", "Playfair Display", serif' },
  { id: 'space-mono',    label: 'Space Mono',        css: '"Space Mono", monospace' },
  { id: 'bebas-neue',    label: 'Bebas Neue',        css: '"Bebas Neue", sans-serif' },
  { id: 'dancing-script',label: 'Dancing Script',    css: '"Dancing Script Variable", "Dancing Script", cursive' },
] as const

export type FontId = typeof FONT_OPTIONS[number]['id']

export const DEFAULT_FONT_ID: FontId = 'outfit'

export const FONT_CSS: Record<FontId, string> = Object.fromEntries(
  FONT_OPTIONS.map((f) => [f.id, f.css]),
) as Record<FontId, string>

// ── Layer types ──────────────────────────────────────────────────────────────

/** A text layer. Matches `TextLayer` in the Rust backend. */
export interface TextLayer extends BaseLayer {
  type: 'text'
  text: string
  /** Font size in 1920×1080 canvas pixels. */
  font_size: number
  /** Text color as #rrggbb. */
  color: string
  /** Font family id from FONT_OPTIONS. Absent in old scenes → defaults to 'outfit'. */
  font_family: FontId
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
  font_family: DEFAULT_FONT_ID,
  opacity: 1,
  animations: DEFAULT_ANIMATIONS,
  modifiers: [],
}

export const EMPTY_SCENE: Scene = { objects: [] }
