import type { BaseLayer } from './base'
import { DEFAULT_ANIMATIONS } from './base'
import type { FontId } from './fonts'
import { DEFAULT_FONT_ID } from './fonts'

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
