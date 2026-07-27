import type Phaser from 'phaser'
import { CANVAS_H, CANVAS_W, GRID_CELL } from '../constants'

const CELL = GRID_CELL * 2 // 240 px — 8×4.5 cells, coarse enough to read from a distance

/**
 * Alignment grid for keystone calibration, drawn while `ProjectionSettings.editing`
 * is on. Unlike the user-facing grid overlay this is deliberately loud, and it is
 * drawn on *every* client: it is the whole canvas rect plus a regular grid and both
 * diagonals, so once the canvas is warped you can read the distortion straight off
 * the projection surface — straight lines that bow or a centre cross that misses
 * mean the corners are still wrong.
 *
 * `color` is the operator's pick from the calibration palette, resolved to an int —
 * whichever reads best against the surface being projected onto. White is kept for
 * the border and diagonals regardless: those are the structural reference and want
 * maximum contrast no matter what the grid colour is.
 *
 * Pure: draws into a pre-existing Graphics in 1920×1080 canvas space, touching no
 * scene state, so controller and projector produce identical output.
 */
export function drawCalibrationGrid(g: Phaser.GameObjects.Graphics, color: number): void {
  g.clear()

  // Interior grid.
  g.lineStyle(3, color, 0.45)
  for (let x = CELL; x < CANVAS_W; x += CELL) g.lineBetween(x, 0, x, CANVAS_H)
  for (let y = CELL; y < CANVAS_H; y += CELL) g.lineBetween(0, y, CANVAS_W, y)

  // Diagonals — their crossing marks the true centre of the projected quad.
  g.lineStyle(3, 0xffffff, 0.4)
  g.lineBetween(0, 0, CANVAS_W, CANVAS_H)
  g.lineBetween(CANVAS_W, 0, 0, CANVAS_H)

  // Canvas border, inset by half its own width so the whole stroke stays visible.
  g.lineStyle(8, 0xffffff, 0.9)
  g.strokeRect(4, 4, CANVAS_W - 8, CANVAS_H - 8)

  // Corner brackets, so each corner reads unambiguously even at a shallow angle.
  const arm = 120
  g.lineStyle(10, color, 1)
  const corners: [number, number, number, number][] = [
    [0, 0, 1, 1],
    [CANVAS_W, 0, -1, 1],
    [CANVAS_W, CANVAS_H, -1, -1],
    [0, CANVAS_H, 1, -1],
  ]
  for (const [cx, cy, sx, sy] of corners) {
    const x = cx + 6 * sx
    const y = cy + 6 * sy
    g.lineBetween(x, y, x + arm * sx, y)
    g.lineBetween(x, y, x, y + arm * sy)
  }
}
