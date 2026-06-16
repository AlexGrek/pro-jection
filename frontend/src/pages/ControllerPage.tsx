import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  IconArrowLeft,
  IconCirclePlus,
  IconCopy,
  IconDeviceFloppy,
  IconDeviceGamepad2,
  IconExternalLink,
  IconFolderOpen,
  IconKeyboard,
  IconPlayerPlay,
  IconRefresh,
  IconAdjustmentsHorizontal,
  IconSparkles,
  IconStack2,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { PhaserCanvas, type PhaserCanvasHandle } from '@/components/PhaserCanvas'
import { AddObjectPanel } from '@/components/controller/AddObjectPanel'
import { ArrayModifierPanel } from '@/components/controller/ArrayModifierPanel'
import { BarcodeProperties } from '@/components/controller/BarcodeProperties'
import { ColorPicker } from '@/components/controller/ColorPicker'
import { GlowAnimationPanel } from '@/components/controller/GlowAnimationPanel'
import { GlowModifierPanel } from '@/components/controller/GlowModifierPanel'
import { MatrixModifierPanel } from '@/components/controller/MatrixModifierPanel'
import { FillProperties } from '@/components/controller/FillProperties'
import { GridControl } from '@/components/controller/GridControl'
import { IconProperties } from '@/components/controller/IconProperties'
import { ImageProperties } from '@/components/controller/ImageProperties'
import { HotkeysMenu } from '@/components/controller/HotkeysMenu'
import { LayerRow } from '@/components/controller/LayerRow'
import { PropertyRow } from '@/components/controller/PropertyRow'
import { ShapeProperties } from '@/components/controller/ShapeProperties'
import { TextProperties } from '@/components/controller/TextProperties'
import { VideoProperties } from '@/components/controller/VideoProperties'
import {
  OpenSceneDialog,
  SaveSceneDialog,
  type SavedSceneMeta,
} from '@/components/controller/SceneStorageDialogs'
import type { PropertyControls } from '@/components/controller/types'
import {
  DEFAULT_CIRCLE_LAYER,
  DEFAULT_BARCODE_LAYER,
  DEFAULT_FILL_LAYER,
  DEFAULT_ICON_LAYER,
  DEFAULT_IMAGE_LAYER,
  DEFAULT_RECT_LAYER,
  DEFAULT_TEXT_LAYER,
  DEFAULT_VIDEO_LAYER,
  randomBarcodeValue,
  type FillLayer,
  type IconLayer,
  type ImageLayer,
  type BarcodeLayer,
  type GridSettings,
  type Layer,
  type Scene,
  type ShapeLayer,
  type TextLayer,
  type VideoLayer,
} from '@/lib/scene'

type ConnState = 'connecting' | 'connected' | 'disconnected' | 'error'

type ServerEvent =
  | { type: 'connected'; role: string; session_code: string }
  | { type: 'controller_status'; connected: boolean }
  | { type: 'error'; message: string }


const TEXT_DEBOUNCE_MS = 350

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Scale a layer's size by `factor` for mouse-wheel resize. Only fills are left untouched. */
function resizeLayer(layer: Layer, factor: number): Layer {
  switch (layer.type) {
    case 'text':
      return { ...layer, font_size: clamp(layer.font_size * factor, 8, 800) }
    case 'shape':
      return {
        ...layer,
        width: clamp(layer.width * factor, 0.01, 3),
        height: clamp(layer.height * factor, 0.01, 3),
      }
    case 'icon':
      return { ...layer, size: clamp(layer.size * factor, 0.01, 3) }
    case 'image':
    case 'video':
    case 'barcode':
      return { ...layer, width: clamp(layer.width * factor, 0.02, 3) }
    default:
      return layer
  }
}

type MobileTab = 'layers' | 'properties' | 'modifiers' | 'animations' | 'add'

const MOBILE_TABS: { id: MobileTab; label: string; Icon: React.ComponentType<{ size?: number; stroke?: number; className?: string }> }[] = [
  { id: 'layers',     label: 'Layers', Icon: IconStack2 },
  { id: 'properties', label: 'Props',  Icon: IconAdjustmentsHorizontal },
  { id: 'modifiers',  label: 'Mods',   Icon: IconSparkles },
  { id: 'animations', label: 'Anim',   Icon: IconPlayerPlay },
  { id: 'add',        label: 'Add',    Icon: IconCirclePlus },
]

