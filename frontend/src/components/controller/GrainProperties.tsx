import { IconDice5, IconPlus, IconX } from '@tabler/icons-react'
import type { GrainLayer } from '@/lib/scene'
import { GRAIN_MAX_COLORS, randomGrainSeed } from '@/lib/scene'
import { ColorPicker } from './ColorPicker'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'

interface Props {
  layer: GrainLayer
  controls: PropertyControls
}

export function GrainProperties({ layer, controls }: Props) {
  const { patch, sendNow, sendDebounced, sendCurrent, disabled } = controls

  const patchColor = (i: number, hex: string) => {
    const colors = layer.colors.map((c, idx) => (idx === i ? hex : c))
    return patch({ colors })
  }

  const addColor = () => {
    if (layer.colors.length >= GRAIN_MAX_COLORS) return
    sendNow(patch({ colors: [...layer.colors, '#ffffff'] }))
  }

  const removeColor = (i: number) => {
    if (layer.colors.length <= 1) return
    sendNow(patch({ colors: layer.colors.filter((_, idx) => idx !== i) }))
  }

  return (
    <>
      <PropertyRow label="Shape">
        <select
          value={layer.shape}
          onChange={(e) => sendNow(patch({ shape: e.target.value as GrainLayer['shape'] }))}
          disabled={disabled}
          className="flex-1 bg-slate-900 border border-slate-700 text-white text-[10px] rounded h-7 px-1.5 disabled:opacity-40"
        >
          <option value="dot">Dots</option>
          <option value="line">Lines</option>
        </select>
      </PropertyRow>

      <PropertyRow label="Count">
        <input
          type="range"
          min={10}
          max={3000}
          value={layer.count}
          onChange={(e) => patch({ count: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-9 text-right shrink-0">{layer.count}</span>
      </PropertyRow>

      <PropertyRow label="Size">
        <input
          type="range"
          min={1}
          max={40}
          value={layer.size}
          onChange={(e) => patch({ size: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-9 text-right shrink-0">{layer.size}px</span>
      </PropertyRow>

      {layer.shape === 'line' && (
        <PropertyRow label="Width">
          <input
            type="range"
            min={1}
            max={10}
            value={layer.line_width}
            onChange={(e) => patch({ line_width: Number(e.target.value) })}
            onPointerUp={sendCurrent}
            onKeyUp={sendCurrent}
            disabled={disabled}
            className="flex-1 accent-blue-500 touch-none"
          />
          <span className="text-slate-400 text-[10px] w-9 text-right shrink-0">{layer.line_width}px</span>
        </PropertyRow>
      )}

      <PropertyRow label="Colors">
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {layer.colors.map((c, i) => (
            <div key={i} className="relative">
              <ColorPicker
                value={c}
                onChange={(hex) => sendDebounced(patchColor(i, hex))}
                onCommit={(hex) => sendNow(patchColor(i, hex))}
                disabled={disabled}
              />
              {layer.colors.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeColor(i)}
                  disabled={disabled}
                  title="Remove colour"
                  aria-label="Remove colour"
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-slate-800 border border-slate-600 text-slate-400 hover:text-white hover:bg-red-900/60 disabled:opacity-40"
                >
                  <IconX size={10} stroke={2} />
                </button>
              )}
            </div>
          ))}
          {layer.colors.length < GRAIN_MAX_COLORS && (
            <button
              type="button"
              onClick={addColor}
              disabled={disabled}
              title="Add colour"
              aria-label="Add colour"
              className="w-7 h-6 rounded border border-dashed border-slate-600 text-slate-500 hover:text-white hover:border-slate-400 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <IconPlus size={12} stroke={1.5} />
            </button>
          )}
        </div>
      </PropertyRow>

      <PropertyRow label="Seed">
        <button
          type="button"
          onClick={() => sendNow(patch({ seed: randomGrainSeed() }))}
          disabled={disabled}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <IconDice5 size={13} stroke={1.5} />
          Shuffle
        </button>
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
        <>
          <PropertyRow label="Width">
            <input
              type="range"
              min={2}
              max={100}
              value={Math.round(layer.width * 100)}
              onChange={(e) => patch({ width: Number(e.target.value) / 100 })}
              onPointerUp={sendCurrent}
              onKeyUp={sendCurrent}
              disabled={disabled}
              className="flex-1 accent-blue-500 touch-none"
            />
            <span className="text-slate-400 text-[10px] w-9 text-right shrink-0">
              {Math.round(layer.width * 100)}%
            </span>
          </PropertyRow>
          <PropertyRow label="Height">
            <input
              type="range"
              min={2}
              max={100}
              value={Math.round(layer.height * 100)}
              onChange={(e) => patch({ height: Number(e.target.value) / 100 })}
              onPointerUp={sendCurrent}
              onKeyUp={sendCurrent}
              disabled={disabled}
              className="flex-1 accent-blue-500 touch-none"
            />
            <span className="text-slate-400 text-[10px] w-9 text-right shrink-0">
              {Math.round(layer.height * 100)}%
            </span>
          </PropertyRow>
        </>
      )}
    </>
  )
}
