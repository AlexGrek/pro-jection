import { useState, useEffect, useRef, useCallback } from 'react'
import { Maximize, Minimize } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { PhaserCanvas, type PhaserCanvasHandle } from '@/components/PhaserCanvas'
import type { Scene } from '@/lib/scene'

type ConnState = 'connecting' | 'connected' | 'disconnected' | 'error'

type ServerEvent =
  | { type: 'connected'; role: string; session_code: string }
  | { type: 'controller_status'; connected: boolean }

export function ProjectorPage() {
  const navigate = useNavigate()
  const { code } = useParams<{ code: string }>()
  const [connState, setConnState] = useState<ConnState>('connecting')
  const [controllerOnline, setControllerOnline] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const canvasRef = useRef<PhaserCanvasHandle>(null)

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const connect = useCallback(() => {
    wsRef.current?.close()
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/projector/${code}`)
    wsRef.current = ws
    setConnState('connecting')

    ws.onopen = () => setConnState('connected')

    ws.onmessage = (e) => {
      const data: ServerEvent | Scene = JSON.parse(e.data)
      if ('type' in data) {
        if (data.type === 'controller_status') setControllerOnline(data.connected)
      } else {
        canvasRef.current?.applyScene(data as Scene)
      }
    }

    ws.onclose = () => setConnState('disconnected')
  }, [code])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  // Auto-reconnect — projector should always be up.
  useEffect(() => {
    if (connState !== 'disconnected') return
    const t = setTimeout(connect, 3000)
    return () => clearTimeout(t)
  }, [connState, connect])

  return (
    <main
      className="w-screen h-screen bg-black overflow-hidden relative cursor-default"
      onDoubleClick={() => navigate('/')}
      title="Double-click to go back"
    >
      <PhaserCanvas ref={canvasRef} className="w-full h-full" />

      {/* Fullscreen toggle — top-right corner */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 p-1.5 rounded text-white/20 hover:text-white/60 transition-colors z-10"
        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>

      {/* Minimal HUD — top-right, shifted left of the fullscreen button */}
      <div className="absolute top-0 right-9 flex items-center gap-3 px-4 py-3 text-xs font-light select-none pointer-events-none">
        <span className={`flex items-center gap-1.5 ${controllerOnline ? 'text-slate-700' : 'text-slate-800'}`}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${controllerOnline ? 'bg-green-700' : 'bg-slate-800'}`} />
          ctrl
        </span>
        <span className={`flex items-center gap-1.5 ${connState === 'connected' ? 'text-slate-700' : 'text-slate-800'}`}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${
            connState === 'connecting' ? 'bg-yellow-800' : connState === 'connected' ? 'bg-slate-700' : 'bg-red-900'
          }`} />
          ws
        </span>
        <code className="font-mono tracking-[0.25em] text-slate-800">{code}</code>
      </div>
    </main>
  )
}
