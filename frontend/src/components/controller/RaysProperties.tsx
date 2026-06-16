import type { RaysLayer } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'

interface Props {
  layer: RaysLayer
  controls: PropertyControls
}

export function RaysProperties({ layer, controls }: Props) {
  const { patch, sendNow, sendCurrent, disabled } = controls

  return (
    <>
      <PropertyRow label="Shape">
        <select
          value={layer.shape}
          onChange={(e) => sendNow(patch({ shape: e.target.value as RaysLayer['shape'] }))}
          disabled={disabled}
          className="flex-1 bg-slate-900 border border-slate-700 text-white text-[10px] rounded h-7 px-1.5 disabled:opacity-40"
        >
          <option value="circle">Circle</option>
          <option value="square">Square</option>
        </select>
      </PropertyRow>

      <PropertyRow label="Columns">
        <input
          type="range"
          min={1}
          max={12}
          value={layer.columns}
          onChange={(e) => patch({ columns: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{layer.columns}</span>
      </PropertyRow>

      <PropertyRow label="Rows">
        <input
          type="range"
          min={1}
          max={12}
          value={layer.rows}
          onChange={(e) => patch({ rows: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{layer.rows}</span>
      </PropertyRow>

      <PropertyRow label="Dot Size">
        <input
          type="range"
          min={5}
          max={100}
          value={Math.round(layer.dot_size * 100)}
          onChange={(e) => patch({ dot_size: Number(e.target.value) / 100 })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">
          {Math.round(layer.dot_size * 100)}%
        </span>
      </PropertyRow>

      <PropertyRow label="Fullscreen">
        <label className="flex items-center gap-1.5 text-slate-400 text-[10px] font-light cursor-pointer">
          <input
            type="checkbox"
            checked={layer.fullscreen}
            onChange={(e) => sendNow(patch({ fullscreen: e.target.checked }))}
            disabled={disabled}
            className="accent-blue-500"
          />
          Fill canvas
        </label>
      </PropertyRow>

      {!layer.fullscreen && (
        <PropertyRow label="Cell Size">
          <input
            type="range"
            min={2}
            max={50}
            value={Math.round(layer.cell_size * 100)}
            onChange={(e) => patch({ cell_size: Number(e.target.value) / 100 })}
            onPointerUp={sendCurrent}
            onKeyUp={sendCurrent}
            disabled={disabled}
            className="flex-1 accent-blue-500 touch-none"
          />
          <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">
            {Math.round(layer.cell_size * 100)}%
          </span>
        </PropertyRow>
      )}
    </>
  )
}
