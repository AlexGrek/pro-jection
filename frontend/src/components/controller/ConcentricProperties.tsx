import type { ConcentricLayer } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'

interface Props {
  layer: ConcentricLayer
  controls: PropertyControls
}

export function ConcentricProperties({ layer, controls }: Props) {
  const { patch, sendNow, sendCurrent, disabled } = controls

  return (
    <>
      <PropertyRow label="Shape">
        <select
          value={layer.shape}
          onChange={(e) => sendNow(patch({ shape: e.target.value as ConcentricLayer['shape'] }))}
          disabled={disabled}
          className="flex-1 bg-slate-900 border border-slate-700 text-white text-[10px] rounded h-7 px-1.5 disabled:opacity-40"
        >
          <option value="circle">Circle</option>
          <option value="square">Square</option>
          <option value="triangle">Triangle</option>
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

      <PropertyRow label="Count">
        <input
          type="range"
          min={1}
          max={40}
          value={layer.count}
          onChange={(e) => patch({ count: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{layer.count}</span>
      </PropertyRow>

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
    </>
  )
}
