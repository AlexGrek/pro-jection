import { useState, useCallback } from 'react'
import { findIconDef } from '@/lib/icons'
import type { IconLayer } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'
import { IconPickerModal } from './IconPickerModal'

interface Props {
  layer: IconLayer
  controls: PropertyControls
}

export function IconProperties({ layer, controls }: Props) {
  const { patch, sendNow, sendCurrent, disabled } = controls
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleSelect = useCallback(
    (iconId: string) => {
      sendNow(patch({ icon_id: iconId }))
    },
    [patch, sendNow],
  )

  const currentIcon = findIconDef(layer.icon_id)

  return (
    <>
      <PropertyRow label="Icon">
        <button
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          className="flex items-center gap-2 flex-1 bg-slate-900 border border-slate-700 text-white text-[10px] rounded h-7 px-2 hover:bg-slate-800 disabled:opacity-40 transition-colors min-w-0"
        >
          {currentIcon ? (
            <>
              <svg
                viewBox={`0 0 ${currentIcon.pack.viewBox} ${currentIcon.pack.viewBox}`}
                className="w-4 h-4 shrink-0"
                stroke="currentColor"
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {currentIcon.def.paths.map((p, i) => (
                  <path
                    key={i}
                    d={p.d}
                    fill={p.fill ? 'currentColor' : 'none'}
                    stroke={p.fill ? 'none' : 'currentColor'}
                  />
                ))}
              </svg>
              <span className="truncate">{currentIcon.def.label}</span>
            </>
          ) : (
            <span className="text-slate-500">Select icon…</span>
          )}
          <svg
            className="w-3 h-3 shrink-0 ml-auto text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6l6 -6" />
          </svg>
        </button>
      </PropertyRow>

      <PropertyRow label="Size">
        <input
          type="range"
          min={1}
          max={50}
          value={Math.round(layer.size * 100)}
          onChange={(e) => patch({ size: Number(e.target.value) / 100 })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">
          {Math.round(layer.size * 100)}
        </span>
      </PropertyRow>

      <PropertyRow label="Stroke">
        <input
          type="range"
          min={0.5}
          max={8}
          step={0.5}
          value={layer.stroke_width}
          onChange={(e) => patch({ stroke_width: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">
          {layer.stroke_width}
        </span>
      </PropertyRow>

      {pickerOpen && (
        <IconPickerModal
          currentIconId={layer.icon_id}
          onSelect={handleSelect}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}
