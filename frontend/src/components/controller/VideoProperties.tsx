import { useRef, useState } from 'react'
import type { VideoLayer } from '@/lib/scene'
import type { PropertyControls } from './types'
import { PropertyRow } from './PropertyRow'

interface Props {
  layer: VideoLayer
  controls: PropertyControls
}

export function VideoProperties({ layer, controls }: Props) {
  const { patch, sendNow, sendCurrent, disabled } = controls
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setUploading(true)
    setError(null)

    const body = new FormData()
    body.append('file', file)

    try {
      const resp = await fetch('/api/useruploads', { method: 'POST', body })
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`)
      const { url } = (await resp.json()) as { url: string }
      sendNow(patch({ url }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <PropertyRow label="Video">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {layer.url ? (
            <span className="text-slate-500 text-[10px] truncate flex-1 font-mono">uploaded</span>
          ) : (
            <span className="text-slate-600 text-[10px] flex-1 italic">no video</span>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
            className="px-2 py-1 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {uploading ? 'Uploading…' : layer.url ? 'Replace' : 'Upload'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/webm,video/ogg,video/quicktime"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </PropertyRow>

      {error && (
        <p className="text-red-400 text-[10px] px-1 -mt-1">{error}</p>
      )}

      <PropertyRow label="Width">
        <input
          type="range"
          min={5}
          max={100}
          value={Math.round(layer.width * 100)}
          onChange={(e) => patch({ width: Number(e.target.value) / 100 })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">
          {Math.round(layer.width * 100)}%
        </span>
      </PropertyRow>

      <PropertyRow label="Loop">
        <input
          type="checkbox"
          checked={layer.loop}
          onChange={(e) => sendNow(patch({ loop: e.target.checked }))}
          disabled={disabled}
          className="accent-blue-500"
        />
      </PropertyRow>

      <PropertyRow label="Muted">
        <input
          type="checkbox"
          checked={layer.muted}
          onChange={(e) => sendNow(patch({ muted: e.target.checked }))}
          disabled={disabled}
          className="accent-blue-500"
        />
      </PropertyRow>
    </>
  )
}
