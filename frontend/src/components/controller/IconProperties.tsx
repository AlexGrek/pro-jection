import { ALL_PACKS } from '@/lib/icons'
import type { IconLayer } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'

interface Props {
  layer: IconLayer
  controls: PropertyControls
}

export function IconProperties({ layer, controls }: Props) {
  const { patch, sendNow, sendCurrent, disabled } = controls

  return (
    <>
      <PropertyRow label="Icon">
        <select
          value={layer.icon_id}
          onChange={(e) => sendNow(patch({ icon_id: e.target.value }))}
          disabled={disabled}
          className="flex-1 bg-slate-900 border border-slate-700 text-white text-[10px] rounded h-7 px-1.5 disabled:opacity-40"
        >
          {ALL_PACKS.map((pack) => (
            <optgroup key={pack.id} label={pack.name}>
              {Object.entries(pack.icons).map(([key, def]) => (
                <option key={key} value={`${pack.id}:${key}`}>
                  {def.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
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
    </>
  )
}
