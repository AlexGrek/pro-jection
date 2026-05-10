import type { FillLayer } from '@/lib/scene'
import { CANVAS_H, CANVAS_W } from './constants'
import { stopToRgba } from './colors'

/**
 * Paints a fill layer (solid or linear gradient) into a 2D canvas context spanning
 * the full 1920×1080 projection canvas. Uses HTML5 Canvas's gradient APIs directly
 * because Phaser's built-in gradient support is limited to 4-corner colors and
 * doesn't accept multi-stop gradients with rgba.
 */
export function paintFill(ctx: CanvasRenderingContext2D, layer: FillLayer): void {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

  if (layer.fill === 'solid' || layer.stops.length < 2) {
    ctx.fillStyle = layer.stops[0] ? stopToRgba(layer.stops[0]) : 'rgba(0,0,0,0)'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    return
  }

  // CSS angle convention: 0deg = bottom→top, 90deg = left→right, 180deg = top→bottom.
  // Math direction (canvas y+ is down) = (cos(rad), sin(rad)) with rad = (cssAngle - 90)°.
  const rad = ((layer.angle - 90) * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  const cx = CANVAS_W / 2
  const cy = CANVAS_H / 2
  // L1-projection of the half-canvas onto the gradient axis = farthest corner.
  const proj = Math.abs(dx) * (CANVAS_W / 2) + Math.abs(dy) * (CANVAS_H / 2)

  const grad = ctx.createLinearGradient(
    cx - dx * proj,
    cy - dy * proj,
    cx + dx * proj,
    cy + dy * proj,
  )
  for (const s of layer.stops) {
    grad.addColorStop(Math.max(0, Math.min(1, s.offset)), stopToRgba(s))
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
}
