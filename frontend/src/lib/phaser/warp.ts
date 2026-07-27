import type { Corners } from '@/lib/scene'

/**
 * Projective (keystone) warp of the canvas element.
 *
 * Phaser 4 has no Mesh/Plane game object, so there is no in-engine quad warp.
 * Instead we hand the whole canvas to the browser compositor with a CSS
 * `matrix3d`, which is GPU-accelerated and behaves identically on the controller
 * and the projector. Pure: no Phaser or DOM access, so it is trivially testable.
 */

/**
 * CSS `matrix3d(…)` mapping the canvas box (`w` × `h` CSS px, origin top-left)
 * onto the quad described by `corners` (normalised 0–1 canvas coordinates).
 *
 * The element must carry `transform-origin: 0 0`. Returns `'none'` for a
 * degenerate quad so the caller can just assign the result unconditionally.
 */
/**
 * Format a matrix term for CSS. `String(v)` switches to exponent notation below
 * 1e-6 — and the perspective terms land there for small warps (a one-pixel corner
 * nudge gives ~5e-7). Fixed notation keeps the declaration unambiguously parseable;
 * 12 decimals is far finer than a pixel once multiplied back up by the canvas size.
 */
const fmt = (v: number): string => v.toFixed(12).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')

/** Tolerance for the near-degenerate tests below, in canvas pixels. */
const EPS = 1e-9

export function cornersToMatrix3d(corners: Corners, w: number, h: number): string {
  if (w <= 0 || h <= 0) return 'none'

  const [p0, p1, p2, p3] = corners
  const x0 = p0.x * w, y0 = p0.y * h
  const x1 = p1.x * w, y1 = p1.y * h
  const x2 = p2.x * w, y2 = p2.y * h
  const x3 = p3.x * w, y3 = p3.y * h

  // Heckbert's square-to-quad solution for the unit square (0,0) (1,0) (1,1) (0,1).
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3

  let a: number, b: number, d: number, e: number, g: number, k: number
  const c = x0
  const f = y0

  if (Math.abs(dx3) < EPS && Math.abs(dy3) < EPS) {
    // Parallelogram — affine, no perspective term.
    a = x1 - x0; b = x2 - x1
    d = y1 - y0; e = y2 - y1
    g = 0; k = 0
  } else {
    const den = dx1 * dy2 - dy1 * dx2
    if (Math.abs(den) < EPS) return 'none'
    g = (dx3 * dy2 - dy3 * dx2) / den
    k = (dx1 * dy3 - dy1 * dx3) / den
    a = x1 - x0 + g * x1
    b = x3 - x0 + k * x3
    d = y1 - y0 + g * y1
    e = y3 - y0 + k * y3
  }

  // The homogeneous divisor at the four source corners is 1, 1+g, 1+g+k, 1+k.
  // If any is non-positive that corner sits behind the projection plane and the
  // browser clips — or drops — the element even though the matrix is finite.
  if (1 + g <= EPS || 1 + k <= EPS || 1 + g + k <= EPS) return 'none'

  // Compose with diag(1/w, 1/h, 1) so the source is the canvas box in px rather
  // than the unit square.
  const m = [a / w, b / h, c, d / w, e / h, f, g / w, k / h]
  if (m.some((v) => !Number.isFinite(v))) return 'none'
  const [A, B, C, D, E, F, G, K] = m.map(fmt)

  // matrix3d is column-major: x-column, y-column, z-column, translation.
  // The 4th component of the x/y columns carries the perspective divisor.
  return `matrix3d(${A},${D},0,${G},${B},${E},0,${K},0,0,1,0,${C},${F},0,1)`
}
