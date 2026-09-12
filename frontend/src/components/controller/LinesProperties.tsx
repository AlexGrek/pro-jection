import type { LinesLayer } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'

interface Props {
  layer: LinesLayer
  controls: PropertyControls
}

export function LinesProperties({ layer, controls }: Props) {
  const { patch, sendNow, sendCurrent, disabled } = controls

  return (
    <>
      <PropertyRow label="Fullscreen">
        <label className="flex items-center gap-1.5 text-slate-400 text-[10px] font-light cursor-pointer">
          <input
            type="checkbox"
            checked={layer.fullscreen}
            onChange={(e) => sendNow(patch({ fullscreen: e.target.checked }))}
            disabled={disabled}
            className="accent-blue-500"
          />
          Fill entire projection
        </label>
      </PropertyRow>

      <PropertyRow label="Angle">
        <input
          type="range"
          min={0}
          max={180}
          value={layer.angle}
          onChange={(e) => patch({ angle: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{layer.angle}°</span>
      </PropertyRow>

      <PropertyRow label="Line width">
        <input
          type="range"
          min={1}
          max={40}
          value={layer.line_width}
          onChange={(e) => patch({ line_width: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{layer.line_width}</span>
      </PropertyRow>

      <PropertyRow label="Spacing">
        <input
          type="range"
          min={10}
          max={400}
          value={layer.spacing}
          onChange={(e) => patch({ spacing: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">{layer.spacing}</span>
      </PropertyRow>
    </>
  )
}
