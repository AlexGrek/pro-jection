import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  IconArrowLeft,
  IconCirclePlus,
  IconDeviceGamepad2,
  IconDownload,
  IconExternalLink,
  IconPlayerPlay,
  IconRefresh,
  IconSlidersHorizontal,
  IconSparkles,
  IconStack2,
  IconUpload,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { PhaserCanvas, type PhaserCanvasHandle } from '@/components/PhaserCanvas'
import { AddObjectPanel } from '@/components/controller/AddObjectPanel'
import { ArrayModifierPanel } from '@/components/controller/ArrayModifierPanel'
import { GlowModifierPanel } from '@/components/controller/GlowModifierPanel'
import { MatrixModifierPanel } from '@/components/controller/MatrixModifierPanel'
import { FillProperties } from '@/components/controller/FillProperties'
import { IconProperties } from '@/components/controller/IconProperties'
import { LayerRow } from '@/components/controller/LayerRow'
import { PropertyRow } from '@/components/controller/PropertyRow'
import { ShapeProperties } from '@/components/controller/ShapeProperties'
import { TextProperties } from '@/components/controller/TextProperties'
import type { PropertyControls } from '@/components/controller/types'
import {
  DEFAULT_CIRCLE_LAYER,
  DEFAULT_FILL_LAYER,
  DEFAULT_ICON_LAYER,
  DEFAULT_RECT_LAYER,
  DEFAULT_TEXT_LAYER,
  type FillLayer,
  type IconLayer,
  type Layer,
  type Scene,
  type ShapeLayer,
  type TextLayer,
} from '@/lib/scene'

type ConnState = 'connecting' | 'connected' | 'disconnected' | 'error'

type ServerEvent =
  | { type: 'connected'; role: string; session_code: string }
  | { type: 'controller_status'; connected: boolean }
  | { type: 'error'; message: string }

const STATUS_STYLES: Record<ConnState, string> = {
  connecting: 'bg-yellow-900/50 text-yellow-400',
  connected: 'bg-green-900/50 text-green-400',
  disconnected: 'bg-slate-800 text-slate-500',
  error: 'bg-red-900/50 text-red-400',
}

const TEXT_DEBOUNCE_MS = 350

type MobileTab = 'layers' | 'properties' | 'modifiers' | 'animations' | 'add'

