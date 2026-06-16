import type { BaseLayer } from './base'
import { DEFAULT_ANIMATIONS } from './base'

export type RaysDotShape = 'circle' | 'square'

export interface RaysLayer extends BaseLayer {
  type: 'rays'
  /** Dot shape rendered at each grid cell center. */
  shape: RaysDotShape
  columns: number
  rows: number
  /** Fraction of the cell's minimum dimension filled by the dot (0.1–1.0). */
  dot_size: number
  /** Cell size as a fraction of CANVAS_W. Only used when fullscreen=false. */
  cell_size: number
  color: string
  /** When true, the grid fills the entire canvas (1920×1080). */
  fullscreen: boolean
}

export const DEFAULT_RAYS_LAYER: Omit<RaysLayer, 'id'> = {
  type: 'rays',
  x: 0.5,
  y: 0.5,
  opacity: 1,
  animations: DEFAULT_ANIMATIONS,
  modifiers: [],
  shape: 'circle',
  columns: 3,
  rows: 3,
  dot_size: 0.5,
  cell_size: 0.08,
  color: '#ffffff',
  fullscreen: false,
}
