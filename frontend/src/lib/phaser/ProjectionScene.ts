import Phaser from 'phaser'
import type { GlowModifier, Layer, Modifier, Scene } from '@/lib/scene'
import { getArrayModifier, getGlowModifier, getMatrixModifier } from '@/lib/scene'
import { hexToInt } from './colors'
import { CANVAS_H, CANVAS_W, FILL_TEXTURE_PREFIX, ICON_TEXTURE_PREFIX } from './constants'
import { applyText, refreshTextSelection } from './renderers/text'
import { applyShape, refreshShapeSelection } from './renderers/shape'
import { applyFill } from './renderers/fill'
import { applyIcon } from './renderers/icon'
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
  private _glowFilters = new Map<string, Phaser.Filters.Glow>()

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
      const mat = getMatrixModifier(layer)
      if (mat && (mat.cols > 1 || mat.rows > 1)) {
        for (let r = 0; r < mat.rows; r++) {
          for (let c = 0; c < mat.cols; c++) {
            if (r === 0 && c === 0) continue
            const cloneId = `${layer.id}__mat_${r}_${c}`
            expectedCloneIds.add(cloneId)
            this._nonInteractive.add(cloneId)
          }
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
      if (layer.type !== 'fill') this._applyGlow(layer.id, layer.modifiers)

      const baseGo = this.gameObjects.get(layer.id)
      // Images (icon/fill) use displayWidth/displayHeight because setDisplaySize
      // sets scale without touching .width, which stays at the texture size.
      const goW = baseGo instanceof Phaser.GameObjects.Image ? baseGo.displayWidth : baseGo?.width ?? 0
      const goH = baseGo instanceof Phaser.GameObjects.Image ? baseGo.displayHeight : baseGo?.height ?? 0

      const arr = getArrayModifier(layer)
      if (arr && arr.count > 1) {
        const stepX = arr.relative && baseGo ? arr.offset_x * (goW / CANVAS_W) : arr.offset_x
        const stepY = arr.relative && baseGo ? arr.offset_y * (goH / CANVAS_H) : arr.offset_y
        for (let ci = 1; ci < arr.count; ci++) {
          const cloneId = `${layer.id}__arr_${ci}`
          const dx = arr.direction !== 'y' ? stepX * ci : 0
          const dy = arr.direction !== 'x' ? stepY * ci : 0
          const cloneLayer = { ...layer, id: cloneId, x: layer.x + dx, y: layer.y + dy }
          this.layerData.set(cloneId, cloneLayer)
          this._dispatchApply(cloneLayer)
          const cgo = this.gameObjects.get(cloneId)
          if (cgo) cgo.setDepth(i * 1000 + ci)
          if (layer.type !== 'fill') this._applyGlow(cloneId, layer.modifiers)
        }
      }

      const mat = getMatrixModifier(layer)
      if (mat && (mat.cols > 1 || mat.rows > 1)) {
        const stepX = mat.relative && baseGo ? mat.offset_x * (goW / CANVAS_W) : mat.offset_x
        const stepY = mat.relative && baseGo ? mat.offset_y * (goH / CANVAS_H) : mat.offset_y
        for (let r = 0; r < mat.rows; r++) {
          for (let c = 0; c < mat.cols; c++) {
            if (r === 0 && c === 0) continue
            const cloneId = `${layer.id}__mat_${r}_${c}`
            const cloneLayer = { ...layer, id: cloneId, x: layer.x + c * stepX, y: layer.y + r * stepY }
            this.layerData.set(cloneId, cloneLayer)
            this._dispatchApply(cloneLayer)
            const cgo = this.gameObjects.get(cloneId)
            if (cgo) cgo.setDepth(i * 1000 + r * mat.cols + c)
            if (layer.type !== 'fill') this._applyGlow(cloneId, layer.modifiers)
          }
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
    this._glowFilters.delete(id)
    for (const prefix of [FILL_TEXTURE_PREFIX, ICON_TEXTURE_PREFIX]) {
      const key = `${prefix}${id}`
      if (this.textures.exists(key)) this.textures.remove(key)
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
    else if (layer.type === 'icon') applyIcon(this, layer)
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

  private _applyGlow(id: string, modifiers: Modifier[]): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const go = this.gameObjects.get(id) as any
    if (!go) return

    const glowMod: GlowModifier | undefined = getGlowModifier({ modifiers })
    const existing = this._glowFilters.get(id)

    if (!glowMod) {
      if (existing) {
        go.filters?.internal.remove(existing)
        this._glowFilters.delete(id)
      }
      return
    }

    const colorInt = hexToInt(glowMod.color)

    if (existing && existing.distance === glowMod.distance) {
      existing.color = colorInt
      existing.outerStrength = glowMod.outer_strength
      existing.innerStrength = glowMod.inner_strength
    } else {
      if (existing) {
        go.filters.internal.remove(existing)
      } else {
        go.enableFilters()
      }
      const glow: Phaser.Filters.Glow = go.filters.internal.addGlow(
        colorInt,
        glowMod.outer_strength,
        glowMod.inner_strength,
        1,    // scale
        false, // knockout
        10,   // quality (fixed)
        glowMod.distance,
      )
      glow.setPaddingOverride(null)
      this._glowFilters.set(id, glow)
    }
  }
}
