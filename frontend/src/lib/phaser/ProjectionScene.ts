import Phaser from 'phaser'
import type { Layer, Scene, TextLayer } from '@/lib/scene'
import { DEFAULT_FONT_ID, FONT_CSS } from '@/lib/scene'

export { type Layer, type Scene } from '@/lib/scene'

export const CANVAS_W = 1920
export const CANVAS_H = 1080
const HINT_FONT = '"Outfit Variable", "Outfit", system-ui, sans-serif'

function fontCss(layer: TextLayer): string {
  return FONT_CSS[layer.font_family ?? DEFAULT_FONT_ID] ?? FONT_CSS[DEFAULT_FONT_ID]
}

export class ProjectionScene extends Phaser.Scene {
  editable = false
  onPositionChange?: (id: string, x: number, y: number) => void
  onObjectSelect?: (id: string) => void
  onSceneReady?: (scene: ProjectionScene) => void

  private gameObjects = new Map<string, Phaser.GameObjects.Text>()
  private layerData = new Map<string, Layer>()
  private selectedId: string | null = null
  private hint?: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'ProjectionScene' })
  }

  create() {
    if (this.editable) {
      this.hint = this.add
        .text(CANVAS_W / 2, CANVAS_H / 2, 'Add objects in the panel below', {
          fontFamily: HINT_FONT,
          fontSize: '48px',
          color: '#1e293b',
          align: 'center',
        })
        .setOrigin(0.5)
    }
    this.onSceneReady?.(this)
  }

  applyScene(scene: Scene) {
    const newIds = new Set(scene.objects.map((l) => l.id))

    for (const [id, go] of this.gameObjects) {
      if (!newIds.has(id)) {
        go.destroy()
        this.gameObjects.delete(id)
        this.layerData.delete(id)
      }
    }

    scene.objects.forEach((layer, i) => {
      this._applyLayer(layer)
      const go = this.gameObjects.get(layer.id)
      if (go) go.setDepth(i)
    })

    if (this.hint) {
      this.hint.setVisible(scene.objects.length === 0)
    }
  }

  private _applyLayer(layer: Layer) {
    this.layerData.set(layer.id, { ...layer })
    if (layer.type === 'text') {
      this._applyTextLayer(layer)
    }
  }

  private _applyTextLayer(layer: TextLayer) {
    const px = layer.x * CANVAS_W
    const py = layer.y * CANVAS_H
    const existing = this.gameObjects.get(layer.id)

    if (existing) {
      existing.setText(layer.text)
      existing.setPosition(px, py)
      existing.setFontSize(layer.font_size)
      existing.setColor(layer.color)
      existing.setFontFamily(fontCss(layer))
      existing.setAlpha(layer.opacity ?? 1)
    } else {
      const t = this.add
        .text(px, py, layer.text, {
          fontFamily: fontCss(layer),
          fontSize: `${layer.font_size}px`,
          color: layer.color,
          wordWrap: { width: CANVAS_W - 160 },
          align: 'center',
        })
        .setOrigin(0.5)
        .setAlpha(layer.opacity ?? 1)

      this.gameObjects.set(layer.id, t)

      if (this.editable) {
        const id = layer.id
        t.setInteractive({ draggable: true, cursor: 'move' })

        t.on('drag', (_: Phaser.Input.Pointer, dragX: number, dragY: number) => {
          t.setPosition(
            Phaser.Math.Clamp(dragX, 80, CANVAS_W - 80),
            Phaser.Math.Clamp(dragY, 80, CANVAS_H - 80),
          )
        })

        t.on('dragend', () => {
          const nx = t.x / CANVAS_W
          const ny = t.y / CANVAS_H
          const d = this.layerData.get(id)
          if (d) this.layerData.set(id, { ...d, x: nx, y: ny })
          this.onPositionChange?.(id, nx, ny)
        })

        t.on('pointerdown', () => {
          this._selectById(id)
          this.onObjectSelect?.(id)
        })
      }

      if (this.editable && this.selectedId === layer.id) {
        this._applyStroke(t, true)
      }
    }
  }

  selectObject(id: string | null) {
    this._selectById(id)
  }

  private _selectById(id: string | null) {
    if (this.selectedId === id) return
    if (this.selectedId) {
      const prev = this.gameObjects.get(this.selectedId)
      if (prev) this._applyStroke(prev, false)
    }
    this.selectedId = id
    if (id) {
      const curr = this.gameObjects.get(id)
      if (curr) this._applyStroke(curr, true)
    }
  }

  private _applyStroke(t: Phaser.GameObjects.Text, selected: boolean) {
    if (selected) {
      t.setStroke('#3b82f6', 4)
    } else {
      t.setStroke('#000000', 0)
    }
  }

  getScene(): Scene {
    return { objects: Array.from(this.layerData.values()) }
  }
}
