import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconDeviceGamepad2, IconArrowLeft, IconSend, IconRefresh, IconLetterT } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhaserCanvas, type PhaserCanvasHandle } from '@/components/PhaserCanvas'
import { DEFAULT_TEXT_LAYER, type Layer, type Scene, type TextLayer } from '@/lib/scene'

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

function layerLabel(layer: Layer): string {
  if (layer.type === 'text') return layer.text || '(empty)'
  return layer.type
}

export function ControllerPage() {
  const navigate = useNavigate()
  const { code } = useParams<{ code: string }>()

  const [connState, setConnState] = useState<ConnState>('connecting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Local log — accumulated client-side; not persisted by the server.
  const [log, setLog] = useState<Scene[]>([])

  const [objects, setObjects] = useState<Layer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const canvasRef = useRef<PhaserCanvasHandle>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const selected = objects.find((o) => o.id === selectedId) ?? null

  const applyObjects = useCallback((next: Layer[]) => {
    setObjects(next)
    canvasRef.current?.applyScene({ objects: next })
  }, [])

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
        // Server control event
        if (data.type === 'error') {
          setErrorMsg(data.message)
          setConnState('error')
        }
        // 'connected' and 'controller_status' need no action here
      } else {
        // Raw scene replayed on reconnect — restore canvas state.
        applyObjects((data as Scene).objects)
      }
    }

    ws.onclose = () => setConnState((s) => (s === 'error' ? 'error' : 'disconnected'))
  }, [code, applyObjects])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const onPositionChange = useCallback((id: string, x: number, y: number) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, x, y } : o)))
  }, [])

  const onObjectSelect = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  const patchSelected = (patch: Partial<Omit<TextLayer, 'id' | 'type'>>) => {
    if (!selectedId) return
    const next = objects.map((o) =>
      o.id === selectedId && o.type === 'text' ? { ...o, ...patch } : o,
    )
    applyObjects(next)
  }

  const selectLayer = (id: string) => {
    setSelectedId(id)
    canvasRef.current?.selectObject(id)
  }

  const addTextObject = () => {
    const id = crypto.randomUUID()
    const newLayer: TextLayer = { ...DEFAULT_TEXT_LAYER, id }
    const next = [...objects, newLayer]
    applyObjects(next)
    setSelectedId(id)
    canvasRef.current?.selectObject(id)
  }

  const sendMessage = () => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    if (!objects.some((o) => o.type === 'text' && (o as TextLayer).text.trim())) return
    const scene: Scene = { objects }
    wsRef.current.send(JSON.stringify(scene))
    setLog((prev) => [...prev, scene])
  }

  const canSend =
    connState === 'connected' &&
    objects.some((o) => o.type === 'text' && (o as TextLayer).text.trim().length > 0)

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
          <div className="w-48 shrink-0 border-l border-slate-800/60 bg-slate-950/60 flex flex-col">
            <div className="px-3 py-2 text-[10px] font-medium text-slate-500 border-b border-slate-800/60 uppercase tracking-wider">
              Layers
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {objects.length === 0 && (
                <p className="text-slate-700 text-[10px] px-2 py-1">No layers yet.</p>
              )}
              {objects.map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => selectLayer(layer.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border text-left cursor-default transition-colors ${
                    layer.id === selectedId
                      ? 'bg-blue-500/10 border-blue-500/30 text-white'
                      : 'bg-slate-800/30 border-slate-700/20 text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <IconLetterT size={11} className="shrink-0" />
                  <span className="text-xs font-light truncate flex-1">{layerLabel(layer)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom row: props + log + add */}
        <div className="h-56 flex border-t border-slate-800/60 shrink-0">

          {/* Selected object properties */}
          <div className="w-48 shrink-0 border-r border-slate-800/60 bg-slate-950/40 flex flex-col">
            <div className="px-3 py-2 text-[10px] font-medium text-slate-500 border-b border-slate-800/60 uppercase tracking-wider">
              Properties
            </div>
            {selected && selected.type === 'text' ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2.5">
                <Input
                  value={selected.text}
                  onChange={(e) => patchSelected({ text: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Text…"
                  disabled={connState !== 'connected'}
                  className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 font-light text-xs h-7 px-2"
                />

                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-[10px] w-10 shrink-0">Size</span>
                  <input
                    type="range"
                    min={32}
                    max={200}
                    value={selected.font_size}
                    onChange={(e) => patchSelected({ font_size: Number(e.target.value) })}
                    disabled={connState !== 'connected'}
                    className="flex-1 accent-blue-500"
                  />
                  <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{selected.font_size}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-[10px] w-10 shrink-0">Color</span>
                  <input
                    type="color"
                    value={selected.color}
                    onChange={(e) => patchSelected({ color: e.target.value })}
                    disabled={connState !== 'connected'}
                    className="w-7 h-6 rounded cursor-pointer border border-slate-700 bg-transparent disabled:opacity-40"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-[10px] w-10 shrink-0">Pos</span>
                  <span className="text-slate-400 text-[10px] font-mono">
                    {selected.x.toFixed(2)}, {selected.y.toFixed(2)}
                  </span>
                </div>

                <div className="mt-auto">
                  <Button
                    onClick={sendMessage}
                    disabled={!canSend}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 h-7 text-xs gap-1.5"
                  >
                    <IconSend size={13} stroke={1.5} />
                    Send
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
                <p className="text-slate-600 text-xs text-center font-light">
                  {objects.length === 0 ? 'Add a layer to get started.' : 'Select a layer to edit.'}
                </p>
                {objects.length > 0 && (
                  <Button
                    onClick={sendMessage}
                    disabled={!canSend}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 h-7 text-xs gap-1.5"
                  >
                    <IconSend size={13} stroke={1.5} />
                    Send
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Log */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="px-3 py-2 text-[10px] font-medium text-slate-500 border-b border-slate-800/60 uppercase tracking-wider">
              Log
            </div>
            <div ref={logRef} className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
              {log.length === 0 ? (
                <p className="text-slate-700 text-xs font-light px-1 py-1">No messages yet.</p>
              ) : (
                log.map((scene, i) => {
                  const firstText = scene.objects.find((o) => o.type === 'text') as TextLayer | undefined
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-2 py-1 rounded bg-slate-800/40 border border-slate-700/20"
                    >
                      {firstText && (
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: firstText.color }}
                        />
                      )}
                      <span className="text-white font-light text-xs truncate flex-1">
                        {firstText?.text ?? '(empty)'}
                        {scene.objects.length > 1 && (
                          <span className="text-slate-600 ml-1">+{scene.objects.length - 1}</span>
                        )}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Add object toolbox */}
          <div className="w-48 shrink-0 border-l border-slate-800/60 bg-slate-950/40 flex flex-col">
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
