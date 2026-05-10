import type { ArrayModifier, Layer } from '@/lib/scene'
import { getArrayModifier } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'

interface Props {
  layer: Layer
  controls: PropertyControls
}

const DEFAULT_ARRAY: ArrayModifier = {
  type: 'array',
  count: 3,
  offset_x: 1.1,
  offset_y: 0,
  direction: 'x',
  relative: true,
}

const DIR_LABELS: { value: ArrayModifier['direction']; label: string }[] = [
  { value: 'x', label: 'X' },
  { value: 'y', label: 'Y' },
  { value: 'both', label: 'XY' },
]

export function ArrayModifierPanel({ layer, controls }: Props) {
  const { patch, sendNow, sendCurrent, disabled } = controls
  const arr = getArrayModifier(layer)

  const patchArr = (update: Partial<ArrayModifier>): Layer[] => {
    const updated = { ...arr!, ...update }
    const newModifiers = layer.modifiers.map((m) => (m.type === 'array' ? updated : m))
    return patch({ modifiers: newModifiers })
  }

  const addArray = () => {
    const newModifiers = [...layer.modifiers, { ...DEFAULT_ARRAY }]
    sendNow(patch({ modifiers: newModifiers }))
  }

  const removeArray = () => {
    const newModifiers = layer.modifiers.filter((m) => m.type !== 'array')
    sendNow(patch({ modifiers: newModifiers }))
  }

  if (!arr) {
    return (
      <div className="p-2">
        <button
          onClick={addArray}
          disabled={disabled}
          className="w-full text-[10px] text-slate-400 hover:text-white border border-dashed border-slate-700 hover:border-slate-500 rounded px-2 py-1.5 transition-colors disabled:opacity-40"
        >
          + Array
        </button>
      </div>
    )
  }

  // In relative mode, offset values represent multiples of object size (-3x to 3x).
  // In absolute mode, they represent canvas fractions (-1 to 1).
  const sliderMin = arr.relative ? -300 : -100
  const sliderMax = arr.relative ? 300 : 100

  const toSlider = (v: number) => Math.round(v * 100)
  const fromSlider = (s: number) => s / 100

  const fmtOffset = (v: number) =>
    arr.relative ? v.toFixed(2) + 'x' : String(Math.round(v * 100))

  // Relative mode only makes sense for text/shape — fill layers have no meaningful size.
  const canRelative = layer.type !== 'fill'

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-slate-300 uppercase tracking-wider">Array</span>
        <button
          onClick={removeArray}
          disabled={disabled}
          className="text-[10px] text-slate-600 hover:text-red-400 transition-colors px-1 disabled:opacity-40"
          title="Remove modifier"
        >
          ×
        </button>
      </div>

      <PropertyRow label="Count">
        <input
          type="range"
          min={2}
          max={20}
          value={arr.count}
          onChange={(e) => sendNow(patchArr({ count: Number(e.target.value) }))}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-5 text-right shrink-0">{arr.count}</span>
      </PropertyRow>

      <PropertyRow label="Dir">
        <div className="flex gap-1">
          {DIR_LABELS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => sendNow(patchArr({ direction: value }))}
              disabled={disabled}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors disabled:opacity-40 ${
                arr.direction === value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </PropertyRow>

      {canRelative && (
        <PropertyRow label="Rel">
          <label className="flex items-center gap-1.5 text-slate-400 text-[10px] cursor-pointer">
            <input
              type="checkbox"
              checked={arr.relative}
              onChange={(e) => sendNow(patchArr({ relative: e.target.checked }))}
              disabled={disabled}
              className="accent-blue-500"
            />
            Object size
          </label>
        </PropertyRow>
      )}

      {arr.direction !== 'y' && (
        <PropertyRow label="Off X">
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            value={toSlider(arr.offset_x)}
            onChange={(e) => patchArr({ offset_x: fromSlider(Number(e.target.value)) })}
            onPointerUp={sendCurrent}
            onKeyUp={sendCurrent}
            disabled={disabled}
            className="flex-1 accent-blue-500 touch-none"
          />
          <span className="text-slate-400 text-[10px] w-8 text-right shrink-0">
            {fmtOffset(arr.offset_x)}
          </span>
        </PropertyRow>
      )}

      {arr.direction !== 'x' && (
        <PropertyRow label="Off Y">
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            value={toSlider(arr.offset_y)}
            onChange={(e) => patchArr({ offset_y: fromSlider(Number(e.target.value)) })}
            onPointerUp={sendCurrent}
            onKeyUp={sendCurrent}
            disabled={disabled}
            className="flex-1 accent-blue-500 touch-none"
          />
          <span className="text-slate-400 text-[10px] w-8 text-right shrink-0">
            {fmtOffset(arr.offset_y)}
          </span>
        </PropertyRow>
      )}
    </div>
  )
}
