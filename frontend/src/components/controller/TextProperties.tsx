import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { FONT_CSS, FONT_OPTIONS, type FontId, type TextLayer } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import { FontPickerModal } from './FontPickerModal'
import type { PropertyControls } from './types'

interface Props {
  layer: TextLayer
  controls: PropertyControls
  autoFocus?: boolean
}

export function TextProperties({ layer, controls, autoFocus }: Props) {
  const { patch, sendNow, sendDebounced, sendCurrent, disabled } = controls
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleSelect = useCallback(
    (fontId: FontId) => {
      sendNow(patch({ font_family: fontId }))
    },
    [patch, sendNow],
  )

  const currentFont = FONT_OPTIONS.find((f) => f.id === layer.font_family)

  return (
    <>
      <Input
        autoFocus={autoFocus}
        value={layer.text}
        onChange={(e) => sendDebounced(patch({ text: e.target.value }))}
        placeholder="Text…"
        disabled={disabled}
        className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 font-light text-xs h-7 px-2"
      />

      <PropertyRow label="Font">
        <button
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          className="flex items-center gap-2 flex-1 bg-slate-900 border border-slate-700 text-white text-[10px] rounded h-7 px-2 hover:bg-slate-800 disabled:opacity-40 transition-colors min-w-0"
        >
          <span
            style={{ fontFamily: currentFont ? FONT_CSS[currentFont.id as FontId] : undefined }}
            className="text-sm leading-none shrink-0"
          >
            Aa
          </span>
          <span className="truncate">{currentFont?.label ?? 'Select font…'}</span>
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
          min={32}
          max={200}
          value={layer.font_size}
          onChange={(e) => patch({ font_size: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{layer.font_size}</span>
      </PropertyRow>

      {pickerOpen && (
        <FontPickerModal
          currentFontId={layer.font_family ?? 'outfit'}
          onSelect={handleSelect}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}
