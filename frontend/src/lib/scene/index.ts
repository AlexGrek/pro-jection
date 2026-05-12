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

export * from './base'
export * from './fonts'
export * from './text'
export * from './shape'
export * from './fill'
export * from './icon'

/** Union of all known layer types. Grows as new types are added. */
export type Layer = TextLayer | ShapeLayer | FillLayer | IconLayer

/** A full slide: an ordered list of layers. */
export interface Scene {
  objects: Layer[]
}

export const EMPTY_SCENE: Scene = { objects: [] }
