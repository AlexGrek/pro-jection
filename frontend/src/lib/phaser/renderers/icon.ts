import Phaser from 'phaser'
import type { IconLayer } from '@/lib/scene'
import { CANVAS_W, CANVAS_H, ICON_TEXTURE_PREFIX } from '../constants'
import { findIconDef } from '@/lib/icons'
import type { RenderCtx } from './types'

const ICON_CANVAS_SIZE = 256

export function applyIcon(ctx: RenderCtx, layer: IconLayer): void {
  const px = layer.x * CANVAS_W
  const py = layer.y * CANVAS_H
  const sizePx = Math.max(1, layer.size * CANVAS_W)
  const texKey = `${ICON_TEXTURE_PREFIX}${layer.id}`

  const result = findIconDef(layer.icon_id)
  if (!result) return
  const { pack, def } = result

  if (ctx.textures.exists(texKey)) ctx.textures.remove(texKey)
  const canvasTex = ctx.textures.createCanvas(
    texKey,
    ICON_CANVAS_SIZE,
    ICON_CANVAS_SIZE,
  ) as Phaser.Textures.CanvasTexture
  const c = canvasTex.getContext()
  if (!c) return

  const scale = ICON_CANVAS_SIZE / pack.viewBox
  c.clearRect(0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE)
  c.save()
  c.scale(scale, scale)
  c.strokeStyle = layer.color
  c.fillStyle = layer.color
  c.lineWidth = layer.stroke_width
  c.lineCap = 'round'
  c.lineJoin = 'round'
  for (const p of def.paths) {
    const path = new Path2D(p.d)
    if (p.fill) c.fill(path)
    else c.stroke(path)
  }
  c.restore()
  canvasTex.refresh()

  const existing = ctx.gameObjects.get(layer.id)
  if (existing instanceof Phaser.GameObjects.Image) {
    existing
      .setTexture(texKey)
      .setPosition(px, py)
      .setAlpha(layer.opacity ?? 1)
      .setDisplaySize(sizePx, sizePx)
  } else {
    if (existing) ctx.destroyGameObject(layer.id)
    const img = ctx.add
      .image(px, py, texKey)
      .setOrigin(0.5)
      .setAlpha(layer.opacity ?? 1)
      .setDisplaySize(sizePx, sizePx)
    ctx.gameObjects.set(layer.id, img)
    if (ctx.editable) ctx.attachInteractive(img, layer.id)
  }
}
