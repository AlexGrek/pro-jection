import type { LinesLayer } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'
import { IconMenu } from '@tabler/icons-react'

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
        <div className="flex flex-1 items-center gap-1.5">
          <input
            type="range"
            min={0}
            max={180}
            value={layer.angle}
            onChange={(e) => patch({ angle: Number(e.target.value) })}
            onPointerUp={sendCurrent}
            onKeyUp={sendCurrent}
            disabled={disabled}
            className="flex-1 accent-blue-500 touch-none min-w-0"
          />
          <div className="flex items-center shrink-0">
            <button
              onClick={() => sendNow(patch({ angle: 90 }))}
              disabled={disabled}
              title="Snap to Horizontal (90°)"
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
              <IconMenu size={13} />
            </button>
            <button
              onClick={() => sendNow(patch({ angle: 0 }))}
              disabled={disabled}
              title="Snap to Vertical (0°)"
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
              <IconMenu size={13} className="rotate-90" />
            </button>
          </div>
        </div>
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
