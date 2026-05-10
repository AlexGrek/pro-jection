import Phaser from 'phaser'
import type { Layer, Scene } from '@/lib/scene'
import { getArrayModifier } from '@/lib/scene'
import { CANVAS_H, CANVAS_W, FILL_TEXTURE_PREFIX } from './constants'
import { applyText, refreshTextSelection } from './renderers/text'
import { applyShape, refreshShapeSelection } from './renderers/shape'
import { applyFill } from './renderers/fill'
import type { InteractiveOpts, LayerObject, RenderCtx } from './renderers/types'

export { type Layer, type Scene } from '@/lib/scene'
export { CANVAS_W, CANVAS_H } from './constants'

const HINT_FONT = '"Outfit Variable", "Outfit", system-ui, sans-serif'

/**
 * Phaser scene. Owns the GameObject map and the layer-data map, and dispatches
 * scene updates to per-type renderer modules. Renderers receive the scene as a
 * `RenderCtx` and operate via its public surface.
 */
export class ProjectionScene extends Phaser.Scene implements RenderCtx {
  editable = false
  onPositionChange?: (id: string, x: number, y: number) => void
  onObjectSelect?: (id: string) => void
  onSceneReady?: (scene: ProjectionScene) => void

  readonly gameObjects = new Map<string, LayerObject>()
  readonly layerData = new Map<string, Layer>()
  selectedId: string | null = null
  private _nonInteractive = new Set<string>()

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

    // Build the set of clone IDs we expect after this apply.
    const expectedCloneIds = new Set<string>()
    this._nonInteractive.clear()
    scene.objects.forEach((layer) => {
      const arr = getArrayModifier(layer)
      if (arr && arr.count > 1) {
        for (let ci = 1; ci < arr.count; ci++) {
          const cloneId = `${layer.id}__arr_${ci}`
          expectedCloneIds.add(cloneId)
          this._nonInteractive.add(cloneId)
        }
      }
    })

    const allExpected = new Set([...newIds, ...expectedCloneIds])
    const stale: string[] = []
    for (const id of this.gameObjects.keys()) {
      if (!allExpected.has(id)) stale.push(id)
    }
    for (const id of stale) {
      this.destroyGameObject(id)
      this.layerData.delete(id)
    }

    scene.objects.forEach((layer, i) => {
      this.layerData.set(layer.id, { ...layer })
      this._dispatchApply(layer)
      const go = this.gameObjects.get(layer.id)
      if (go) go.setDepth(i * 1000)

      const arr = getArrayModifier(layer)
      if (arr && arr.count > 1) {
        const baseGo = this.gameObjects.get(layer.id)
        const stepX = arr.relative && baseGo
          ? arr.offset_x * (baseGo.width / CANVAS_W)
          : arr.offset_x
        const stepY = arr.relative && baseGo
          ? arr.offset_y * (baseGo.height / CANVAS_H)
          : arr.offset_y
        for (let ci = 1; ci < arr.count; ci++) {
          const cloneId = `${layer.id}__arr_${ci}`
          const dx = arr.direction !== 'y' ? stepX * ci : 0
          const dy = arr.direction !== 'x' ? stepY * ci : 0
          const cloneLayer = { ...layer, id: cloneId, x: layer.x + dx, y: layer.y + dy }
          this.layerData.set(cloneId, cloneLayer)
          this._dispatchApply(cloneLayer)
          const cgo = this.gameObjects.get(cloneId)
          if (cgo) cgo.setDepth(i * 1000 + ci)
        }
      }
    })

    if (this.hint) {
      this.hint.setVisible(scene.objects.length === 0)
    }
  }

  selectObject(id: string | null) {
    this._selectById(id)
  }

  getScene(): Scene {
    return { objects: Array.from(this.layerData.values()) }
  }

  // ── Internals exposed for renderer modules (RenderCtx surface) ────────────

  destroyGameObject(id: string): void {
    const go = this.gameObjects.get(id)
    if (go) {
      go.destroy()
      this.gameObjects.delete(id)
    }
    const key = `${FILL_TEXTURE_PREFIX}${id}`
    if (this.textures.exists(key)) {
      this.textures.remove(key)
    }
  }

  attachInteractive(go: LayerObject, id: string, opts: InteractiveOpts = {}): void {
    if (this._nonInteractive.has(id)) return
    const draggable = opts.draggable ?? true
    const margin = opts.margin ?? 0

    if (draggable) {
      go.setInteractive({ draggable: true, cursor: 'move' })
      go.on('drag', (_: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        go.setPosition(
          Phaser.Math.Clamp(dragX, margin, CANVAS_W - margin),
          Phaser.Math.Clamp(dragY, margin, CANVAS_H - margin),
        )
      })
      go.on('dragend', () => {
        const nx = go.x / CANVAS_W
        const ny = go.y / CANVAS_H
        const d = this.layerData.get(id)
        if (d) this.layerData.set(id, { ...d, x: nx, y: ny })
        this.onPositionChange?.(id, nx, ny)
      })
    } else {
      go.setInteractive({ cursor: 'pointer' })
    }

    go.on('pointerdown', () => {
      this._selectById(id)
      this.onObjectSelect?.(id)
    })
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _dispatchApply(layer: Layer): void {
    if (layer.type === 'text') applyText(this, layer)
    else if (layer.type === 'shape') applyShape(this, layer)
    else if (layer.type === 'fill') applyFill(this, layer)
  }

  private _selectById(id: string | null): void {
    if (this.selectedId === id) return
    const prev = this.selectedId
    this.selectedId = id
    if (prev) this._refreshSelectionStyle(prev)
    if (id) this._refreshSelectionStyle(id)
  }

  private _refreshSelectionStyle(id: string): void {
    const layer = this.layerData.get(id)
    if (!layer) return
    if (layer.type === 'text') refreshTextSelection(this, id)
    else if (layer.type === 'shape') refreshShapeSelection(this, layer)
    // fill: no visual selection mark — panel highlight is the indicator.
  }
}
