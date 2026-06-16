/**
 * Scene-wide grid overlay. Unlike layers it is not an object you add — it is a
 * single toggle on the scene, drawn on top of every layer on both the controller
 * and the projector. `Scene.grid` absent means the overlay is off.
 */

/** Which grid pattern to draw. */
export type GridType = 'lines' | 'dots' | 'thirds' | 'columns'

export interface GridSettings {
  /** The pattern to render. */
  type: GridType
}

/** Pickable grid patterns, in menu order. */
export const GRID_TYPES: { id: GridType; label: string }[] = [
  { id: 'lines', label: 'Grid' },
  { id: 'dots', label: 'Dots' },
  { id: 'thirds', label: 'Rule of thirds' },
  { id: 'columns', label: 'Columns' },
]

/** Pattern used when the overlay is first enabled. */
export const DEFAULT_GRID: GridSettings = { type: 'lines' }
