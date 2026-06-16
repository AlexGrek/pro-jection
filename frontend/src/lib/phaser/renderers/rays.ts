import Phaser from 'phaser'
import type { RaysLayer } from '@/lib/scene'
import { CANVAS_W, CANVAS_H, RAYS_TEXTURE_PREFIX } from '../constants'
import type { RenderCtx } from './types'

function textureSize(layer: RaysLayer): [number, number] {
  if (layer.fullscreen) return [CANVAS_W, CANVAS_H]
  const cellPx = Math.max(4, Math.round(layer.cell_size * CANVAS_W))
  return [layer.columns * cellPx, layer.rows * cellPx]
}

function drawDots(c: CanvasRenderingContext2D, layer: RaysLayer, tw: number, th: number): void {
  c.clearRect(0, 0, tw, th)
  const cellW = tw / layer.columns
  const cellH = th / layer.rows
  const radius = Math.min(cellW, cellH) * layer.dot_size * 0.5
  c.fillStyle = layer.color
  for (let r = 0; r < layer.rows; r++) {
    for (let col = 0; col < layer.columns; col++) {
      const cx = (col + 0.5) * cellW
      const cy = (r + 0.5) * cellH
      c.beginPath()
      if (layer.shape === 'circle') {
        c.arc(cx, cy, Math.max(0.5, radius), 0, Math.PI * 2)
      } else {
        const half = Math.max(0.5, radius)
        c.rect(cx - half, cy - half, half * 2, half * 2)
      }
      c.fill()
    }
  }
}

export function applyRays(ctx: RenderCtx, layer: RaysLayer): void {
  const key = `${RAYS_TEXTURE_PREFIX}${layer.id}`
  const [tw, th] = textureSize(layer)
  const px = layer.fullscreen ? CANVAS_W / 2 : layer.x * CANVAS_W
  const py = layer.fullscreen ? CANVAS_H / 2 : layer.y * CANVAS_H

  const existing = ctx.gameObjects.get(layer.id)

  // Destroy if wrong type or texture dimensions changed.
  let needCreate = !existing || !(existing instanceof Phaser.GameObjects.Image)
  if (!needCreate && ctx.textures.exists(key)) {
    const src = ctx.textures.get(key).source[0]
    if (src.width !== tw || src.height !== th) needCreate = true
  } else if (!needCreate) {
    needCreate = true
  }

  if (needCreate && existing) ctx.destroyGameObject(layer.id)

  // Get or create the CanvasTexture at the correct size.
  let canvasTex: Phaser.Textures.CanvasTexture
  if (needCreate) {
    if (ctx.textures.exists(key)) ctx.textures.remove(key)
    canvasTex = ctx.textures.createCanvas(key, tw, th) as Phaser.Textures.CanvasTexture
  } else {
    canvasTex = ctx.textures.get(key) as Phaser.Textures.CanvasTexture
  }

  const c2d = canvasTex.getContext()
  if (c2d) drawDots(c2d, layer, tw, th)
  canvasTex.refresh()

  if (needCreate) {
    const img = ctx.add.image(px, py, key).setOrigin(0.5).setAlpha(layer.opacity)
    ctx.gameObjects.set(layer.id, img)
    if (ctx.editable) {
      ctx.attachInteractive(img, layer.id, { draggable: !layer.fullscreen })
    }
  } else {
    const img = existing as Phaser.GameObjects.Image
    img.setPosition(px, py).setAlpha(layer.opacity)
  }
}
