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
  
  const count = Math.max(1, layer.count)
  
  // For triangles, to keep the spacing equal on all three sides (true concentricity),
  // we must align the incenters of all scaled triangles.
  let outerIncenterOffset = 0
  if (layer.shape === 'triangle') {
    const wOuter = tw - layer.stroke_width
    const hOuter = th - layer.stroke_width
    if (wOuter > 0 && hOuter > 0) {
      const L = Math.sqrt((wOuter / 2) ** 2 + hOuter ** 2)
      const rOuter = (wOuter * hOuter) / (wOuter + 2 * L)
      outerIncenterOffset = hOuter / 2 - rOuter
    }
  }

  for (let i = 0; i < count; i++) {
    const scale = (count - i) / count
    const w = tw * scale - layer.stroke_width
    const h = th * scale - layer.stroke_width
    if (w <= 0 || h <= 0) continue

    let cy_inner = cy
    if (layer.shape === 'triangle') {
      const L = Math.sqrt((w / 2) ** 2 + h ** 2)
      const r_inner = (w * h) / (w + 2 * L)
      const innerIncenterOffset = h / 2 - r_inner
      // Shift so that this triangle's incenter matches the outer triangle's incenter
      cy_inner = cy + outerIncenterOffset - innerIncenterOffset
    }

    c.beginPath()
    if (layer.shape === 'circle') {
      const radius = Math.min(w, h) / 2
      c.arc(cx, cy, Math.max(0.5, radius), 0, Math.PI * 2)
    } else if (layer.shape === 'square') {
      c.rect(cx - w / 2, cy - h / 2, w, h)
    } else if (layer.shape === 'triangle') {
      c.moveTo(cx, cy_inner - h / 2)
      c.lineTo(cx + w / 2, cy_inner + h / 2)
      c.lineTo(cx - w / 2, cy_inner + h / 2)
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
