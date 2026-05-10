import type { BaseLayer } from './base'
import { DEFAULT_ANIMATIONS } from './base'

export type ShapeKind = 'rectangle' | 'circle'

/** A shape layer — rectangle or circle, filled or outlined. */
export interface ShapeLayer extends BaseLayer {
  type: 'shape'
  shape: ShapeKind
  /** Normalized width (0..1 of canvas width). For circle, the horizontal diameter. */
  width: number
  /** Normalized height (0..1 of canvas height). For circle, the vertical diameter. */
  height: number
  /** Hex color used for fill (when filled) or stroke (when outlined). */
  color: string
  /** When true, render solid fill; when false, outline only with `stroke_width`. */
  filled: boolean
  /** Outline width in canvas pixels. Used when `filled=false`. */
  stroke_width: number
}

export const DEFAULT_RECT_LAYER: Omit<ShapeLayer, 'id'> = {
  type: 'shape',
  shape: 'rectangle',
  x: 0.5,
  y: 0.5,
  width: 0.3,
  height: 0.2,
  color: '#3b82f6',
  filled: true,
  stroke_width: 4,
  opacity: 1,
  animations: DEFAULT_ANIMATIONS,
  modifiers: [],
}

export const DEFAULT_CIRCLE_LAYER: Omit<ShapeLayer, 'id'> = {
  ...DEFAULT_RECT_LAYER,
  shape: 'circle',
  width: 0.2,
  height: 0.2,
}
