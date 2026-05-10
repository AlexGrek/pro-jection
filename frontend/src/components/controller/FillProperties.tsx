import type { ColorStop, FillKind, FillLayer } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'

interface Props {
  layer: FillLayer
  controls: PropertyControls
}

export function FillProperties({ layer, controls }: Props) {
  const { patch, sendNow, sendCurrent, disabled } = controls

  const patchStop = (i: number, p: Partial<ColorStop>) => {
    const stops = layer.stops.map((s, idx) => (idx === i ? { ...s, ...p } : s))
    return patch({ stops })
  }

  return (
    <>
      <PropertyRow label="Fill">
        <select
          value={layer.fill}
          onChange={(e) => sendNow(patch({ fill: e.target.value as FillKind }))}
          disabled={disabled}
          className="flex-1 bg-slate-900 border border-slate-700 text-white text-[10px] rounded h-7 px-1.5 disabled:opacity-40"
        >
          <option value="solid">Solid</option>
          <option value="linear">Linear</option>
        </select>
      </PropertyRow>

      {layer.fill === 'linear' && (
        <PropertyRow label="Angle">
          <input
            type="range"
            min={0}
            max={360}
            value={layer.angle}
            onChange={(e) => patch({ angle: Number(e.target.value) })}
            onPointerUp={sendCurrent}
            onKeyUp={sendCurrent}
            disabled={disabled}
            className="flex-1 accent-blue-500 touch-none"
          />
          <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{layer.angle}°</span>
        </PropertyRow>
      )}

      {layer.stops.map((stop, i) => {
        if (layer.fill === 'solid' && i > 0) return null
        return (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[10px] w-10 shrink-0">Stop {i + 1}</span>
            <input
              type="color"
              value={stop.color}
              onChange={(e) => patchStop(i, { color: e.target.value })}
              onBlur={sendCurrent}
              disabled={disabled}
              className="w-7 h-6 rounded cursor-pointer border border-slate-700 bg-transparent disabled:opacity-40 shrink-0"
            />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(stop.alpha * 100)}
              onChange={(e) => patchStop(i, { alpha: Number(e.target.value) / 100 })}
              onPointerUp={sendCurrent}
              onKeyUp={sendCurrent}
              disabled={disabled}
              className="flex-1 min-w-0 accent-blue-500 touch-none"
              title="Alpha"
            />
            <span className="text-slate-400 text-[10px] w-6 text-right shrink-0">{Math.round(stop.alpha * 100)}</span>
          </div>
        )
      })}
    </>
  )
}
