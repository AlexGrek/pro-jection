import Phaser from 'phaser'
import type { FillLayer } from '@/lib/scene'
import { CANVAS_H, CANVAS_W, FILL_TEXTURE_PREFIX } from '../constants'
import { paintFill } from '../fillTexture'
import type { RenderCtx } from './types'

export function applyFill(ctx: RenderCtx, layer: FillLayer): void {
  const key = `${FILL_TEXTURE_PREFIX}${layer.id}`
  const existing = ctx.gameObjects.get(layer.id)

  if (existing && !(existing instanceof Phaser.GameObjects.Image)) {
    ctx.destroyGameObject(layer.id)
  }

  let canvasTex: Phaser.Textures.CanvasTexture
  if (ctx.textures.exists(key)) {
    canvasTex = ctx.textures.get(key) as Phaser.Textures.CanvasTexture
  } else {
    canvasTex = ctx.textures.createCanvas(key, CANVAS_W, CANVAS_H) as Phaser.Textures.CanvasTexture
  }
  const c = canvasTex.getContext()
  if (c) paintFill(c, layer)
  canvasTex.refresh()

  let img = ctx.gameObjects.get(layer.id) as Phaser.GameObjects.Image | undefined
  if (!img) {
    img = ctx.add.image(CANVAS_W / 2, CANVAS_H / 2, key).setOrigin(0.5)
    ctx.gameObjects.set(layer.id, img)
    if (ctx.editable) {
      // Selection-only: full-canvas backgrounds shouldn't be draggable.
      ctx.attachInteractive(img, layer.id, { draggable: false })
    }
  }
  img.setAlpha(layer.opacity ?? 1)
}