const MOBILE_TABS: { id: MobileTab; label: string; Icon: React.ComponentType<{ size?: number; stroke?: number; className?: string }> }[] = [
  { id: 'layers',     label: 'Layers', Icon: IconStack2 },
  { id: 'properties', label: 'Props',  Icon: IconSlidersHorizontal },
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
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const canvasRef = useRef<PhaserCanvasHandle>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const objectsRef = useRef<Layer[]>(objects)
  useEffect(() => { objectsRef.current = objects }, [objects])

  const selected = objects.find((o) => o.id === selectedId) ?? null

  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState<MobileTab>('layers')

  // ── Panel sizes ───────────────────────────────────────────────────────────
  const [bottomH, setBottomH] = useState(220)
  const [layersW, setLayersW] = useState(200)
  const [propsW, setPropsW] = useState(210)
  const [modsW, setModsW] = useState(180)
  const [addW, setAddW] = useState(160)

  const resizeBottomH = useCallback((d: number) => setBottomH(h => Math.max(80, Math.min(700, h - d))), [])
  const resizeLayersW = useCallback((d: number) => setLayersW(w => Math.max(120, Math.min(600, w - d))), [])
  const resizePropsW  = useCallback((d: number) => setPropsW(w  => Math.max(120, Math.min(600, w + d))), [])
  const resizeModsW   = useCallback((d: number) => setModsW(w   => Math.max(80,  Math.min(600, w + d))), [])
  const resizeAddW    = useCallback((d: number) => setAddW(w    => Math.max(120, Math.min(400, w - d))), [])

  // ── Local sync: state + canvas ────────────────────────────────────────────
  const applyObjects = useCallback((next: Layer[]) => {
    setObjects(next)
    canvasRef.current?.applyScene({ objects: next })
  }, [])

  // ── Send ──────────────────────────────────────────────────────────────────
  const sendNow = useCallback((next: Layer[]) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    wsRef.current.send(JSON.stringify({ objects: next } satisfies Scene))
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
        applyObjects((data as Scene).objects)
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
    setActiveTab('properties')
  }, [])

  // ── Layer mutation ────────────────────────────────────────────────────────
  const patchSelected = useCallback((patch: Record<string, unknown>): Layer[] => {
    if (!selectedId) return objectsRef.current
    const next = objectsRef.current.map((o) =>
      o.id === selectedId ? ({ ...o, ...patch } as Layer) : o,
    )
    applyObjects(next)
    return next
  }, [selectedId, applyObjects])

  const moveLayer = (from: number, to: number) => {
    if (from === to) return
    const max = objectsRef.current.length - 1
    const target = Math.max(0, Math.min(max, to))
    const next = [...objectsRef.current]
    const [item] = next.splice(from, 1)
    next.splice(target, 0, item)
    applyObjects(next)
    sendNow(next)
  }

  const selectLayer = (id: string) => {
    setSelectedId(id)
    canvasRef.current?.selectObject(id)
  }

  const addLayerAtEnd = (layer: Layer) => {
    const next = [...objectsRef.current, layer]
    applyObjects(next)
    setSelectedId(layer.id)
    canvasRef.current?.selectObject(layer.id)
    sendNow(next)
  }

  const addText      = () => addLayerAtEnd({ ...DEFAULT_TEXT_LAYER,   id: crypto.randomUUID() } as TextLayer)
  const addRectangle = () => addLayerAtEnd({ ...DEFAULT_RECT_LAYER,   id: crypto.randomUUID() } as ShapeLayer)
  const addCircle    = () => addLayerAtEnd({ ...DEFAULT_CIRCLE_LAYER, id: crypto.randomUUID() } as ShapeLayer)
  const addIcon      = () => addLayerAtEnd({ ...DEFAULT_ICON_LAYER,   id: crypto.randomUUID() } as IconLayer)

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
  }

  // ── Save / Load ───────────────────────────────────────────────────────────
  const saveScene = useCallback(() => {
    const scene: Scene = { objects: objectsRef.current }
    const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scene-${code}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [code])

  const loadScene = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const scene: Scene = JSON.parse(ev.target?.result as string)
        if (!Array.isArray(scene.objects)) throw new Error('invalid scene')
        applyObjects(scene.objects)
        sendNow(scene.objects)
      } catch {
        // silently ignore malformed files
      }
    }
    reader.readAsText(file)
    e.target.value = ''
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
        />
      ))}
    </div>
  )

  const propertiesContent = selected ? (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2.5">
      {selected.type === 'text'  && <TextProperties  layer={selected} controls={controls} />}
      {selected.type === 'shape' && <ShapeProperties layer={selected} controls={controls} />}
      {selected.type === 'fill'  && <FillProperties  layer={selected} controls={controls} />}
      {selected.type === 'icon'  && <IconProperties  layer={selected} controls={controls} />}

      {selected.type !== 'fill' && (
        <PropertyRow label="Color">
          <input
            type="color"
            value={selected.color}
            onChange={(e) => patchSelected({ color: e.target.value })}
            onBlur={sendCurrent}
            disabled={connState !== 'connected'}
            className="w-7 h-6 rounded cursor-pointer border border-slate-700 bg-transparent disabled:opacity-40"
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

  const modifiersContent = selected ? (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <ArrayModifierPanel layer={selected} controls={controls} />
      <MatrixModifierPanel layer={selected} controls={controls} />
      {selected.type !== 'fill' && (
        <GlowModifierPanel layer={selected} controls={controls} />
      )}
    </div>
  ) : (
    <p className="text-slate-700 text-[10px] px-3 py-2">Select a layer.</p>
  )

  const animationsContent = (
    <div className="flex-1 min-h-0 overflow-y-auto p-2">
      {selected ? (
        Object.keys(selected.animations).length === 0 ? (
          <p className="text-slate-700 text-[10px] px-1 py-1 italic">No animations.</p>
        ) : (
          <div className="space-y-1">
            {Object.keys(selected.animations).map((k) => (
              <div
                key={k}
                className="px-2 py-1 rounded bg-slate-800/40 border border-slate-700/20 text-xs text-slate-400 font-light"
              >
                {k}
              </div>
            ))}
          </div>
        )
      ) : (
        <p className="text-slate-700 text-[10px] px-1 py-1">Select a layer.</p>
      )}
    </div>
  )

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".json,application/json"
      className="hidden"
      onChange={loadScene}
    />
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
        className="h-screen flex flex-col bg-linear-to-br from-slate-950 to-blue-950 overflow-hidden"
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
          {fileInput}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white hover:bg-slate-800 px-2"
              title="Load scene"
              onClick={() => fileInputRef.current?.click()}
            >
              <IconUpload size={15} stroke={1.5} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white hover:bg-slate-800 px-2"
              title="Save scene"
              onClick={saveScene}
            >
              <IconDownload size={15} stroke={1.5} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white hover:bg-slate-800 px-2"
              title="Open projector"
              onClick={() => window.open(`/projector/${code}`, '_blank', 'noopener')}
            >
              <IconExternalLink size={15} stroke={1.5} />
            </Button>
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

        {/* Canvas — 16:9 full width */}
        <div className="w-full aspect-video bg-black shrink-0">
          <PhaserCanvas
            ref={canvasRef}
            editable
            onPositionChange={onPositionChange}
            onDragMove={onDragMove}
            onObjectSelect={onObjectSelect}
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
            />
          )}
        </div>
      </main>
    )
  }

  // ── Desktop layout ────────────────────────────────────────────────────────
  return (
    <main
      className="h-screen flex flex-col bg-linear-to-br from-slate-950 to-blue-950 overflow-hidden"
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
        <div className="ml-auto flex items-center gap-2">
          {fileInput}
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white hover:bg-slate-800 gap-1.5 px-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <IconUpload size={15} stroke={1.5} />
            Load
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white hover:bg-slate-800 gap-1.5 px-2"
            onClick={saveScene}
          >
            <IconDownload size={15} stroke={1.5} />
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white hover:bg-slate-800 px-2"
            title="Open projector in new tab"
            onClick={() => window.open(`/projector/${code}`, '_blank', 'noopener')}
          >
            <IconExternalLink size={15} stroke={1.5} />
          </Button>
        </div>
        <code className="font-mono tracking-[0.2em] text-slate-300 text-sm">{code}</code>
        <span className={`text-xs px-2 py-0.5 rounded-full font-light ${STATUS_STYLES[connState]}`}>
          {connState}
        </span>
      </header>

      {errorBanner}
      {disconnectBanner}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

        {/* Top row: canvas + layers panel */}
        <div className="flex-1 min-h-0 flex overflow-hidden">

          <div className="flex-1 min-w-0 bg-black overflow-hidden">
            <PhaserCanvas
              ref={canvasRef}
              editable
              onPositionChange={onPositionChange}
              onDragMove={onDragMove}
              onObjectSelect={onObjectSelect}
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
            />
          </div>
        </div>
      </div>
    </main>
  )
}
