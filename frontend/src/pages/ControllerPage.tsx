import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconArrowLeft, IconDeviceGamepad2, IconRefresh } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { PhaserCanvas, type PhaserCanvasHandle } from '@/components/PhaserCanvas'
import { AddObjectPanel } from '@/components/controller/AddObjectPanel'
import { FillProperties } from '@/components/controller/FillProperties'
import { LayerRow } from '@/components/controller/LayerRow'
import { PropertyRow } from '@/components/controller/PropertyRow'
import { ShapeProperties } from '@/components/controller/ShapeProperties'
import { TextProperties } from '@/components/controller/TextProperties'
import type { PropertyControls } from '@/components/controller/types'
import {
  DEFAULT_CIRCLE_LAYER,
  DEFAULT_FILL_LAYER,
  DEFAULT_RECT_LAYER,
  DEFAULT_TEXT_LAYER,
  type FillLayer,
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
  // Mirror so commit handlers (slider release, color blur) always read fresh state.
  const objectsRef = useRef<Layer[]>(objects)
  useEffect(() => { objectsRef.current = objects }, [objects])

  const selected = objects.find((o) => o.id === selectedId) ?? null

  // ── Local sync: state + canvas. Never touches WebSocket. ──────────────────
  const applyObjects = useCallback((next: Layer[]) => {
    setObjects(next)
    canvasRef.current?.applyScene({ objects: next })
  }, [])

  // ── Send: full scene every time. Caller decides when to commit. ───────────
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

  // ── Drag from canvas: state updates locally, send fires on drag-end. ──────
  const onPositionChange = useCallback((id: string, x: number, y: number) => {
    const next = objectsRef.current.map((o) => (o.id === id ? { ...o, x, y } : o))
    applyObjects(next)
    sendNow(next)
  }, [applyObjects, sendNow])

  const onObjectSelect = useCallback((id: string) => setSelectedId(id), [])

  // ── Layer mutation ────────────────────────────────────────────────────────
  // Permissive `patch` — caller is responsible for passing fields valid for the selected layer's type.
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

  const addText = () => addLayerAtEnd({ ...DEFAULT_TEXT_LAYER, id: crypto.randomUUID() } as TextLayer)
  const addRectangle = () => addLayerAtEnd({ ...DEFAULT_RECT_LAYER, id: crypto.randomUUID() } as ShapeLayer)
  const addCircle = () => addLayerAtEnd({ ...DEFAULT_CIRCLE_LAYER, id: crypto.randomUUID() } as ShapeLayer)

  // Fill layers default to the back of the stack so they act as backgrounds.
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

  const controls = useMemo<PropertyControls>(() => ({
    patch: patchSelected,
    sendNow,
    sendDebounced,
    sendCurrent,
    disabled: connState !== 'connected',
  }), [patchSelected, sendNow, sendDebounced, sendCurrent, connState])

  // Display layers in reverse z-order so top of panel = front of stack (Photoshop convention).
  const displayLayers = [...objects].map((layer, idx) => ({ layer, idx })).reverse()

  return (
    <main className="h-screen flex flex-col bg-linear-to-br from-slate-950 to-blue-950 overflow-hidden">
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
        <code className="ml-auto font-mono tracking-[0.2em] text-slate-300 text-sm">{code}</code>
        <span className={`text-xs px-2 py-0.5 rounded-full font-light ${STATUS_STYLES[connState]}`}>
          {connState}
        </span>
      </header>

      {errorMsg && (
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
      )}

      {connState === 'disconnected' && !errorMsg && (
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
      )}

      <div className="flex-1 min-h-0 flex flex-col">

        {/* Top row: canvas + layers panel */}
        <div className="flex-1 min-h-0 flex">

          <div className="flex-1 min-w-0 bg-black overflow-hidden">
            <PhaserCanvas
              ref={canvasRef}
              editable
              onPositionChange={onPositionChange}
              onObjectSelect={onObjectSelect}
              className="w-full h-full"
            />
          </div>

          <div className="w-56 shrink-0 border-l border-slate-800/60 bg-slate-950/60 flex flex-col">
            <div className="px-3 py-2 text-[10px] font-medium text-slate-500 border-b border-slate-800/60 uppercase tracking-wider">
              Layers
            </div>
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
          </div>
        </div>

        {/* Bottom row: properties + modifiers + animations + add */}
        <div className="h-56 flex border-t border-slate-800/60 shrink-0">

          {/* Properties — type-specific block + shared common rows */}
          <div className="w-56 shrink-0 border-r border-slate-800/60 bg-slate-950/40 flex flex-col">
            <div className="px-3 py-2 text-[10px] font-medium text-slate-500 border-b border-slate-800/60 uppercase tracking-wider">
              Properties
            </div>
            {selected ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2.5">
                {selected.type === 'text' && <TextProperties layer={selected} controls={controls} />}
                {selected.type === 'shape' && <ShapeProperties layer={selected} controls={controls} />}
                {selected.type === 'fill' && <FillProperties layer={selected} controls={controls} />}

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
                  <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{Math.round(selected.opacity * 100)}</span>
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
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
                <p className="text-slate-600 text-xs text-center font-light">
                  {objects.length === 0 ? 'Add a layer to get started.' : 'Select a layer to edit.'}
                </p>
              </div>
            )}
          </div>

          {/* Modifiers panel — placeholder for Blender-style modifier stack */}
          <div className="flex-1 min-w-0 border-r border-slate-800/60 flex flex-col">
            <div className="px-3 py-2 text-[10px] font-medium text-slate-500 border-b border-slate-800/60 uppercase tracking-wider">
              Modifiers
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {selected ? (
                selected.modifiers.length === 0 ? (
                  <p className="text-slate-700 text-[10px] px-1 py-1 italic">No modifiers.</p>
                ) : (
                  <div className="space-y-1">
                    {selected.modifiers.map((_m, i) => (
                      <div
                        key={i}
                        className="px-2 py-1 rounded bg-slate-800/40 border border-slate-700/20 text-xs text-slate-400 font-light"
                      >
                        Modifier #{i + 1}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <p className="text-slate-700 text-[10px] px-1 py-1">Select a layer.</p>
              )}
            </div>
          </div>

          {/* Animations panel — placeholder */}
          <div className="flex-1 min-w-0 border-r border-slate-800/60 flex flex-col">
            <div className="px-3 py-2 text-[10px] font-medium text-slate-500 border-b border-slate-800/60 uppercase tracking-wider">
              Animations
            </div>
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
          </div>

          <AddObjectPanel
            disabled={connState !== 'connected'}
            onAddText={addText}
            onAddRectangle={addRectangle}
            onAddCircle={addCircle}
            onAddFill={addFill}
          />

        </div>
      </div>
    </main>
  )
}
