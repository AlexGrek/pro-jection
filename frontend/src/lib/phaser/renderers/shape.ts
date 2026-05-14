import Phaser from 'phaser'
import type { ShapeLayer } from '@/lib/scene'
import { CANVAS_H, CANVAS_W } from '../constants'
import { hexToInt } from '../colors'
import type { RenderCtx } from './types'

type ShapeGO = Phaser.GameObjects.Rectangle | Phaser.GameObjects.Ellipse

export function applyShape(ctx: RenderCtx, layer: ShapeLayer): void {
  const px = layer.x * CANVAS_W
  const py = layer.y * CANVAS_H
  const w = Math.max(1, layer.width * CANVAS_W)
  const h = Math.max(1, layer.height * CANVAS_H)
  const existing = ctx.gameObjects.get(layer.id)

  const wantEllipse = layer.shape === 'circle'
  const matches =
    (wantEllipse && existing instanceof Phaser.GameObjects.Ellipse) ||
    (!wantEllipse && existing instanceof Phaser.GameObjects.Rectangle)

  if (existing && !matches) ctx.destroyGameObject(layer.id)

  let s = ctx.gameObjects.get(layer.id) as ShapeGO | undefined

  if (s) {
    s.setPosition(px, py)
    s.setSize(w, h)
    s.setAlpha(layer.opacity ?? 1)
  } else {
    s = wantEllipse ? ctx.add.ellipse(px, py, w, h) : ctx.add.rectangle(px, py, w, h)
    s.setOrigin(0.5).setAlpha(layer.opacity ?? 1)
    ctx.gameObjects.set(layer.id, s)
    if (ctx.editable) ctx.attachInteractive(s, layer.id)
  }

  applyStyle(s, layer)
}

function applyStyle(s: ShapeGO, layer: ShapeLayer): void {
  const colorInt = hexToInt(layer.color)

  if (layer.filled) {
    s.setFillStyle(colorInt)
    s.setStrokeStyle()
  } else {
    s.setFillStyle()
    s.setStrokeStyle(layer.stroke_width, colorInt)
  }
}
