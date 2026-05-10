import { Input } from '@/components/ui/input'
import { FONT_OPTIONS, type FontId, type TextLayer } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'

interface Props {
  layer: TextLayer
  controls: PropertyControls
}

export function TextProperties({ layer, controls }: Props) {
  const { patch, sendNow, sendDebounced, sendCurrent, disabled } = controls

  return (
    <>
      <Input
        value={layer.text}
        onChange={(e) => sendDebounced(patch({ text: e.target.value }))}
        placeholder="Text…"
        disabled={disabled}
        className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 font-light text-xs h-7 px-2"
      />

      <PropertyRow label="Font">
        <select
          value={layer.font_family}
          onChange={(e) => sendNow(patch({ font_family: e.target.value as FontId }))}
          disabled={disabled}
          className="flex-1 bg-slate-900 border border-slate-700 text-white text-[10px] rounded h-7 px-1.5 disabled:opacity-40"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
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
    </>
  )
}
