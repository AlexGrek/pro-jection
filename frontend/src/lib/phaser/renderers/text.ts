import Phaser from 'phaser'
import type { TextLayer } from '@/lib/scene'
import { DEFAULT_FONT_ID, FONT_CSS } from '@/lib/scene'
import { CANVAS_H, CANVAS_W, SELECTION_HEX, SELECTION_WIDTH } from '../constants'
import type { RenderCtx } from './types'

const TEXT_DRAG_MARGIN = 80

function fontCss(layer: TextLayer): string {
  return FONT_CSS[layer.font_family ?? DEFAULT_FONT_ID] ?? FONT_CSS[DEFAULT_FONT_ID]
}

export function applyText(ctx: RenderCtx, layer: TextLayer): void {
  const px = layer.x * CANVAS_W
  const py = layer.y * CANVAS_H
  const existing = ctx.gameObjects.get(layer.id)

  if (existing instanceof Phaser.GameObjects.Text) {
    existing.setText(layer.text)
    existing.setPosition(px, py)
    existing.setFontSize(layer.font_size)
    existing.setColor(layer.color)
    existing.setFontFamily(fontCss(layer))
    existing.setAlpha(layer.opacity ?? 1)
    return
  }

  if (existing) ctx.destroyGameObject(layer.id)

  const t = ctx.add
    .text(px, py, layer.text, {
      fontFamily: fontCss(layer),
      fontSize: `${layer.font_size}px`,
      color: layer.color,
      wordWrap: { width: CANVAS_W - 160 },
      align: 'center',
    })
    .setOrigin(0.5)
    .setAlpha(layer.opacity ?? 1)

  ctx.gameObjects.set(layer.id, t)

  if (ctx.editable) {
    ctx.attachInteractive(t, layer.id, { draggable: true, margin: TEXT_DRAG_MARGIN })
    if (ctx.selectedId === layer.id) setStroke(t, true)
  }
}

export function refreshTextSelection(ctx: RenderCtx, id: string): void {
  const go = ctx.gameObjects.get(id)
  if (go instanceof Phaser.GameObjects.Text) {
    setStroke(go, ctx.selectedId === id)
  }
}

function setStroke(t: Phaser.GameObjects.Text, selected: boolean): void {
  if (selected) t.setStroke(SELECTION_HEX, SELECTION_WIDTH)
  else t.setStroke('#000000', 0)
}
