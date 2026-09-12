import type { BaseLayer } from './base'
import { DEFAULT_ANIMATIONS } from './base'

export type ConcentricShape = 'circle' | 'square' | 'triangle'

export interface ConcentricLayer extends BaseLayer {
  type: 'concentric'
  shape: ConcentricShape
  /** Normalized width (0..1 of canvas width). */
  width: number
  /** Normalized height (0..1 of canvas height). */
  height: number
  color: string
  count: number
  stroke_width: number
}

export const DEFAULT_CONCENTRIC_LAYER: Omit<ConcentricLayer, 'id'> = {
  type: 'concentric',
  shape: 'circle',
  x: 0.5,
  y: 0.5,
  width: 0.4,
  height: 0.4,
  color: '#a855f7',
  count: 3,
  stroke_width: 4,
  opacity: 1,
  animations: DEFAULT_ANIMATIONS,
  modifiers: [],
}
