import type Phaser from 'phaser'
import { CANVAS_H, CANVAS_W, GRID_CELL } from '../constants'

const CELL = GRID_CELL * 2 // 240 px — 8×4.5 cells, coarse enough to read from a distance

/** Maps a unit-square point (0–1) to canvas pixels. */
export type Project = (u: number, v: number) => { x: number; y: number }

/** Straight through to the canvas box — used when the canvas itself carries the warp. */
export const identityProject: Project = (u, v) => ({ x: u * CANVAS_W, y: v * CANVAS_H })

/**
 * Alignment grid for keystone calibration, drawn while `ProjectionSettings.editing`
 * is on. Unlike the user-facing grid overlay this is deliberately loud, and it is
 * drawn on *every* client: it is the projection quad plus a regular grid and both
 * diagonals, so you can read the distortion straight off the projection surface —
 * bowed lines or a centre cross that misses mean the corners are still wrong.
 *
 * `project` decides where the quad lands. The projector (and the controller's
 * projected preview) warps the whole canvas in CSS and passes `identityProject`,
 * because warping the geometry too would double up. The controller's flat preview
 * leaves the canvas untransformed and passes the homography instead, so the grid
 * still bends to the quad while pointer coordinates stay valid for dragging.
 *
 * A projective map takes straight lines to straight lines, so mapping the two
 * endpoints of each line is exact — no subdivision needed.
 *
 * `color` is the operator's pick from the calibration palette, resolved to an int.
 * White is kept for the border and diagonals regardless: those are the structural
 * reference and want maximum contrast whatever the grid colour is.
 *
 * Pure: draws into a pre-existing Graphics, touching no scene state, so controller
 * and projector produce identical output for the same inputs.
 */
export function drawCalibrationGrid(
  g: Phaser.GameObjects.Graphics,
  color: number,
  project: Project = identityProject,
): void {
  g.clear()

  const line = (u1: number, v1: number, u2: number, v2: number) => {
    const a = project(u1, v1)
    const b = project(u2, v2)
    g.lineBetween(a.x, a.y, b.x, b.y)
  }

  // Interior grid.
  g.lineStyle(3, color, 0.45)
  for (let x = CELL; x < CANVAS_W; x += CELL) {
    const u = x / CANVAS_W
    line(u, 0, u, 1)
  }
  for (let y = CELL; y < CANVAS_H; y += CELL) {
    const v = y / CANVAS_H
    line(0, v, 1, v)
  }

  // Diagonals — their crossing marks the true centre of the projected quad.
  g.lineStyle(3, 0xffffff, 0.4)
  line(0, 0, 1, 1)
  line(1, 0, 0, 1)

  // Quad border, inset slightly so the whole stroke stays inside the canvas.
  const inset = 4 / CANVAS_W
  const insetV = 4 / CANVAS_H
  g.lineStyle(8, 0xffffff, 0.9)
  line(inset, insetV, 1 - inset, insetV)
  line(1 - inset, insetV, 1 - inset, 1 - insetV)
  line(1 - inset, 1 - insetV, inset, 1 - insetV)
  line(inset, 1 - insetV, inset, insetV)

  // Corner brackets, so each corner reads unambiguously even at a shallow angle.
  const armU = 120 / CANVAS_W
  const armV = 120 / CANVAS_H
  g.lineStyle(10, color, 1)
  const corners: [number, number, number, number][] = [
    [0, 0, 1, 1],
    [1, 0, -1, 1],
    [1, 1, -1, -1],
    [0, 1, 1, -1],
  ]
  for (const [cu, cv, su, sv] of corners) {
    const u = cu + inset * su
    const v = cv + insetV * sv
    line(u, v, u + armU * su, v)
    line(u, v, u, v + armV * sv)
  }
}
