/**
 * Canonical scene type system.
 *
 * The JSON wire format matches the Rust backend (snake_case field names).
 * Every layer carries the base fields plus its own discriminated `type` and props.
 * The backend is a dumb relay — it never parses scene JSON.
 */

import type { TextLayer } from './text'
import type { ShapeLayer } from './shape'
import type { FillLayer } from './fill'
import type { IconLayer } from './icon'
import type { ImageLayer } from './image'
import type { VideoLayer } from './video'
import type { BarcodeLayer } from './barcode'
import type { GridSettings } from './grid'

export * from './base'
export * from './fonts'
export * from './text'
export * from './shape'
export * from './fill'
export * from './icon'
export * from './image'
export * from './video'
export * from './barcode'
export * from './grid'

/** Union of all known layer types. Grows as new types are added. */
export type Layer = TextLayer | ShapeLayer | FillLayer | IconLayer | ImageLayer | VideoLayer | BarcodeLayer

/** A full slide: an ordered list of layers plus an optional scene-wide grid overlay. */
export interface Scene {
  objects: Layer[]
  /** Grid overlay drawn on top of every layer. Absent = off. */
  grid?: GridSettings
}

export const EMPTY_SCENE: Scene = { objects: [] }
