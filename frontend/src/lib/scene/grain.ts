import type { BaseLayer } from './base'
import { DEFAULT_ANIMATIONS } from './base'

export type GrainShape = 'dot' | 'line'

/** Maximum number of colours in a grain palette. */
export const GRAIN_MAX_COLORS = 6

/** A scatter of random dots or short lines. Deterministic: `seed` drives the PRNG so
 *  every connected client (controller + projector) renders the exact same pattern —
 *  the backend never re-generates or parses this, it just relays the scene blob. */
export interface GrainLayer extends BaseLayer {
  type: 'grain'
  shape: GrainShape
  /** Number of particles. */
  count: number
  /** Dot diameter / line length, in canvas pixels. */
  size: number
  /** Line stroke width, in canvas pixels. Only used when shape === 'line'. */
  line_width: number
  /** Palette of 1–6 hex colours; each particle picks one at random (seeded). */
  colors: string[]
  /** PRNG seed. Same seed + settings always produce the same pattern. */
  seed: number
  /** Bounding box width as a fraction of canvas width. Only used when fullscreen=false. */
  width: number
  /** Bounding box height as a fraction of canvas height. Only used when fullscreen=false. */
  height: number
  /** When true, particles scatter across the entire canvas (1920×1080). */
  fullscreen: boolean
}

export const DEFAULT_GRAIN_LAYER: Omit<GrainLayer, 'id'> = {
  type: 'grain',
  x: 0.5,
  y: 0.5,
  opacity: 1,
  animations: DEFAULT_ANIMATIONS,
  modifiers: [],
  shape: 'dot',
  count: 600,
  size: 3,
  line_width: 2,
  colors: ['#ffffff'],
  seed: 1,
  width: 0.4,
  height: 0.4,
  fullscreen: true,
}

export function randomGrainSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000)
}
