import Phaser from 'phaser'
import type { GlowModifier, GridSettings, Layer, Modifier, Scene } from '@/lib/scene'
import { getArrayModifier, getGlowModifier, getMatrixModifier } from '@/lib/scene'
import { GLOW_PERIOD_MAX, GLOW_PERIOD_MIN } from '@/lib/scene'
import { hexToInt } from './colors'
import { BARCODE_TEXTURE_PREFIX, CANVAS_H, CANVAS_W, FILL_TEXTURE_PREFIX, GLOW_BREATH_MIN, GRID_DEPTH, ICON_TEXTURE_PREFIX, IMAGE_TEXTURE_PREFIX } from './constants'
import { applyText } from './renderers/text'
import { applyShape } from './renderers/shape'
import { applyFill } from './renderers/fill'
import { applyIcon } from './renderers/icon'
import { applyImage, cleanupImage } from './renderers/image'
import { applyVideo, cleanupVideo } from './renderers/video'
import { applyBarcode, cleanupBarcode } from './renderers/barcode'
import { drawGrid } from './renderers/grid'
import type { InteractiveOpts, LayerObject, RenderCtx } from './renderers/types'

export { type Layer, type Scene } from '@/lib/scene'
export { CANVAS_W, CANVAS_H } from './constants'

const HINT_FONT = '"Outfit Variable", "Outfit", system-ui, sans-serif'

const DRAG_SEND_INTERVAL_MS = 500

/**
 * Phaser scene. Owns the GameObject map and the layer-data map, and dispatches
 * scene updates to per-type renderer modules. Renderers receive the scene as a
 * `RenderCtx` and operate via its public surface.
 */
export class ProjectionScene extends Phaser.Scene implements RenderCtx {
  editable = false
  onPositionChange?: (id: string, x: number, y: number) => void
  onDragMove?: (id: string, x: number, y: number) => void
  onObjectSelect?: (id: string) => void
  onWheelResize?: (id: string, factor: number) => void
  onSceneReady?: (scene: ProjectionScene) => void

  readonly gameObjects = new Map<string, LayerObject>()
  readonly layerData = new Map<string, Layer>()
  selectedId: string | null = null
  private _nonInteractive = new Set<string>()
  private _glowFilters = new Map<string, Phaser.Filters.Glow>()

  private hint?: Phaser.GameObjects.Text
  private _selectionGraphics?: Phaser.GameObjects.Graphics
  private _grid?: Phaser.GameObjects.Graphics
  private _gridSettings?: GridSettings

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

      this._selectionGraphics = this.add.graphics().setDepth(Number.MAX_SAFE_INTEGER)

