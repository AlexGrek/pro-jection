import type { BaseLayer } from './base'
import { DEFAULT_ANIMATIONS } from './base'

export interface IconLayer extends BaseLayer {
  type: 'icon'
  /** "packId:iconKey" format, e.g. "tabler:x" */
  icon_id: string
  color: string
  stroke_width: number
  /** Normalized size — fraction of canvas width. */
  size: number
}

export const DEFAULT_ICON_LAYER: Omit<IconLayer, 'id'> = {
  type: 'icon',
  x: 0.5,
  y: 0.5,
  size: 0.08,
  color: '#ffffff',
  stroke_width: 2,
  opacity: 1,
  icon_id: 'tabler:x',
  animations: DEFAULT_ANIMATIONS,
  modifiers: [],
}
