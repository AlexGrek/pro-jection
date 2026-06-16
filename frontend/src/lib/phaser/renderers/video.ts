import Phaser from 'phaser'
import type { VideoLayer } from '@/lib/scene'
import { CANVAS_W, CANVAS_H } from '../constants'
import type { RenderCtx } from './types'

// URL currently displayed (or loading) per layer ID.
const displayedUrls = new Map<string, string>()
// Natural aspect ratio (width / height) per layer ID, filled once metadata loads.
const aspects = new Map<string, number>()

const DEFAULT_ASPECT = 16 / 9

/** Called by ProjectionScene.destroyGameObject to clean up module-level state. */
export function cleanupVideo(id: string): void {
  displayedUrls.delete(id)
  aspects.delete(id)
}

function displaySize(layer: VideoLayer): [number, number] {
  const w = Math.max(1, layer.width * CANVAS_W)
  const aspect = aspects.get(layer.id) ?? DEFAULT_ASPECT
  return [w, w / aspect]
}

export function applyVideo(ctx: RenderCtx, layer: VideoLayer): void {
  const px = layer.x * CANVAS_W
  const py = layer.y * CANVAS_H

  // No source yet — show the same dark placeholder the image renderer uses.
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
  const existing = ctx.gameObjects.get(layer.id)

  // Same source already live — just sync transform and playback flags.
  if (prevUrl === layer.url && existing instanceof Phaser.GameObjects.Video) {
    const [w, h] = displaySize(layer)
    existing.setPosition(px, py).setAlpha(layer.opacity).setDisplaySize(w, h)
    existing.setMute(layer.muted)
    existing.setLoop(layer.loop)
    return
  }

  // Source changed or first load — drop any placeholder / stale video and reload.
  displayedUrls.set(layer.id, layer.url)
  if (existing) {
    existing.destroy()
    ctx.gameObjects.delete(layer.id)
  }

  // Hidden until the texture exists so Phaser's default frame doesn't flash.
  const video = ctx.add.video(px, py).setOrigin(0.5).setAlpha(layer.opacity).setVisible(false)
  video.setMute(layer.muted)
  video.setLoop(layer.loop)
  ctx.gameObjects.set(layer.id, video)
  if (ctx.editable) ctx.attachInteractive(video, layer.id)

  // Once the metadata arrives we know the true aspect ratio — size, reveal, play.
  video.on('created', () => {
    if (displayedUrls.get(layer.id) !== layer.url) return
    const current = ctx.layerData.get(layer.id) as VideoLayer | undefined
    if (!current) return
    const vw = video.width || 16
    const vh = video.height || 9
    aspects.set(layer.id, vw / vh)
    const cw = Math.max(1, current.width * CANVAS_W)
    video
      .setDisplaySize(cw, cw / (vw / vh))
      .setPosition(current.x * CANVAS_W, current.y * CANVAS_H)
      .setAlpha(current.opacity)
      .setVisible(true)
    video.play(current.loop)
  })

  // `noAudio = muted` lets browsers autoplay without a user gesture.
  video.loadURL(layer.url, layer.muted)
  video.play(layer.loop)
}