      // Mouse-wheel resize: scale the selected layer (or the one under the
      // pointer when nothing is selected). The controller applies the per-type
      // size change; the scene only reports intent.
      this.input.on(
        'wheel',
        (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
          if (dy === 0) return
          const id = this.selectedId ?? (over.length > 0 ? this._idForGameObject(over[0]) : undefined)
          if (!id) return
          const factor = dy < 0 ? 1.08 : 1 / 1.08
          this.onWheelResize?.(id, factor)
        },
      )
    }
    this.onSceneReady?.(this)
  }

  update() {
    this._updateGlowAnimations()
    this._updateSelection()
  }

  private _updateSelection() {
    if (!this._selectionGraphics) return
    this._selectionGraphics.clear()
    if (!this.selectedId) return

    const layer = this.layerData.get(this.selectedId)
    // fills span the whole canvas — panel highlight is the indicator
    if (!layer || layer.type === 'fill') return

    const go = this.gameObjects.get(this.selectedId)
    if (!go) return

    const bounds = go.getBounds()
    const pad = 10
    const x = bounds.x - pad
    const y = bounds.y - pad
    const w = bounds.width + pad * 2
    const h = bounds.height + pad * 2

    // Oscillates between 0.35 and 1.0 with a ~650 ms half-period
    const alpha = 0.675 + 0.325 * Math.sin(this.time.now * Math.PI / 650)
    this._selectionGraphics.lineStyle(5, 0xffffff, alpha)
    this._selectionGraphics.strokeRect(x, y, w, h)
    this._selectionGraphics.lineStyle(2, 0x000000, alpha * 0.75)
    this._selectionGraphics.strokeRect(x + 4, y + 4, w - 8, h - 8)
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

    this._applyGrid(scene.grid)

    if (this.hint) {
      this.hint.setVisible(scene.objects.length === 0)
    }
  }

  selectObject(id: string | null) {
    this._selectById(id)
  }

  getScene(): Scene {
    return { objects: Array.from(this.layerData.values()), grid: this._gridSettings }
  }

  // ── Internals exposed for renderer modules (RenderCtx surface) ────────────

  destroyGameObject(id: string): void {
    const go = this.gameObjects.get(id)
    if (go) {
      go.destroy()
      this.gameObjects.delete(id)
    }
    this._glowFilters.delete(id)
    for (const prefix of [FILL_TEXTURE_PREFIX, ICON_TEXTURE_PREFIX, IMAGE_TEXTURE_PREFIX, BARCODE_TEXTURE_PREFIX]) {
      const key = `${prefix}${id}`
      if (this.textures.exists(key)) this.textures.remove(key)
    }
    cleanupImage(id)
    cleanupVideo(id)
    cleanupBarcode(id)
  }

  attachInteractive(go: LayerObject, id: string, opts: InteractiveOpts = {}): void {
    if (this._nonInteractive.has(id)) return
    const draggable = opts.draggable ?? true
    const margin = opts.margin ?? 0

    if (draggable) {
      go.setInteractive({ draggable: true, cursor: 'move' })

      let lastDragSendTime = 0

      go.on('drag', (_: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        const newX = Phaser.Math.Clamp(dragX, margin, CANVAS_W - margin)
        const newY = Phaser.Math.Clamp(dragY, margin, CANVAS_H - margin)
        go.setPosition(newX, newY)
        this._moveClonesTo(id, newX, newY)

        const now = Date.now()
        if (now - lastDragSendTime >= DRAG_SEND_INTERVAL_MS) {
          lastDragSendTime = now
          this.onDragMove?.(id, newX / CANVAS_W, newY / CANVAS_H)
        }
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

  private _moveClonesTo(id: string, px: number, py: number): void {
    const layer = this.layerData.get(id)
    if (!layer) return

    const deltaX = px - layer.x * CANVAS_W
    const deltaY = py - layer.y * CANVAS_H

    const arr = getArrayModifier(layer)
    if (arr && arr.count > 1) {
      for (let ci = 1; ci < arr.count; ci++) {
        const cloneId = `${id}__arr_${ci}`
        const cloneGo = this.gameObjects.get(cloneId)
        const cloneData = this.layerData.get(cloneId)
        if (cloneGo && cloneData) {
          cloneGo.setPosition(cloneData.x * CANVAS_W + deltaX, cloneData.y * CANVAS_H + deltaY)
        }
      }
    }

    const mat = getMatrixModifier(layer)
    if (mat && (mat.cols > 1 || mat.rows > 1)) {
      for (let r = 0; r < mat.rows; r++) {
        for (let c = 0; c < mat.cols; c++) {
          if (r === 0 && c === 0) continue
          const cloneId = `${id}__mat_${r}_${c}`
          const cloneGo = this.gameObjects.get(cloneId)
          const cloneData = this.layerData.get(cloneId)
          if (cloneGo && cloneData) {
            cloneGo.setPosition(cloneData.x * CANVAS_W + deltaX, cloneData.y * CANVAS_H + deltaY)
          }
        }
      }
    }
  }

  private _dispatchApply(layer: Layer): void {
    if (layer.type === 'text') applyText(this, layer)
    else if (layer.type === 'shape') applyShape(this, layer)
    else if (layer.type === 'fill') applyFill(this, layer)
    else if (layer.type === 'icon') applyIcon(this, layer)
    else if (layer.type === 'image') applyImage(this, layer)
    else if (layer.type === 'video') applyVideo(this, layer)
    else if (layer.type === 'barcode') applyBarcode(this, layer)
  }

  private _selectById(id: string | null): void {
    this.selectedId = id
  }

  /** Reverse-lookup a layer id from its GameObject (clones are non-interactive, so never matched here). */
  private _idForGameObject(go: Phaser.GameObjects.GameObject): string | undefined {
    for (const [id, obj] of this.gameObjects) {
      if (obj === go) return id
    }
    return undefined
  }

  /** Draw (or hide) the scene-wide grid overlay above every layer. */
  private _applyGrid(grid?: GridSettings): void {
    this._gridSettings = grid
    if (!grid) {
      this._grid?.setVisible(false)
      return
    }
    if (!this._grid) {
      this._grid = this.add.graphics().setDepth(GRID_DEPTH)
    }
    this._grid.setVisible(true)
    drawGrid(this._grid, grid.type)
  }

  /**
   * Per-frame breathing of glow filters. Layers carrying a `glow` animation have
   * their filter strength oscillated between `GLOW_BREATH_MIN` and the modifier's
   * configured strength on a sine over the configured period. `applyScene` resets
   * the strength to its static value whenever the animation is absent, so removing
   * the animation snaps the glow back automatically.
   */
  private _updateGlowAnimations(): void {
    if (this._glowFilters.size === 0) return
    const now = this.time.now
    for (const [id, filter] of this._glowFilters) {
      const layer = this.layerData.get(id)
      const anim = layer?.animations.glow
      if (!layer || !anim) continue
      const glowMod = getGlowModifier(layer)
      if (!glowMod) continue

      const periodMs = Phaser.Math.Clamp(anim.period, GLOW_PERIOD_MIN, GLOW_PERIOD_MAX) * 1000
      // 0 at the start of each cycle, 1 at the half-period — a smooth in/out breath.
      const breath = 0.5 - 0.5 * Math.cos((now % periodMs) / periodMs * Math.PI * 2)
      const factor = GLOW_BREATH_MIN + (1 - GLOW_BREATH_MIN) * breath
      filter.outerStrength = glowMod.outer_strength * factor
      filter.innerStrength = glowMod.inner_strength * factor
    }
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
