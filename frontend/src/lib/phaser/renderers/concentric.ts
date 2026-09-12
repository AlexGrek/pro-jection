import Phaser from 'phaser'
import type { ConcentricLayer } from '@/lib/scene'
import { CANVAS_W, CANVAS_H, CONCENTRIC_TEXTURE_PREFIX } from '../constants'
import type { RenderCtx } from './types'

function textureSize(layer: ConcentricLayer): [number, number] {
  return [Math.max(4, Math.round(layer.width * CANVAS_W)), Math.max(4, Math.round(layer.height * CANVAS_H))]
}

function drawConcentric(c: CanvasRenderingContext2D, layer: ConcentricLayer, tw: number, th: number): void {
  c.clearRect(0, 0, tw, th)
  const cx = tw / 2
  const cy = th / 2
  
  c.strokeStyle = layer.color
  c.lineWidth = layer.stroke_width
  // Phaser canvas textures might scale, but we'll draw centered.
  
  const count = Math.max(1, layer.count)
  
  for (let i = 0; i < count; i++) {
    // scale from 1 (outermost) down to 1/count (innermost)
    const scale = (count - i) / count
    const w = tw * scale - layer.stroke_width
    const h = th * scale - layer.stroke_width
    if (w <= 0 || h <= 0) continue

    c.beginPath()
    if (layer.shape === 'circle') {
      const radius = Math.min(w, h) / 2
      c.arc(cx, cy, Math.max(0.5, radius), 0, Math.PI * 2)
    } else if (layer.shape === 'square') {
      c.rect(cx - w / 2, cy - h / 2, w, h)
    } else if (layer.shape === 'triangle') {
      c.moveTo(cx, cy - h / 2)
      c.lineTo(cx + w / 2, cy + h / 2)
      c.lineTo(cx - w / 2, cy + h / 2)
      c.closePath()
    }
    c.stroke()
  }
}

export function applyConcentric(ctx: RenderCtx, layer: ConcentricLayer): void {
  const key = `${CONCENTRIC_TEXTURE_PREFIX}${layer.id}`
  const [tw, th] = textureSize(layer)
  const px = layer.x * CANVAS_W
  const py = layer.y * CANVAS_H

  const existing = ctx.gameObjects.get(layer.id)

  let needCreate = !existing || !(existing instanceof Phaser.GameObjects.Image)
  if (!needCreate && ctx.textures.exists(key)) {
    const src = ctx.textures.get(key).source[0]
    if (src.width !== tw || src.height !== th) needCreate = true
  } else if (!needCreate) {
    needCreate = true
  }

  if (needCreate && existing) ctx.destroyGameObject(layer.id)

  let canvasTex: Phaser.Textures.CanvasTexture
  if (needCreate) {
    if (ctx.textures.exists(key)) ctx.textures.remove(key)
    canvasTex = ctx.textures.createCanvas(key, tw, th) as Phaser.Textures.CanvasTexture
  } else {
    canvasTex = ctx.textures.get(key) as Phaser.Textures.CanvasTexture
  }

  const c2d = canvasTex.getContext()
  if (c2d) drawConcentric(c2d, layer, tw, th)
  canvasTex.refresh()

  if (needCreate) {
    const img = ctx.add.image(px, py, key).setOrigin(0.5).setAlpha(layer.opacity)
    ctx.gameObjects.set(layer.id, img)
    if (ctx.editable) {
      ctx.attachInteractive(img, layer.id)
    }
  } else {
    const img = existing as Phaser.GameObjects.Image
    img.setPosition(px, py).setAlpha(layer.opacity)
  }
}
