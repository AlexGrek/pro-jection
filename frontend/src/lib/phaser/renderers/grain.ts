import Phaser from 'phaser'
import type { GrainLayer } from '@/lib/scene'
import { CANVAS_W, CANVAS_H, GRAIN_TEXTURE_PREFIX } from '../constants'
import type { RenderCtx } from './types'

/** Deterministic PRNG (mulberry32) — same seed always yields the same sequence, so
 *  every client renders an identical pattern from the same scene blob. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function textureSize(layer: GrainLayer): [number, number] {
  if (layer.fullscreen) return [CANVAS_W, CANVAS_H]
  return [Math.max(4, Math.round(layer.width * CANVAS_W)), Math.max(4, Math.round(layer.height * CANVAS_H))]
}

function drawGrain(c: CanvasRenderingContext2D, layer: GrainLayer, tw: number, th: number): void {
  c.clearRect(0, 0, tw, th)
  const rand = mulberry32(layer.seed)
  const palette = layer.colors.length > 0 ? layer.colors : ['#ffffff']
  const dotRadius = Math.max(0.5, layer.size * 0.5)
  const lineHalf = Math.max(0.5, layer.size * 0.5)
  const lineWidth = Math.max(0.5, layer.line_width)

  for (let i = 0; i < layer.count; i++) {
    const cx = rand() * tw
    const cy = rand() * th
    const color = palette[Math.floor(rand() * palette.length)]

    if (layer.shape === 'dot') {
      c.fillStyle = color
      c.beginPath()
      c.arc(cx, cy, dotRadius, 0, Math.PI * 2)
      c.fill()
    } else {
      const angle = rand() * Math.PI * 2
      const dx = Math.cos(angle) * lineHalf
      const dy = Math.sin(angle) * lineHalf
      c.strokeStyle = color
      c.lineWidth = lineWidth
      c.beginPath()
      c.moveTo(cx - dx, cy - dy)
      c.lineTo(cx + dx, cy + dy)
      c.stroke()
    }
  }
}

export function applyGrain(ctx: RenderCtx, layer: GrainLayer): void {
  const key = `${GRAIN_TEXTURE_PREFIX}${layer.id}`
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

  let canvasTex: Phaser.Textures.CanvasTexture
  if (needCreate) {
    if (ctx.textures.exists(key)) ctx.textures.remove(key)
    canvasTex = ctx.textures.createCanvas(key, tw, th) as Phaser.Textures.CanvasTexture
  } else {
    canvasTex = ctx.textures.get(key) as Phaser.Textures.CanvasTexture
  }

  const c2d = canvasTex.getContext()
  if (c2d) drawGrain(c2d, layer, tw, th)
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
