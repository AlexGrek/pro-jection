import type Phaser from 'phaser'
import type { GridType } from '@/lib/scene'
import { CANVAS_H, CANVAS_W, GRID_CELL, GRID_COLOR } from '../constants'

const LINE_WIDTH = 2
const LINE_ALPHA = 0.35
const ACCENT_ALPHA = 0.6
const DOT_RADIUS = 3

/**
 * Draw the grid `type` into a (pre-cleared) Graphics object spanning the 1920×1080
 * canvas. Pure: it never touches scene state, so it works identically on the
 * controller and the projector.
 */
export function drawGrid(g: Phaser.GameObjects.Graphics, type: GridType): void {
  g.clear()
  switch (type) {
    case 'lines':
      drawLines(g, true, true)
      break
    case 'columns':
      drawLines(g, true, false)
      break
    case 'dots':
      drawDots(g)
      break
    case 'thirds':
      drawThirds(g)
      break
  }
}

function drawLines(g: Phaser.GameObjects.Graphics, vertical: boolean, horizontal: boolean): void {
  g.lineStyle(LINE_WIDTH, GRID_COLOR, LINE_ALPHA)
  if (vertical) {
    for (let x = GRID_CELL; x < CANVAS_W; x += GRID_CELL) {
      g.lineBetween(x, 0, x, CANVAS_H)
    }
  }
  if (horizontal) {
    for (let y = GRID_CELL; y < CANVAS_H; y += GRID_CELL) {
      g.lineBetween(0, y, CANVAS_W, y)
    }
  }
}

function drawDots(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(GRID_COLOR, ACCENT_ALPHA)
  for (let x = GRID_CELL; x < CANVAS_W; x += GRID_CELL) {
    for (let y = GRID_CELL; y < CANVAS_H; y += GRID_CELL) {
      g.fillCircle(x, y, DOT_RADIUS)
    }
  }
}

function drawThirds(g: Phaser.GameObjects.Graphics): void {
  g.lineStyle(LINE_WIDTH, GRID_COLOR, ACCENT_ALPHA)
  for (let i = 1; i < 3; i++) {
    const x = (CANVAS_W / 3) * i
    const y = (CANVAS_H / 3) * i
    g.lineBetween(x, 0, x, CANVAS_H)
    g.lineBetween(0, y, CANVAS_W, y)
  }
}
