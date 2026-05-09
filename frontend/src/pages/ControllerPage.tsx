import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  IconDeviceGamepad2,
  IconArrowLeft,
  IconRefresh,
  IconLetterT,
  IconChevronUp,
  IconChevronDown,
  IconChevronsUp,
  IconChevronsDown,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhaserCanvas, type PhaserCanvasHandle } from '@/components/PhaserCanvas'
import { DEFAULT_TEXT_LAYER, FONT_OPTIONS, type FontId, type Layer, type Scene, type TextLayer } from '@/lib/scene'

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

function layerLabel(layer: Layer): string {
  if (layer.type === 'text') return layer.text || '(empty)'
  return layer.type
}

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

  const onObjectSelect = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  // Returns the new objects array so callers can decide how/when to send.
  const patchSelected = (patch: Partial<Omit<TextLayer, 'id' | 'type'>>): Layer[] => {
    if (!selectedId) return objectsRef.current
    const next = objectsRef.current.map((o) =>
      o.id === selectedId && o.type === 'text' ? { ...o, ...patch } : o,
    )
    applyObjects(next)
    return next
  }

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

  const addTextObject = () => {
    const id = crypto.randomUUID()
    const newLayer: TextLayer = { ...DEFAULT_TEXT_LAYER, id }
    const next = [...objectsRef.current, newLayer]
    applyObjects(next)
    setSelectedId(id)
    canvasRef.current?.selectObject(id)
    sendNow(next)
  }

  // Display layers in reverse z-order so top of panel = front of stack (Photoshop convention).
  const displayLayers = [...objects].map((layer, idx) => ({ layer, idx })).reverse()

  return (
    <main className="h-screen flex flex-col bg-linear-to-br from-slate-950 to-blue-950 overflow-hidden">
      {/* Header */}
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

      {/* Error banner */}
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

      {/* Main content */}
      <div className="flex-1 min-h-0 flex flex-col">

        {/* Top row: canvas + layers panel */}
        <div className="flex-1 min-h-0 flex">

          {/* Phaser canvas */}
          <div className="flex-1 min-w-0 bg-black overflow-hidden">
            <PhaserCanvas
              ref={canvasRef}
              editable
              onPositionChange={onPositionChange}
              onObjectSelect={onObjectSelect}
              className="w-full h-full"
            />
          </div>

          {/* Layers toolbox */}
          <div className="w-56 shrink-0 border-l border-slate-800/60 bg-slate-950/60 flex flex-col">
            <div className="px-3 py-2 text-[10px] font-medium text-slate-500 border-b border-slate-800/60 uppercase tracking-wider">
              Layers
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {objects.length === 0 && (
                <p className="text-slate-700 text-[10px] px-2 py-1">No layers yet.</p>
              )}
              {displayLayers.map(({ layer, idx }) => {
                const isFront = idx === objects.length - 1
                const isBack = idx === 0
                const isSelected = layer.id === selectedId
                return (
                  <div
                    key={layer.id}
                    className={`flex items-center gap-0.5 pl-2 pr-1 py-1 rounded border transition-colors ${
                      isSelected
                        ? 'bg-blue-500/10 border-blue-500/30 text-white'
                        : 'bg-slate-800/30 border-slate-700/20 text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <button
                      onClick={() => selectLayer(layer.id)}
                      className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
                    >
                      <IconLetterT size={11} className="shrink-0" />
                      <span className="text-xs font-light truncate">{layerLabel(layer)}</span>
                    </button>
                    <ReorderBtn
                      label="Bring to front"
                      icon={<IconChevronsUp size={12} stroke={1.5} />}
                      disabled={isFront}
                      onClick={() => moveLayer(idx, objects.length - 1)}
                    />
                    <ReorderBtn
                      label="Forward"
                      icon={<IconChevronUp size={12} stroke={1.5} />}
                      disabled={isFront}
                      onClick={() => moveLayer(idx, idx + 1)}
                    />
                    <ReorderBtn
                      label="Backward"
                      icon={<IconChevronDown size={12} stroke={1.5} />}
                      disabled={isBack}
                      onClick={() => moveLayer(idx, idx - 1)}
                    />
                    <ReorderBtn
                      label="Send to back"
                      icon={<IconChevronsDown size={12} stroke={1.5} />}
                      disabled={isBack}
                      onClick={() => moveLayer(idx, 0)}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Bottom row: properties + modifiers + animations + add */}
        <div className="h-56 flex border-t border-slate-800/60 shrink-0">

          {/* Selected object properties */}
          <div className="w-56 shrink-0 border-r border-slate-800/60 bg-slate-950/40 flex flex-col">
            <div className="px-3 py-2 text-[10px] font-medium text-slate-500 border-b border-slate-800/60 uppercase tracking-wider">
              Properties
            </div>
            {selected && selected.type === 'text' ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2.5">
                {/* Text — debounced send */}
                <Input
                  value={selected.text}
                  onChange={(e) => sendDebounced(patchSelected({ text: e.target.value }))}
                  placeholder="Text…"
                  disabled={connState !== 'connected'}
                  className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 font-light text-xs h-7 px-2"
                />

                {/* Font — immediate send */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-[10px] w-10 shrink-0">Font</span>
                  <select
                    value={selected.font_family}
                    onChange={(e) => sendNow(patchSelected({ font_family: e.target.value as FontId }))}
                    disabled={connState !== 'connected'}
                    className="flex-1 bg-slate-900 border border-slate-700 text-white text-[10px] rounded h-7 px-1.5 disabled:opacity-40"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>

                {/* Size — preview while dragging, send on release */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-[10px] w-10 shrink-0">Size</span>
                  <input
                    type="range"
                    min={32}
                    max={200}
                    value={selected.font_size}
                    onChange={(e) => patchSelected({ font_size: Number(e.target.value) })}
                    onPointerUp={() => sendNow(objectsRef.current)}
                    onKeyUp={() => sendNow(objectsRef.current)}
                    disabled={connState !== 'connected'}
                    className="flex-1 accent-blue-500 touch-none"
                  />
                  <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{selected.font_size}</span>
                </div>

                {/* Color — preview on input, send on commit */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-[10px] w-10 shrink-0">Color</span>
                  <input
                    type="color"
                    value={selected.color}
                    onChange={(e) => patchSelected({ color: e.target.value })}
                    onBlur={() => sendNow(objectsRef.current)}
                    disabled={connState !== 'connected'}
                    className="w-7 h-6 rounded cursor-pointer border border-slate-700 bg-transparent disabled:opacity-40"
                  />
                </div>

                {/* Opacity — preview while dragging, send on release */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-[10px] w-10 shrink-0">Alpha</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(selected.opacity * 100)}
                    onChange={(e) => patchSelected({ opacity: Number(e.target.value) / 100 })}
                    onPointerUp={() => sendNow(objectsRef.current)}
                    onKeyUp={() => sendNow(objectsRef.current)}
                    disabled={connState !== 'connected'}
                    className="flex-1 accent-blue-500 touch-none"
                  />
                  <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{Math.round(selected.opacity * 100)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-[10px] w-10 shrink-0">Pos</span>
                  <span className="text-slate-400 text-[10px] font-mono">
                    {selected.x.toFixed(2)}, {selected.y.toFixed(2)}
                  </span>
                </div>
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

          {/* Add object toolbox */}
          <div className="w-48 shrink-0 bg-slate-950/40 flex flex-col">
            <div className="px-3 py-2 text-[10px] font-medium text-slate-500 border-b border-slate-800/60 uppercase tracking-wider">
              Add Object
            </div>
            <div className="p-2 space-y-1">
              <button
                onClick={addTextObject}
                disabled={connState !== 'connected'}
                className="w-full flex items-center gap-2 px-2 py-2 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
              >
                <IconLetterT size={13} className="shrink-0" />
                Text
              </button>
            </div>
          </div>

        </div>
      </div>
    </main>
  )
}

interface ReorderBtnProps {
  label: string
  icon: React.ReactNode
  disabled: boolean
  onClick: () => void
}

function ReorderBtn({ label, icon, disabled, onClick }: ReorderBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="shrink-0 p-0.5 rounded text-slate-500 hover:text-white hover:bg-slate-700/60 disabled:opacity-20 disabled:hover:text-slate-500 disabled:hover:bg-transparent disabled:cursor-not-allowed"
    >
      {icon}
    </button>
  )
}
