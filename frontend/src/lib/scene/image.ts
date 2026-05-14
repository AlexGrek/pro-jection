import type { BaseLayer } from './base'
import { DEFAULT_ANIMATIONS } from './base'

export interface ImageLayer extends BaseLayer {
  type: 'image'
  /** URL of the uploaded image. Empty string when no image has been uploaded yet. */
  url: string
  /** Width as a fraction of canvas width (0–1). Height is derived from the image aspect ratio. */
  width: number
}

export const DEFAULT_IMAGE_LAYER: Omit<ImageLayer, 'id'> = {
  type: 'image',
  x: 0.5,
  y: 0.5,
  width: 0.4,
  url: '',
  opacity: 1,
  animations: DEFAULT_ANIMATIONS,
  modifiers: [],
}
