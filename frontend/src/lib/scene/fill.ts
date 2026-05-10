import type { BaseLayer } from './base'
import { DEFAULT_ANIMATIONS } from './base'

export type FillKind = 'solid' | 'linear'

/** A single colour stop within a fill. RGB and alpha are stored separately so the
 *  HTML `<input type="color">` (which ignores alpha) can drive the colour while a
 *  range slider drives alpha. */
export interface ColorStop {
  /** Position along the gradient axis, 0..1. Ignored for solid fills. */
  offset: number
  /** Hex colour #rrggbb. */
  color: string
  /** Alpha 0..1. */
  alpha: number
}

/** A fill layer — a full-canvas background. Supports solid colour and linear gradient. */
export interface FillLayer extends BaseLayer {
  type: 'fill'
  fill: FillKind
  /** Colour stops. Solid uses stops[0]; linear uses all stops in order. */
  stops: ColorStop[]
  /** Linear gradient angle in CSS degrees (0 = bottom→top, 90 = left→right, 180 = top→bottom). */
  angle: number
}

export const DEFAULT_FILL_LAYER: Omit<FillLayer, 'id'> = {
  type: 'fill',
  x: 0.5,
  y: 0.5,
  fill: 'linear',
  stops: [
    { offset: 0, color: '#0f172a', alpha: 1 },
    { offset: 1, color: '#1e293b', alpha: 1 },
  ],
  angle: 180,
  opacity: 1,
  animations: DEFAULT_ANIMATIONS,
  modifiers: [],
}
