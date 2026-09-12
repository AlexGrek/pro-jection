import type { ConcentricLayer } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'
import { CANVAS_W, CANVAS_H } from '@/lib/phaser/constants'

interface Props {
  layer: ConcentricLayer
  controls: PropertyControls
}

export function ConcentricProperties({ layer, controls }: Props) {
  const { patch, sendNow, sendCurrent, disabled } = controls
  
  // Square and Circle have a physical aspect ratio of 1:1 (factor = 1).
  // An equilateral triangle has a height of sqrt(3)/2 times its width (factor ≈ 0.866).
  const shapeFactor = layer.shape === 'triangle' ? Math.sqrt(3) / 2 : 1
  const aspectMultiplier = (CANVAS_W / CANVAS_H) * shapeFactor

  return (
    <>
      <PropertyRow label="Shape">
        <select
          value={layer.shape}
          onChange={(e) => {
            const newShape = e.target.value as ConcentricLayer['shape']
            if (layer.aspect_locked) {
              const newFactor = newShape === 'triangle' ? Math.sqrt(3) / 2 : 1
              const newMultiplier = (CANVAS_W / CANVAS_H) * newFactor
              sendNow(patch({ shape: newShape, height: layer.width * newMultiplier }))
            } else {
              sendNow(patch({ shape: newShape }))
            }
          }}
          disabled={disabled}
          className="flex-1 bg-slate-900 border border-slate-700 text-white text-[10px] rounded h-7 px-1.5 disabled:opacity-40"
        >
          <option value="circle">Circle</option>
          <option value="square">Square</option>
          <option value="triangle">Triangle</option>
        </select>
      </PropertyRow>
      
      <PropertyRow label="Aspect">
        <label className="flex items-center gap-1.5 text-slate-400 text-[10px] font-light cursor-pointer">
          <input
            type="checkbox"
            checked={layer.aspect_locked ?? false}
            onChange={(e) => {
              const locked = e.target.checked
              if (locked) {
                sendNow(patch({ aspect_locked: true, height: layer.width * aspectMultiplier }))
              } else {
                sendNow(patch({ aspect_locked: false }))
              }
            }}
            disabled={disabled}
            className="accent-blue-500"
          />
          Lock regular shape
        </label>
      </PropertyRow>

      <PropertyRow label="Width">
        <input
          type="range"
          min={1}
          max={100}
          value={Math.round(layer.width * 100)}
          onChange={(e) => {
            const w = Number(e.target.value) / 100
            patch(layer.aspect_locked ? { width: w, height: w * aspectMultiplier } : { width: w })
          }}
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
          onChange={(e) => {
            const h = Number(e.target.value) / 100
            patch(layer.aspect_locked ? { width: h / aspectMultiplier, height: h } : { height: h })
          }}
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
