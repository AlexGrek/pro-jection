/**
 * Scene-wide 3D projection (keystone) warp. Like the grid it is not an object you
 * add — it is a single setting on the scene. The four corners say where the
 * canvas's own corners land, in normalised canvas coordinates: 0–1 spans the
 * untransformed canvas box, and values outside that range push a corner past the
 * edge (clipped by the canvas container). `Scene.projection` absent means flat.
 *
 * The projector always renders the warp. The controller can preview flat or
 * projected — that toggle is local and never travels on the wire.
 */

export interface Corner {
  x: number
  y: number
}

/** Clockwise from top-left: TL, TR, BR, BL. */
export type Corners = [Corner, Corner, Corner, Corner]

export interface ProjectionSettings {
  corners: Corners
  /**
   * Calibration mode. Travels on the wire on purpose: while it is on, *every*
   * client draws a warped alignment grid so you can see how the quad lands on the
   * real surface, and the controller additionally shows draggable corner handles.
   */
  editing?: boolean
  /**
   * Colour of the calibration grid. Rides on the wire with `editing` — the point
   * is to pick something that reads against the actual projection surface, so the
   * projector has to know. Absent = the default preset.
   */
  color?: CalibrationColor
}

/**
 * Calibration grid palette. Deliberately three high-visibility choices rather than
 * a free colour picker: this is a legibility control for the physical surface, not
 * a design decision.
 */
export type CalibrationColor = 'yellow' | 'cyan' | 'red'

export const CALIBRATION_COLORS: { id: CalibrationColor; label: string; hex: string }[] = [
  { id: 'yellow', label: 'Yellow', hex: '#facc15' },
  { id: 'cyan', label: 'Cyan', hex: '#22d3ee' },
  { id: 'red', label: 'Red', hex: '#ef4444' },
]

export const DEFAULT_CALIBRATION_COLOR: CalibrationColor = 'yellow'

export const calibrationHex = (color?: CalibrationColor): string =>
  (CALIBRATION_COLORS.find((c) => c.id === color) ?? CALIBRATION_COLORS[0]).hex

export const CORNER_LABELS = ['Top left', 'Top right', 'Bottom right', 'Bottom left'] as const

/** How far a corner may be pushed past the canvas edge. */
export const CORNER_MIN = -0.5
export const CORNER_MAX = 1.5

export const IDENTITY_CORNERS: Corners = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

export const cloneCorners = (c: Corners): Corners => [{ ...c[0] }, { ...c[1] }, { ...c[2] }, { ...c[3] }]

/**
 * A fresh identity projection. Always build one through this rather than sharing a
 * module-level constant — the corner objects get replaced per edit, and an aliased
 * default would leak edits between scenes.
 */
export const defaultProjection = (): ProjectionSettings => ({
  corners: cloneCorners(IDENTITY_CORNERS),
  editing: true,
  color: DEFAULT_CALIBRATION_COLOR,
})

/**
 * True when the quad is the canvas itself — the warp is a no-op and can be skipped.
 * Compared with a tolerance: nudging a corner out and back lands a float-epsilon
 * away from 1, which would otherwise leave the warp "active" forever.
 */
export function isIdentityCorners(corners: Corners): boolean {
  return corners.every(
    (c, i) =>
      Math.abs(c.x - IDENTITY_CORNERS[i].x) < 1e-6 && Math.abs(c.y - IDENTITY_CORNERS[i].y) < 1e-6,
  )
}

/**
 * A quad is only usable while it stays convex and keeps its original winding. Fold
 * one corner past its neighbours and the homography turns singular: the browser
 * clips the canvas away entirely, which reads as the projection crashing. The
 * cross-product sign test is invariant under the per-axis scaling applied later,
 * so it is valid on normalised coordinates.
 */
export function isValidCorners(corners: Corners): boolean {
  if (corners.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    const c = corners[(i + 2) % 4]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-4) return false // three points collinear
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false // folded
  }
  return true
}

/** Replace one corner, clamped. Returns null when the result would not be a usable quad. */
export function withCorner(corners: Corners, index: number, x: number, y: number): Corners | null {
  const next = cloneCorners(corners)
  next[index] = {
    x: Math.min(CORNER_MAX, Math.max(CORNER_MIN, x)),
    y: Math.min(CORNER_MAX, Math.max(CORNER_MIN, y)),
  }
  return isValidCorners(next) ? next : null
}
