import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

export default function WsTestPage() {
  const [messages, setMessages] = useState<string[]>([])
  const [input, setInput] = useState('hello')
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/echo`)
    wsRef.current = ws

    ws.onopen = () => setStatus('open')
    ws.onclose = () => setStatus('closed')
    ws.onmessage = (e) => setMessages((prev) => [...prev, String(e.data)])

    return () => ws.close()
  }, [])

  const send = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(input)
    }
  }

  return (
    <main className="p-8 font-sans max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">WebSocket echo test</h1>
      <p className="mb-4 text-sm text-gray-600">
        Status: <span className="font-mono">{status}</span>
      </p>

      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          onClick={send}
          disabled={status !== 'open'}
        >
          Send
        </button>
      </div>

      <ul className="space-y-1">
        {messages.map((m, i) => (
          <li key={i} className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
            {m}
          </li>
        ))}
      </ul>

      <p className="mt-6">
        <Link className="text-blue-600 underline" to="/">← back</Link>
      </p>
    </main>
  )
}
