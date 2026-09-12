import Phaser from 'phaser'
import type { LinesLayer } from '@/lib/scene'
import { CANVAS_W, CANVAS_H, LINES_TEXTURE_PREFIX } from '../constants'
import type { RenderCtx } from './types'

function textureSize(layer: LinesLayer): [number, number] {
  if (layer.fullscreen) return [CANVAS_W, CANVAS_H]
  return [Math.max(4, Math.round(layer.width * CANVAS_W)), Math.max(4, Math.round(layer.height * CANVAS_H))]
}

function drawLines(c: CanvasRenderingContext2D, layer: LinesLayer, tw: number, th: number): void {
  c.clearRect(0, 0, tw, th)
  const cx = tw / 2
  const cy = th / 2
  
  c.save()
  c.translate(cx, cy)
  c.rotate(layer.angle * Math.PI / 180)
  
  c.strokeStyle = layer.color
  c.lineWidth = layer.line_width
  
  const diag = Math.sqrt(tw * tw + th * th)
  const halfDiag = diag / 2
  
  const spacing = Math.max(1, layer.spacing)
  
  c.beginPath()
  // Draw lines along the Y axis, spanning the X axis
  // To keep the center line perfectly centered, start from 0 and go outward
  for (let x = 0; x <= halfDiag; x += spacing) {
    c.moveTo(x, -halfDiag)
    c.lineTo(x, halfDiag)
    if (x > 0) {
      c.moveTo(-x, -halfDiag)
      c.lineTo(-x, halfDiag)
    }
  }
  c.stroke()
  c.restore()
}

export function applyLines(ctx: RenderCtx, layer: LinesLayer): void {
  const key = `${LINES_TEXTURE_PREFIX}${layer.id}`
  const [tw, th] = textureSize(layer)
  const px = layer.fullscreen ? CANVAS_W / 2 : layer.x * CANVAS_W
  const py = layer.fullscreen ? CANVAS_H / 2 : layer.y * CANVAS_H

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
  if (c2d) drawLines(c2d, layer, tw, th)
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
