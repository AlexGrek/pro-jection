import type { BaseLayer } from './base'
import { DEFAULT_ANIMATIONS } from './base'

export interface VideoLayer extends BaseLayer {
  type: 'video'
  /** URL of the uploaded video. Empty string when no video has been uploaded yet. */
  url: string
  /** Width as a fraction of canvas width (0–1). Height is derived from the video aspect ratio. */
  width: number
  /** Loop playback when it reaches the end. */
  loop: boolean
  /** Mute the audio track. Required true for browsers to autoplay. */
  muted: boolean
}

export const DEFAULT_VIDEO_LAYER: Omit<VideoLayer, 'id'> = {
  type: 'video',
  x: 0.5,
  y: 0.5,
  width: 0.4,
  url: '',
  loop: true,
  muted: true,
  opacity: 1,
  animations: DEFAULT_ANIMATIONS,
  modifiers: [],
}
