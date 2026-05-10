import type { ShapeLayer } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'

interface Props {
  layer: ShapeLayer
  controls: PropertyControls
}

export function ShapeProperties({ layer, controls }: Props) {
  const { patch, sendNow, sendCurrent, disabled } = controls

  return (
    <>
      <PropertyRow label="Shape">
        <select
          value={layer.shape}
          onChange={(e) => sendNow(patch({ shape: e.target.value as ShapeLayer['shape'] }))}
          disabled={disabled}
          className="flex-1 bg-slate-900 border border-slate-700 text-white text-[10px] rounded h-7 px-1.5 disabled:opacity-40"
        >
          <option value="rectangle">Rectangle</option>
          <option value="circle">Circle</option>
        </select>
      </PropertyRow>

      <PropertyRow label="Width">
        <input
          type="range"
          min={1}
          max={100}
          value={Math.round(layer.width * 100)}
          onChange={(e) => patch({ width: Number(e.target.value) / 100 })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{Math.round(layer.width * 100)}</span>
      </PropertyRow>

      <PropertyRow label="Height">
        <input
          type="range"
          min={1}
          max={100}
          value={Math.round(layer.height * 100)}
          onChange={(e) => patch({ height: Number(e.target.value) / 100 })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{Math.round(layer.height * 100)}</span>
      </PropertyRow>

      <PropertyRow label="Fill">
        <label className="flex items-center gap-1.5 text-slate-400 text-[10px] font-light cursor-pointer">
          <input
            type="checkbox"
            checked={layer.filled}
            onChange={(e) => sendNow(patch({ filled: e.target.checked }))}
            disabled={disabled}
            className="accent-blue-500"
          />
          Filled
        </label>
      </PropertyRow>

      {!layer.filled && (
        <PropertyRow label="Stroke">
          <input
            type="range"
            min={1}
            max={40}
            value={layer.stroke_width}
            onChange={(e) => patch({ stroke_width: Number(e.target.value) })}
            onPointerUp={sendCurrent}
            onKeyUp={sendCurrent}
            disabled={disabled}
            className="flex-1 accent-blue-500 touch-none"
          />
          <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{layer.stroke_width}</span>
        </PropertyRow>
      )}
    </>
  )
}
