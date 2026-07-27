import Phaser from 'phaser'
import type { GlowModifier, GridSettings, Layer, Modifier, ProjectionSettings, Scene } from '@/lib/scene'
import { calibrationHex, getArrayModifier, getGlowModifier, getMatrixModifier, isIdentityCorners, withCorner } from '@/lib/scene'
import { GLOW_PERIOD_MAX, GLOW_PERIOD_MIN } from '@/lib/scene'
import { hexToInt } from './colors'
import { BARCODE_TEXTURE_PREFIX, CANVAS_H, CANVAS_W, CORNER_COLOR, CORNER_GRAB_FACTOR, CORNER_HANDLE_PX, FILL_TEXTURE_PREFIX, GLOW_BREATH_MIN, GRID_DEPTH, ICON_TEXTURE_PREFIX, IMAGE_TEXTURE_PREFIX, PROJECTION_DEPTH, RAYS_TEXTURE_PREFIX } from './constants'
import { cornersToMatrix3d } from './warp'
import { applyText } from './renderers/text'
import { applyShape } from './renderers/shape'
import { applyFill } from './renderers/fill'
import { applyIcon } from './renderers/icon'
import { applyImage, cleanupImage } from './renderers/image'
import { applyVideo, cleanupVideo } from './renderers/video'
import { applyBarcode, cleanupBarcode } from './renderers/barcode'
import { applyRays } from './renderers/rays'
import { drawGrid } from './renderers/grid'
import { drawCalibrationGrid } from './renderers/calibration'
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
  onCornerDrag?: (index: number, x: number, y: number) => void
  onCornerDragEnd?: (index: number, x: number, y: number) => void
  onCornerSelect?: (index: number) => void

  readonly gameObjects = new Map<string, LayerObject>()
  readonly layerData = new Map<string, Layer>()
  selectedId: string | null = null
  private _nonInteractive = new Set<string>()
  private _glowFilters = new Map<string, Phaser.Filters.Glow>()

  private hint?: Phaser.GameObjects.Text
  private _selectionGraphics?: Phaser.GameObjects.Graphics
  private _grid?: Phaser.GameObjects.Graphics
  private _gridSettings?: GridSettings

  private _projection?: ProjectionSettings
  /** Controller-local flat preview turns the warp off without clearing the corners. */
  private _warpEnabled = true
  private _selectedCorner: number | null = null
  private _cornerOutline?: Phaser.GameObjects.Graphics
  private _cornerHandles: Phaser.GameObjects.Arc[] = []
  private _calibration?: Phaser.GameObjects.Graphics

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

    // The canvas is positioned and warped by us, not by autoCenter — see _layoutCanvas.
    this.scale.on(Phaser.Scale.Events.RESIZE, this._layoutCanvas, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this._layoutCanvas, this)
    })
    this._layoutCanvas()

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
    // fills and fullscreen rays span the whole canvas — panel highlight is the indicator
    if (!layer || layer.type === 'fill') return
    if (layer.type === 'rays' && layer.fullscreen) return

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
      if (layer.type !== 'fill' && layer.type !== 'rays') this._applyGlow(layer.id, layer.modifiers)

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
    this.applyProjection(scene.projection)

    if (this.hint) {
      this.hint.setVisible(scene.objects.length === 0)
    }
  }

  selectObject(id: string | null) {
    this._selectById(id)
  }

  getScene(): Scene {
    return {
      objects: Array.from(this.layerData.values()),
      grid: this._gridSettings,
      projection: this._projection,
    }
  }

  // ── Projection (keystone warp) ────────────────────────────────────────────

  /**
   * Set the scene-wide keystone warp. Called from `applyScene`, and directly by
   * the controller while dragging/nudging a corner so a calibration tweak doesn't
   * re-dispatch every layer.
   */
  applyProjection(projection?: ProjectionSettings): void {
    this._projection = projection
    this._drawCalibration()
    this._layoutCanvas()
  }

  /** Controller-only: `false` previews the scene flat while keeping the corners. */
  setWarpEnabled(enabled: boolean): void {
    if (this._warpEnabled === enabled) return
    this._warpEnabled = enabled
    this._layoutCanvas() // also redraws the handles, which hide while warped
  }

  setSelectedCorner(index: number | null): void {
    if (this._selectedCorner === index) return
    this._selectedCorner = index
    this._drawCorners()
  }

  /** The warp only matters when it is enabled, present, and not the identity quad. */
  private get _warpActive(): boolean {
    return this._warpEnabled && !!this._projection && !isIdentityCorners(this._projection.corners)
  }

  // ── Internals exposed for renderer modules (RenderCtx surface) ────────────

  destroyGameObject(id: string): void {
    const go = this.gameObjects.get(id)
    if (go) {
      go.destroy()
      this.gameObjects.delete(id)
    }
    this._glowFilters.delete(id)
    for (const prefix of [FILL_TEXTURE_PREFIX, ICON_TEXTURE_PREFIX, IMAGE_TEXTURE_PREFIX, BARCODE_TEXTURE_PREFIX, RAYS_TEXTURE_PREFIX]) {
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
    else if (layer.type === 'rays') applyRays(this, layer)
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
   * Position the canvas element inside its container and apply the keystone warp.
   *
   * Phaser 4 has no quad-warp game object, so the warp is a CSS `matrix3d` on the
   * canvas itself. That means we cannot use `autoCenter` (PhaserCanvas passes
   * `NO_CENTER`): `ScaleManager.updateCenter` derives its margins from
   * `canvas.getBoundingClientRect()`, which under a transform is the axis-aligned
   * bounding box of the *warped* canvas — the margins would chase the transform.
   * `parentSize`/`displaySize` are computed from the container and are immune.
   */
  private _layoutCanvas = (): void => {
    const canvas = this.game.canvas
    if (!canvas) return

    const pw = this.scale.parentSize.width
    const ph = this.scale.parentSize.height
    const dw = this.scale.displaySize.width
    const dh = this.scale.displaySize.height

    // Same margins autoCenter would set, but derived from parentSize/displaySize
    // instead of a bounding rect. Margins rather than absolute positioning so the
    // canvas stays in normal flow and its container needs no `position`, which
    // would otherwise lift it over the header popovers.
    canvas.style.marginLeft = `${Math.floor((pw - dw) / 2)}px`
    canvas.style.marginTop = `${Math.floor((ph - dh) / 2)}px`
    canvas.style.transformOrigin = '0 0'

    const transform = this._warpActive ? cornersToMatrix3d(this._projection!.corners, dw, dh) : 'none'
    if (canvas.style.transform !== transform) canvas.style.transform = transform

    // Phaser maps pointers through canvasBounds *and* displayScale, both derived
    // from getBoundingClientRect — the transform invalidates them, so every
    // drag/click would land in the wrong place. Turn input off while warped.
    this.input.enabled = !this._warpActive
    if (!this._warpActive) {
      // Recompute both from the now-untransformed box. Not scale.refresh(): that
      // re-emits RESIZE, which re-enters this method. displayScale is otherwise
      // only written inside refresh(), so a value computed while warped would
      // survive indefinitely and mis-scale every pointer event in flat mode.
      this.scale.updateBounds()
      const bounds = this.scale.canvasBounds
      if (bounds.width > 0 && bounds.height > 0) {
        this.scale.displayScale.set(
          this.scale.baseSize.width / bounds.width,
          this.scale.baseSize.height / bounds.height,
        )
      }
    }

    this._drawCorners()
  }

  /**
   * Show the calibration grid whenever the scene is in projection edit mode. This
   * runs on *every* client, projector included — the point is to see the warped
   * grid land on the real surface while the corners are being tuned.
   */
  private _drawCalibration(): void {
    if (!this._projection?.editing) {
      this._calibration?.setVisible(false)
      this._drawCorners()
      return
    }
    if (!this._calibration) {
      this._calibration = this.add.graphics().setDepth(PROJECTION_DEPTH - 1)
    }
    this._calibration.setVisible(true)
    drawCalibrationGrid(this._calibration, hexToInt(calibrationHex(this._projection.color)))
    this._drawCorners()
  }

  /**
   * Draw the projection quad outline and its four corner handles. The handles are
   * held in `_cornerHandles` rather than `gameObjects` — that map is swept for
   * stale ids at the top of `applyScene`, which would destroy them on every send.
   */
  private _drawCorners(): void {
    // Handles are drawn in canvas space, so under the warp they would land at
    // H(corner) rather than on the quad — what actually maps onto the quad is the
    // canvas rect's own corners. In projected preview the warped image edge *is*
    // the quad, so hide the overlay; input is disabled there anyway.
    const show = this.editable && !!this._projection?.editing && !this._warpActive
    if (!show) {
      this._cornerOutline?.setVisible(false)
      this._cornerHandles.forEach((h) => h.setVisible(false))
      return
    }

    const pts = this._projection!.corners.map((c) => ({ x: c.x * CANVAS_W, y: c.y * CANVAS_H }))

    // The canvas is scaled to fit its container, so a fixed canvas-space radius
    // would shrink to a few CSS pixels on the mobile controller. Size from the
    // current display scale instead so handles stay thumb-sized everywhere.
    const scale = CANVAS_W / (this.scale.displaySize.width || CANVAS_W)
    const radius = Phaser.Math.Clamp(CORNER_HANDLE_PX * scale, 16, 140)
    const stroke = Phaser.Math.Clamp(2 * scale, 2, 12)

    if (!this._cornerOutline) {
      this._cornerOutline = this.add.graphics().setDepth(PROJECTION_DEPTH)
    }
    const g = this._cornerOutline
    g.setVisible(true).clear()
    g.lineStyle(stroke, CORNER_COLOR, 0.9)
    g.strokePoints(pts.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true)

    if (this._cornerHandles.length === 0) this._createCornerHandles()

    this._cornerHandles.forEach((handle, i) => {
      const selected = i === this._selectedCorner
      handle
        .setVisible(true)
        .setPosition(pts[i].x, pts[i].y)
        .setStrokeStyle(selected ? stroke * 2 : stroke, 0xffffff, 1)
        .setFillStyle(CORNER_COLOR, selected ? 1 : 0.55)
      if (handle.radius !== radius) {
        handle.setRadius(radius)
        // Phaser captures the hit area when the object first becomes interactive
        // and never revisits it — and setInteractive() will not rebuild an existing
        // one. Resizing the circle therefore leaves the grab zone at its original
        // size, offset up-left of the handle by a diameter, which puts three of the
        // four corners outside the canvas and makes them impossible to grab. The
        // hit area is our own Circle, so resize it in place alongside the handle.
        const hit = handle.input?.hitArea as Phaser.Geom.Circle | undefined
        hit?.setTo(radius, radius, radius * CORNER_GRAB_FACTOR)
      }
    })
  }

  private _createCornerHandles(): void {
    for (let i = 0; i < 4; i++) {
      // Explicit circular hit area rather than the default derived one: it matches
      // the drawn handle, and holding the reference lets `_drawCorners` keep it in
      // sync when the radius is recomputed for the current canvas scale.
      const handle = this.add
        .circle(0, 0, CORNER_HANDLE_PX, CORNER_COLOR, 0.55)
        .setStrokeStyle(4, 0xffffff, 1)
        .setDepth(PROJECTION_DEPTH + 1)
        .setInteractive(
          new Phaser.Geom.Circle(
            CORNER_HANDLE_PX,
            CORNER_HANDLE_PX,
            CORNER_HANDLE_PX * CORNER_GRAB_FACTOR,
          ),
          Phaser.Geom.Circle.Contains,
        )
      if (handle.input) handle.input.cursor = 'move'
      this.input.setDraggable(handle)

      let lastSend = 0
      handle.on('drag', (_p: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        if (!this._projection) return
        // Clamped to the canvas box: `input.windowEvents` is off, so a pointerup
        // outside the canvas never reaches Phaser and an escaping handle would get
        // stuck mid-drag. Corners beyond the edge stay a keyboard-only affordance.
        const x = Phaser.Math.Clamp(dragX / CANVAS_W, 0, 1)
        const y = Phaser.Math.Clamp(dragY / CANVAS_H, 0, 1)
        const next = withCorner(this._projection.corners, i, x, y)
        if (!next) return // would fold the quad — ignore this frame
        this._projection = { corners: next }
        this._drawCorners() // immediate local feedback, independent of the round trip
        const now = Date.now()
        if (now - lastSend >= DRAG_SEND_INTERVAL_MS) {
          lastSend = now
          this.onCornerDrag?.(i, next[i].x, next[i].y)
        }
      })
      handle.on('dragend', () => {
        const c = this._projection?.corners[i]
        if (c) this.onCornerDragEnd?.(i, c.x, c.y)
      })
      handle.on('pointerdown', () => this.onCornerSelect?.(i))

      this._cornerHandles.push(handle)
    }
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
