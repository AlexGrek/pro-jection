import Phaser from 'phaser'
import type { ShapeLayer } from '@/lib/scene'
import { CANVAS_H, CANVAS_W, SELECTION_INT, SELECTION_WIDTH } from '../constants'
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

  applyStyle(ctx, s, layer)
}

export function refreshShapeSelection(ctx: RenderCtx, layer: ShapeLayer): void {
  const go = ctx.gameObjects.get(layer.id)
  if (go instanceof Phaser.GameObjects.Rectangle || go instanceof Phaser.GameObjects.Ellipse) {
    applyStyle(ctx, go, layer)
  }
}

function applyStyle(ctx: RenderCtx, s: ShapeGO, layer: ShapeLayer): void {
  const colorInt = hexToInt(layer.color)
  const isSelected = ctx.editable && ctx.selectedId === layer.id

  if (layer.filled) s.setFillStyle(colorInt)
  else s.setFillStyle()

  if (isSelected) {
    s.setStrokeStyle(SELECTION_WIDTH, SELECTION_INT)
  } else if (!layer.filled) {
    s.setStrokeStyle(layer.stroke_width, colorInt)
  } else {
    s.setStrokeStyle()
  }
}
