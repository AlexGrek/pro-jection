import type { BaseLayer } from './base'
import { DEFAULT_ANIMATIONS } from './base'

export interface LinesLayer extends BaseLayer {
  type: 'lines'
  /** Angle in degrees (0 to 180) */
  angle: number
  /** Line width in canvas pixels */
  line_width: number
  /** Spacing between lines in canvas pixels */
  spacing: number
  color: string
  /** Normalized width (0..1 of canvas width). Only used when fullscreen=false. */
  width: number
  /** Normalized height (0..1 of canvas height). Only used when fullscreen=false. */
  height: number
  /** When true, fills the entire canvas (1920×1080). */
  fullscreen: boolean
}

export const DEFAULT_LINES_LAYER: Omit<LinesLayer, 'id'> = {
  type: 'lines',
  x: 0.5,
  y: 0.5,
  opacity: 1,
  animations: DEFAULT_ANIMATIONS,
  modifiers: [],
  angle: 45,
  line_width: 4,
  spacing: 40,
  width: 0.5,
  height: 0.5,
  color: '#3b82f6',
  fullscreen: true,
}