function useIsMobile() {
  const [is, setIs] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIs(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return is
}

function ResizeHandle({ direction, onResize }: {
  direction: 'h' | 'v'
  onResize: (delta: number) => void
}) {
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    let prev = direction === 'h' ? e.clientX : e.clientY
    const onMove = (ev: MouseEvent) => {
      const cur = direction === 'h' ? ev.clientX : ev.clientY
      onResize(cur - prev)
      prev = cur
    }
    const onUp = () => {
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      className={`shrink-0 bg-slate-800/80 hover:bg-blue-600/50 active:bg-blue-500/60 transition-colors ${
        direction === 'h' ? 'w-0.75 cursor-col-resize' : 'h-0.75 cursor-row-resize'
      }`}
    />
  )
}

const PANEL_HDR = 'px-3 py-2 text-[10px] font-medium text-slate-500 border-b border-slate-800/60 uppercase tracking-wider'

export function ControllerPage() {
  const navigate = useNavigate()
  const { code } = useParams<{ code: string }>()

  const [connState, setConnState] = useState<ConnState>('connecting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [objects, setObjects] = useState<Layer[]>([])
  const [grid, setGrid] = useState<GridSettings | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [justAddedTextId, setJustAddedTextId] = useState<string | null>(null)
  const [hotkeysOpen, setHotkeysOpen] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const canvasRef = useRef<PhaserCanvasHandle>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const objectsRef = useRef<Layer[]>(objects)
  useEffect(() => { objectsRef.current = objects }, [objects])
  const gridRef = useRef<GridSettings | null>(grid)
  useEffect(() => { gridRef.current = grid }, [grid])
  const selectedIdRef = useRef<string | null>(null)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  const selected = objects.find((o) => o.id === selectedId) ?? null

  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState<MobileTab>('layers')

  // ── Panel sizes ───────────────────────────────────────────────────────────
  const [bottomH, setBottomH] = useState(280)
  const [layersW, setLayersW] = useState(200)
  const [propsW, setPropsW] = useState(260)
  const [modsW, setModsW] = useState(220)
  const [addW, setAddW] = useState(180)

  const resizeBottomH = useCallback((d: number) => setBottomH(h => Math.max(80, Math.min(700, h - d))), [])
  const resizeLayersW = useCallback((d: number) => setLayersW(w => Math.max(120, Math.min(600, w - d))), [])
  const resizePropsW  = useCallback((d: number) => setPropsW(w  => Math.max(120, Math.min(600, w + d))), [])
  const resizeModsW   = useCallback((d: number) => setModsW(w   => Math.max(80,  Math.min(600, w + d))), [])
  const resizeAddW    = useCallback((d: number) => setAddW(w    => Math.max(120, Math.min(400, w - d))), [])

  // ── Local sync: state + canvas ────────────────────────────────────────────
  // The grid overlay is scene-wide, not a layer — it rides along on every apply
  // and send via gridRef so the objects-centric helpers stay unchanged.
  const applyObjects = useCallback((next: Layer[]) => {
    setObjects(next)
    canvasRef.current?.applyScene({ objects: next, grid: gridRef.current ?? undefined })
  }, [])

  // ── Send ──────────────────────────────────────────────────────────────────
  const sendNow = useCallback((next: Layer[]) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    wsRef.current.send(JSON.stringify({ objects: next, grid: gridRef.current ?? undefined } satisfies Scene))
  }, [])

  const sendDebounced = useCallback((next: Layer[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => sendNow(next), TEXT_DEBOUNCE_MS)
  }, [sendNow])

  const sendCurrent = useCallback(() => sendNow(objectsRef.current), [sendNow])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // ── Connection ────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    wsRef.current?.close()
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/controller/${code}`)
    wsRef.current = ws
    setConnState('connecting')
    setErrorMsg(null)

    ws.onopen = () => setConnState('connected')

    ws.onmessage = (e) => {
      const data: ServerEvent | Scene = JSON.parse(e.data)
      if ('type' in data) {
        if (data.type === 'error') {
          setErrorMsg(data.message)
          setConnState('error')
        }
      } else {
        const scene = data as Scene
        gridRef.current = scene.grid ?? null
        setGrid(scene.grid ?? null)
        applyObjects(scene.objects)
      }
    }

    ws.onclose = () => setConnState((s) => (s === 'error' ? 'error' : 'disconnected'))
  }, [code, applyObjects])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  // ── Canvas callbacks ──────────────────────────────────────────────────────
  const onPositionChange = useCallback((id: string, x: number, y: number) => {
    const next = objectsRef.current.map((o) => (o.id === id ? { ...o, x, y } : o))
    applyObjects(next)
    sendNow(next)
  }, [applyObjects, sendNow])

  const onDragMove = useCallback((id: string, x: number, y: number) => {
    const next = objectsRef.current.map((o) => (o.id === id ? { ...o, x, y } : o))
    sendNow(next)
  }, [sendNow])

  const onObjectSelect = useCallback((id: string) => {
    setSelectedId(id)
    if (isMobile) setActiveTab('properties')
  }, [isMobile])

  // Mouse-wheel resize streams a debounced send while scrolling (like text/colour tuning).
  const onWheelResize = useCallback((id: string, factor: number) => {
    const next = objectsRef.current.map((o) => (o.id === id ? resizeLayer(o, factor) : o))
    applyObjects(next)
    sendDebounced(next)
  }, [applyObjects, sendDebounced])

  // ── Grid overlay ──────────────────────────────────────────────────────────
  const changeGrid = useCallback((next: GridSettings | null) => {
    gridRef.current = next
    setGrid(next)
    canvasRef.current?.applyScene({ objects: objectsRef.current, grid: next ?? undefined })
    sendNow(objectsRef.current)
  }, [sendNow])

  // ── Layer mutation ────────────────────────────────────────────────────────
  const patchSelected = useCallback((patch: Record<string, unknown>): Layer[] => {
    if (!selectedId) return objectsRef.current
    const next = objectsRef.current.map((o) =>
      o.id === selectedId ? ({ ...o, ...patch } as Layer) : o,
    )
    applyObjects(next)
    return next
  }, [selectedId, applyObjects])

  const duplicateLayer = useCallback((id: string) => {
    const src = objectsRef.current.find((o) => o.id === id)
    if (!src) return
    const copy = { ...src, id: crypto.randomUUID(), x: src.x + 0.02, y: src.y + 0.02 }
    const srcIdx = objectsRef.current.findIndex((o) => o.id === id)
    const next = [...objectsRef.current]
    next.splice(srcIdx + 1, 0, copy)
    applyObjects(next)
    setSelectedId(copy.id)
    canvasRef.current?.selectObject(copy.id)
    sendNow(next)
  }, [applyObjects, sendNow])

  const deleteLayer = useCallback((id: string) => {
    const next = objectsRef.current.filter((o) => o.id !== id)
    setSelectedId((prev) => (prev === id ? null : prev))
    applyObjects(next)
    sendNow(next)
  }, [applyObjects, sendNow])

  const moveLayer = useCallback((from: number, to: number) => {
    if (from === to) return
    const max = objectsRef.current.length - 1
    const target = Math.max(0, Math.min(max, to))
    const next = [...objectsRef.current]
    const [item] = next.splice(from, 1)
    next.splice(target, 0, item)
    applyObjects(next)
    sendNow(next)
  }, [applyObjects, sendNow])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return
      const sid = selectedIdRef.current
      const isMod = e.metaKey || e.ctrlKey
      if ((e.key === 'Delete' || e.key === 'Backspace') && sid) {
        e.preventDefault()
        deleteLayer(sid)
      } else if (isMod && e.key.toLowerCase() === 'd' && sid) {
        e.preventDefault()
        duplicateLayer(sid)
      } else if ((e.key === ']' || e.key === '[') && !isMod && sid) {
        e.preventDefault()
        const idx = objectsRef.current.findIndex((o) => o.id === sid)
        if (idx === -1) return
        const total = objectsRef.current.length
        const to = e.key === ']'
          ? (e.shiftKey ? total - 1 : idx + 1)
          : (e.shiftKey ? 0 : idx - 1)
        moveLayer(idx, to)
      } else if (e.key === 'Tab') {
        // Cycle selection through the layer stack (Shift+Tab = backward), wrapping.
        const objs = objectsRef.current
        if (objs.length === 0) return
        e.preventDefault()
        const dir = e.shiftKey ? -1 : 1
        const cur = objs.findIndex((o) => o.id === sid)
        const nextIdx = cur === -1
          ? (dir === 1 ? 0 : objs.length - 1)
          : (cur + dir + objs.length) % objs.length
        const id = objs[nextIdx].id
        setSelectedId(id)
        canvasRef.current?.selectObject(id)
      } else if (e.key === 'Escape' && sid) {
        setSelectedId(null)
        canvasRef.current?.selectObject(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deleteLayer, duplicateLayer, moveLayer])

  const selectLayer = (id: string) => {
    setSelectedId(id)
    canvasRef.current?.selectObject(id)
    if (isMobile) setActiveTab('properties')
  }

  const addLayerAtEnd = (layer: Layer) => {
    const next = [...objectsRef.current, layer]
    applyObjects(next)
    setSelectedId(layer.id)
    canvasRef.current?.selectObject(layer.id)
    sendNow(next)
    if (isMobile) setActiveTab('properties')
  }

  const addText = () => {
    const layer = { ...DEFAULT_TEXT_LAYER, id: crypto.randomUUID() } as TextLayer
    addLayerAtEnd(layer)
    setJustAddedTextId(layer.id)
  }
  const addRectangle = () => addLayerAtEnd({ ...DEFAULT_RECT_LAYER,   id: crypto.randomUUID() } as ShapeLayer)
  const addCircle    = () => addLayerAtEnd({ ...DEFAULT_CIRCLE_LAYER, id: crypto.randomUUID() } as ShapeLayer)
  const addIcon      = () => addLayerAtEnd({ ...DEFAULT_ICON_LAYER,   id: crypto.randomUUID() } as IconLayer)
  const addImage     = () => addLayerAtEnd({ ...DEFAULT_IMAGE_LAYER,  id: crypto.randomUUID() } as ImageLayer)
  const addVideo     = () => addLayerAtEnd({ ...DEFAULT_VIDEO_LAYER,  id: crypto.randomUUID() } as VideoLayer)
  const addBarcode   = () => addLayerAtEnd({
    ...DEFAULT_BARCODE_LAYER,
    id: crypto.randomUUID(),
    code: randomBarcodeValue(DEFAULT_BARCODE_LAYER.format),
  } as BarcodeLayer)

  const addFill = () => {
    const newLayer: FillLayer = {
      ...DEFAULT_FILL_LAYER,
      id: crypto.randomUUID(),
      stops: DEFAULT_FILL_LAYER.stops.map((s) => ({ ...s })),
    }
    const next = [newLayer, ...objectsRef.current]
    applyObjects(next)
    setSelectedId(newLayer.id)
    canvasRef.current?.selectObject(newLayer.id)
    sendNow(next)
    if (isMobile) setActiveTab('properties')
  }

  // ── Server save / open ────────────────────────────────────────────────────
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null)
  const [currentSceneName, setCurrentSceneName] = useState('')
  const [openDialogOpen, setOpenDialogOpen] = useState(false)
  const [saveDialog, setSaveDialog] = useState<{ open: boolean; title: string; name: string }>(
    { open: false, title: 'Save Scene', name: '' },
  )

  // Upload keys referenced by the current scene's image and video layers (deduped).
  const collectArtifacts = (objs: Layer[]): string[] => {
    const keys = objs
      .filter((o): o is ImageLayer | VideoLayer => (o.type === 'image' || o.type === 'video') && !!o.url)
      .map((o) => o.url.replace('/api/useruploads/', ''))
    return [...new Set(keys)]
  }

  // POST a new saved scene (first save of a new scene, or "Save As").
  const createScene = useCallback(async (name: string) => {
    const objs = objectsRef.current
    const resp = await fetch('/api/scenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scene: { objects: objs, grid: gridRef.current ?? undefined }, artifacts: collectArtifacts(objs) }),
    })
    if (!resp.ok) return
    const meta = (await resp.json()) as SavedSceneMeta
    setCurrentSceneId(meta.id)
    setCurrentSceneName(meta.name)
  }, [])

  // Save button: re-save in place if this scene already exists, else prompt for a name.
  const serverSave = async () => {
    if (!currentSceneId) {
      setSaveDialog({ open: true, title: 'Save Scene', name: currentSceneName || `Scene ${code}` })
      return
    }
    const objs = objectsRef.current
    const resp = await fetch(`/api/scenes/${currentSceneId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: currentSceneName, scene: { objects: objs, grid: gridRef.current ?? undefined }, artifacts: collectArtifacts(objs) }),
    })
    if (resp.status === 404) {
      // Scene expired or was deleted server-side — fall back to creating a fresh one.
      setCurrentSceneId(null)
      setSaveDialog({ open: true, title: 'Save Scene', name: currentSceneName || `Scene ${code}` })
    }
  }

  const serverSaveAs = () => {
    setSaveDialog({
      open: true,
      title: 'Save Scene As',
      name: currentSceneName ? `${currentSceneName} copy` : `Scene ${code}`,
    })
  }

  const openSavedScene = useCallback(async (meta: SavedSceneMeta) => {
    const resp = await fetch(`/api/scenes/${meta.id}`)
    if (!resp.ok) return
    const data = (await resp.json()) as { id: string; name: string; scene: Scene }
    const objs = data.scene.objects ?? []
    gridRef.current = data.scene.grid ?? null
    setGrid(data.scene.grid ?? null)
    applyObjects(objs)
    sendNow(objs)
    setSelectedId(null)
    canvasRef.current?.selectObject(null)
    setCurrentSceneId(data.id)
    setCurrentSceneName(data.name)
  }, [applyObjects, sendNow])

  const controls = useMemo<PropertyControls>(() => ({
    patch: patchSelected,
    sendNow,
    sendDebounced,
    sendCurrent,
    disabled: connState !== 'connected',
  }), [patchSelected, sendNow, sendDebounced, sendCurrent, connState])

  const displayLayers = [...objects].map((layer, idx) => ({ layer, idx })).reverse()

  // ── Shared sub-sections ───────────────────────────────────────────────────

  const layersContent = (
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {objects.length === 0 && (
        <p className="text-slate-700 text-[10px] px-2 py-1">No layers yet.</p>
      )}
      {displayLayers.map(({ layer, idx }) => (
        <LayerRow
          key={layer.id}
          layer={layer}
          idx={idx}
          total={objects.length}
          selected={layer.id === selectedId}
          onSelect={() => selectLayer(layer.id)}
          onMove={(target) => moveLayer(idx, target)}
          onDuplicate={() => duplicateLayer(layer.id)}
          onDelete={() => deleteLayer(layer.id)}
        />
      ))}
    </div>
  )

  const propertiesContent = selected ? (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2.5">
      {selected.type === 'text'  && <TextProperties  key={selected.id} layer={selected} controls={controls} autoFocus={selected.id === justAddedTextId} />}
      {selected.type === 'shape' && <ShapeProperties layer={selected} controls={controls} />}
      {selected.type === 'fill'  && <FillProperties  layer={selected} controls={controls} />}
      {selected.type === 'icon'  && <IconProperties  layer={selected} controls={controls} />}
      {selected.type === 'image' && <ImageProperties layer={selected} controls={controls} />}
      {selected.type === 'video' && <VideoProperties layer={selected} controls={controls} />}
      {selected.type === 'barcode' && <BarcodeProperties layer={selected} controls={controls} />}

      {selected.type !== 'fill' && selected.type !== 'image' && selected.type !== 'video' && selected.type !== 'barcode' && (
        <PropertyRow label="Color">
          <ColorPicker
            value={selected.color}
            onChange={(hex) => sendDebounced(patchSelected({ color: hex }))}
            onCommit={(hex) => sendNow(patchSelected({ color: hex }))}
            disabled={connState !== 'connected'}
          />
        </PropertyRow>
      )}

      <PropertyRow label="Alpha">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(selected.opacity * 100)}
          onChange={(e) => patchSelected({ opacity: Number(e.target.value) / 100 })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={connState !== 'connected'}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">
          {Math.round(selected.opacity * 100)}
        </span>
      </PropertyRow>

      {selected.type !== 'fill' && (
        <PropertyRow label="Pos">
          <span className="text-slate-400 text-[10px] font-mono">
            {selected.x.toFixed(2)}, {selected.y.toFixed(2)}
          </span>
        </PropertyRow>
      )}
    </div>
  ) : (
    <div className="flex-1 flex items-center justify-center p-4">
      <p className="text-slate-600 text-xs text-center font-light">
        {objects.length === 0 ? 'Add a layer to get started.' : 'Select a layer to edit.'}
      </p>
    </div>
  )

  const modifiersContent = (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {selected ? (
        <>
          <ArrayModifierPanel layer={selected} controls={controls} />
          <MatrixModifierPanel layer={selected} controls={controls} />
          {selected.type !== 'fill' && (
            <GlowModifierPanel layer={selected} controls={controls} />
          )}
        </>
      ) : (
        <p className="text-slate-700 text-[10px] px-3 py-2">Select a layer.</p>
      )}
    </div>
  )

  const animationsContent = (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {selected ? (
        selected.type !== 'fill' ? (
          <GlowAnimationPanel layer={selected} controls={controls} />
        ) : (
          <p className="text-slate-700 text-[10px] px-3 py-2 italic">No animations for fills.</p>
        )
      ) : (
        <p className="text-slate-700 text-[10px] px-3 py-2">Select a layer.</p>
      )}
    </div>
  )

  const sceneDialogs = (
    <>
      <SaveSceneDialog
        open={saveDialog.open}
        onOpenChange={(open) => setSaveDialog((s) => ({ ...s, open }))}
        title={saveDialog.title}
        initialName={saveDialog.name}
        onSubmit={createScene}
      />
      <OpenSceneDialog
        open={openDialogOpen}
        onOpenChange={setOpenDialogOpen}
        onOpen={openSavedScene}
      />
    </>
  )

  const errorBanner = errorMsg && (
    <div className="flex items-center gap-3 bg-red-950/60 border-b border-red-800/50 text-red-300 px-4 py-3 text-sm font-light shrink-0">
      <span className="flex-1">{errorMsg}</span>
      {!errorMsg.includes('already connected') && (
        <Button
          size="sm"
          variant="ghost"
          className="text-red-400 hover:text-white hover:bg-red-900/50 gap-1.5"
          onClick={connect}
        >
          <IconRefresh size={14} stroke={1.5} />
          Retry
        </Button>
      )}
    </div>
  )

  const disconnectBanner = connState === 'disconnected' && !errorMsg && (
    <div className="flex items-center gap-3 bg-slate-900/60 border-b border-slate-700/40 text-slate-400 px-4 py-3 text-sm font-light shrink-0">
      <span className="flex-1">Connection lost.</span>
      <Button
        size="sm"
        variant="ghost"
        className="text-slate-300 hover:text-white hover:bg-slate-800 gap-1.5"
        onClick={connect}
      >
        <IconRefresh size={14} stroke={1.5} />
        Reconnect
      </Button>
    </div>
  )

  // ── Mobile layout ─────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <main
        className="h-screen flex flex-col bg-neutral-900 overflow-hidden"
        style={{ fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace' }}
      >
        {/* Icon-only header */}
        <header className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/60 bg-slate-950/40 backdrop-blur shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white hover:bg-slate-800 px-2"
            onClick={() => navigate('/')}
          >
            <IconArrowLeft size={16} stroke={1.5} />
          </Button>
          <IconDeviceGamepad2 size={18} stroke={1} className="text-blue-400 shrink-0" />
          {sceneDialogs}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white hover:bg-slate-800 px-2"
              title="Open scene"
              onClick={() => setOpenDialogOpen(true)}
            >
              <IconFolderOpen size={15} stroke={1.5} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white hover:bg-slate-800 px-2"
              title="Save scene"
              onClick={serverSave}
            >
              <IconDeviceFloppy size={15} stroke={1.5} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white hover:bg-slate-800 px-2"
              title="Save as new scene"
              onClick={serverSaveAs}
            >
              <IconCopy size={15} stroke={1.5} />
            </Button>
            <GridControl grid={grid} onChange={changeGrid} disabled={connState !== 'connected'} />
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white hover:bg-slate-800 px-2"
              title="Open projector"
              onClick={() => window.open(`/projector/${code}`, '_blank', 'noopener')}
            >
              <IconExternalLink size={15} stroke={1.5} />
            </Button>
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className={`px-2 ${hotkeysOpen ? 'text-white bg-slate-800' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                title="Hotkeys"
                onClick={() => setHotkeysOpen((o) => !o)}
              >
                <IconKeyboard size={15} stroke={1.5} />
              </Button>
              {hotkeysOpen && <HotkeysMenu onClose={() => setHotkeysOpen(false)} />}
            </div>
          </div>
          <code className="font-mono tracking-[0.15em] text-slate-400 text-[11px]">{code}</code>
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            connState === 'connected'    ? 'bg-green-400' :
            connState === 'connecting'   ? 'bg-yellow-400' :
            connState === 'error'        ? 'bg-red-400' :
                                           'bg-slate-600'
          }`} title={connState} />
        </header>

        {errorBanner}
        {disconnectBanner}

        {/* Canvas — 16:9 full width, capped so landscape doesn't eat the whole screen */}
        <div className="w-full aspect-video max-h-[45vh] bg-black shrink-0">
          <PhaserCanvas
            ref={canvasRef}
            editable
            onPositionChange={onPositionChange}
            onDragMove={onDragMove}
            onObjectSelect={onObjectSelect}
            onWheelResize={onWheelResize}
            className="w-full h-full"
          />
        </div>

        {/* Tab bar */}
        <div className="flex shrink-0 border-b border-slate-800 bg-slate-950/80">
          {MOBILE_TABS.map(({ id, label, Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex flex-col items-center justify-center h-12 gap-0.5 transition-colors ${
                  active ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon size={18} stroke={1.5} />
                {active && <span className="text-[9px] font-medium leading-none">{label}</span>}
              </button>
            )
          })}
        </div>

        {/* Active tab content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-950/40">
          {activeTab === 'layers'     && layersContent}
          {activeTab === 'properties' && propertiesContent}
          {activeTab === 'modifiers'  && modifiersContent}
          {activeTab === 'animations' && animationsContent}
          {activeTab === 'add'        && (
            <AddObjectPanel
              disabled={connState !== 'connected'}
              onAddText={addText}
              onAddRectangle={addRectangle}
              onAddCircle={addCircle}
              onAddFill={addFill}
              onAddIcon={addIcon}
              onAddImage={addImage}
              onAddVideo={addVideo}
              onAddBarcode={addBarcode}
            />
          )}
        </div>
      </main>
    )
  }

  // ── Desktop layout ────────────────────────────────────────────────────────
  return (
    <main
      className="h-screen flex flex-col bg-neutral-900 overflow-hidden"
      style={{ fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace' }}
    >
      <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 bg-slate-950/40 backdrop-blur shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-white hover:bg-slate-800 gap-1.5 px-2"
          onClick={() => navigate('/')}
        >
          <IconArrowLeft size={16} stroke={1.5} />
          Back
        </Button>
        <IconDeviceGamepad2 size={18} stroke={1} className="text-blue-400 shrink-0" />
        <span className="text-white font-light">Controller</span>
        {currentSceneName && (
          <span className="text-slate-500 font-light text-sm truncate max-w-55" title={currentSceneName}>
            · {currentSceneName}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {sceneDialogs}
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white hover:bg-slate-800 gap-1.5 px-2"
            onClick={() => setOpenDialogOpen(true)}
          >
            <IconFolderOpen size={15} stroke={1.5} />
            Open
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white hover:bg-slate-800 gap-1.5 px-2"
            onClick={serverSave}
          >
            <IconDeviceFloppy size={15} stroke={1.5} />
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white hover:bg-slate-800 gap-1.5 px-2"
            title="Save as new scene"
            onClick={serverSaveAs}
          >
            <IconCopy size={15} stroke={1.5} />
            Save As
          </Button>
          <GridControl grid={grid} onChange={changeGrid} disabled={connState !== 'connected'} />
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white hover:bg-slate-800 px-2"
            title="Open projector in new tab"
            onClick={() => window.open(`/projector/${code}`, '_blank', 'noopener')}
          >
            <IconExternalLink size={15} stroke={1.5} />
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className={`px-2 ${hotkeysOpen ? 'text-white bg-slate-800' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              title="Hotkeys"
              onClick={() => setHotkeysOpen((o) => !o)}
            >
              <IconKeyboard size={15} stroke={1.5} />
            </Button>
            {hotkeysOpen && <HotkeysMenu onClose={() => setHotkeysOpen(false)} />}
          </div>
        </div>
        <code className="font-mono tracking-[0.2em] text-slate-300 text-sm">{code}</code>
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            connState === 'connected'  ? 'bg-green-400' :
            connState === 'connecting' ? 'bg-yellow-400' :
            connState === 'error'      ? 'bg-red-400' :
                                         'bg-slate-600'
          }`} />
          {connState !== 'connected' && (
            <span className={`text-xs font-light ${
              connState === 'connecting' ? 'text-yellow-400' :
              connState === 'error'      ? 'text-red-400' :
                                           'text-slate-500'
            }`}>{connState}</span>
          )}
        </span>
      </header>

      {errorBanner}
      {disconnectBanner}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

        {/* Top row: canvas + layers panel */}
        <div className="flex-1 min-h-0 flex overflow-hidden">

          <div className="flex-1 min-w-0 bg-black overflow-hidden ring-1 ring-white/10">
            <PhaserCanvas
              ref={canvasRef}
              editable
              onPositionChange={onPositionChange}
              onDragMove={onDragMove}
              onObjectSelect={onObjectSelect}
              onWheelResize={onWheelResize}
              className="w-full h-full"
            />
          </div>

          <ResizeHandle direction="h" onResize={resizeLayersW} />

          <div style={{ width: layersW }} className="shrink-0 bg-slate-950/60 flex flex-col overflow-hidden">
            <div className={PANEL_HDR}>Layers</div>
            {layersContent}
          </div>
        </div>

        <ResizeHandle direction="v" onResize={resizeBottomH} />

        {/* Bottom row: properties + modifiers + animations + add */}
        <div style={{ height: bottomH }} className="flex shrink-0 overflow-hidden">

          {/* Properties */}
          <div style={{ width: propsW }} className="shrink-0 bg-slate-950/40 flex flex-col overflow-hidden">
            <div className={PANEL_HDR}>Properties</div>
            {propertiesContent}
          </div>

          <ResizeHandle direction="h" onResize={resizePropsW} />

          {/* Modifiers */}
          <div style={{ width: modsW }} className="shrink-0 flex flex-col overflow-hidden">
            <div className={PANEL_HDR}>Modifiers</div>
            {modifiersContent}
          </div>

          <ResizeHandle direction="h" onResize={resizeModsW} />

          {/* Animations */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <div className={PANEL_HDR}>Animations</div>
            {animationsContent}
          </div>

          <ResizeHandle direction="h" onResize={resizeAddW} />

          {/* Add Object */}
          <div style={{ width: addW }} className="shrink-0 bg-slate-950/40 flex flex-col overflow-hidden">
            <AddObjectPanel
              disabled={connState !== 'connected'}
              onAddText={addText}
              onAddRectangle={addRectangle}
              onAddCircle={addCircle}
              onAddFill={addFill}
              onAddIcon={addIcon}
              onAddImage={addImage}
              onAddVideo={addVideo}
              onAddBarcode={addBarcode}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
