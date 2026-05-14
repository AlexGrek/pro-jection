import Phaser from 'phaser'
import type { ImageLayer } from '@/lib/scene'
import { CANVAS_W, CANVAS_H, IMAGE_TEXTURE_PREFIX } from '../constants'
import type { RenderCtx } from './types'

// Track which URL is currently displayed per layer ID (or being loaded)
const displayedUrls = new Map<string, string>()
// Natural aspect ratio (width / height) per layer ID, filled on load
const aspects = new Map<string, number>()

/** Called by ProjectionScene.destroyGameObject to clean up module-level state. */
export function cleanupImage(id: string): void {
  displayedUrls.delete(id)
  aspects.delete(id)
}

function displaySize(layer: ImageLayer): [number, number] {
  const w = Math.max(1, layer.width * CANVAS_W)
  const aspect = aspects.get(layer.id) ?? 1
  return [w, w / aspect]
}

export function applyImage(ctx: RenderCtx, layer: ImageLayer): void {
  const px = layer.x * CANVAS_W
  const py = layer.y * CANVAS_H
  const texKey = `${IMAGE_TEXTURE_PREFIX}${layer.id}`

  if (!layer.url) {
    const w = Math.max(1, layer.width * CANVAS_W)
    const h = w * 0.5625
    const existing = ctx.gameObjects.get(layer.id)
    if (existing instanceof Phaser.GameObjects.Rectangle) {
      existing.setPosition(px, py).setSize(w, h).setAlpha(layer.opacity)
    } else {
      if (existing) ctx.destroyGameObject(layer.id)
      const rect = ctx.add
        .rectangle(px, py, w, h, 0x1e293b)
        .setStrokeStyle(2, 0x334155)
        .setAlpha(layer.opacity)
      ctx.gameObjects.set(layer.id, rect)
      if (ctx.editable) ctx.attachInteractive(rect, layer.id)
    }
    return
  }

  const prevUrl = displayedUrls.get(layer.id)

  if (prevUrl === layer.url) {
    // Same URL — just update transform if the Image is already live
    const existing = ctx.gameObjects.get(layer.id)
    if (existing instanceof Phaser.GameObjects.Image) {
      const [w, h] = displaySize(layer)
      existing.setPosition(px, py).setAlpha(layer.opacity).setDisplaySize(w, h)
    }
    return
  }

  // URL changed or first load — mark as pending and kick off async load
  displayedUrls.set(layer.id, layer.url)

  const layerId = layer.id
  const imgUrl = layer.url

  const img = new Image()
  img.crossOrigin = 'anonymous'

  img.onload = () => {
    // Bail if the layer was replaced or destroyed while we were loading
    if (displayedUrls.get(layerId) !== imgUrl) return

    const aspect = img.naturalWidth / (img.naturalHeight || 1) || 1
    aspects.set(layerId, aspect)

    const MAX_TEX = 2048
    const texW = Math.min(img.naturalWidth || 512, MAX_TEX)
    const texH = Math.min(img.naturalHeight || 512, MAX_TEX)

    // Recreate canvas texture so we get the right dimensions
    if (ctx.textures.exists(texKey)) ctx.textures.remove(texKey)
    const canvasTex = ctx.textures.createCanvas(
      texKey,
      texW,
      texH,
    ) as Phaser.Textures.CanvasTexture
    const c = canvasTex.getContext()
    c.clearRect(0, 0, texW, texH)
    c.drawImage(img, 0, 0, texW, texH)
    canvasTex.refresh()

    // Use the latest layer position from layerData (drag may have moved it)
    const currentLayer = ctx.layerData.get(layerId) as ImageLayer | undefined
    if (!currentLayer) return

    const cpx = currentLayer.x * CANVAS_W
    const cpy = currentLayer.y * CANVAS_H
    const cw = Math.max(1, currentLayer.width * CANVAS_W)
    const ch = cw / aspect

    const existing = ctx.gameObjects.get(layerId)
    if (existing instanceof Phaser.GameObjects.Image) {
      existing.setTexture(texKey).setPosition(cpx, cpy).setAlpha(currentLayer.opacity).setDisplaySize(cw, ch)
    } else {
      // Destroy the placeholder (e.g. Rectangle) without touching the texture
      if (existing) {
        existing.destroy()
        ctx.gameObjects.delete(layerId)
      }
      const go = ctx.add
        .image(cpx, cpy, texKey)
        .setOrigin(0.5)
        .setAlpha(currentLayer.opacity)
        .setDisplaySize(cw, ch)
      ctx.gameObjects.set(layerId, go)
      if (ctx.editable) ctx.attachInteractive(go, layerId)
    }
  }

  img.onerror = () => {
    // Clear the pending URL so the next applyImage call retries
    if (displayedUrls.get(layerId) === imgUrl) displayedUrls.delete(layerId)
  }

  img.src = imgUrl
}
