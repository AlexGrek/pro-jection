import { IconDice5, IconPlus, IconX } from '@tabler/icons-react'
import type { CodeLayer, CodeScheme } from '@/lib/scene'
import { CODE_MAX_COLORS, CODE_SCHEME_LABELS, CODE_SCHEME_PRESETS, randomCodeSeed } from '@/lib/scene'
import { ColorPicker } from './ColorPicker'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'

interface Props {
  layer: CodeLayer
  controls: PropertyControls
}

const SCHEME_OPTIONS = Object.keys(CODE_SCHEME_PRESETS) as Exclude<CodeScheme, 'custom'>[]

export function CodeProperties({ layer, controls }: Props) {
  const { patch, sendNow, sendDebounced, sendCurrent, disabled } = controls

  const applyScheme = (scheme: Exclude<CodeScheme, 'custom'>) => {
    sendNow(patch({ scheme, colors: [...CODE_SCHEME_PRESETS[scheme]] }))
  }

  // Any hand edit to the palette detaches it from the named preset it started from.
  const patchColor = (i: number, hex: string) => {
    const colors = layer.colors.map((c, idx) => (idx === i ? hex : c))
    return patch({ colors, scheme: 'custom' })
  }

  const addColor = () => {
    if (layer.colors.length >= CODE_MAX_COLORS) return
    sendNow(patch({ colors: [...layer.colors, '#ffffff'], scheme: 'custom' }))
  }

  const removeColor = (i: number) => {
    if (layer.colors.length <= 1) return
    sendNow(patch({ colors: layer.colors.filter((_, idx) => idx !== i), scheme: 'custom' }))
  }

  return (
    <>
      <PropertyRow label="Variant">
        <select
          value={layer.variant}
          onChange={(e) => sendNow(patch({ variant: e.target.value as CodeLayer['variant'] }))}
          disabled={disabled}
          className="flex-1 bg-slate-900 border border-slate-700 text-white text-[10px] rounded h-7 px-1.5 disabled:opacity-40"
        >
          <option value="block">Code block</option>
          <option value="oneliner">Huge one-liner</option>
          <option value="hex">Hex dump</option>
          <option value="binary">Binary</option>
          <option value="cli">CLI session</option>
        </select>
      </PropertyRow>

      <PropertyRow label="Font size">
        <input
          type="range"
          min={8}
          max={60}
          value={layer.font_size}
          onChange={(e) => patch({ font_size: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-9 text-right shrink-0">{layer.font_size}px</span>
      </PropertyRow>

      <PropertyRow label="Scheme">
        <select
          value={layer.scheme}
          onChange={(e) => applyScheme(e.target.value as Exclude<CodeScheme, 'custom'>)}
          disabled={disabled}
          className="flex-1 bg-slate-900 border border-slate-700 text-white text-[10px] rounded h-7 px-1.5 disabled:opacity-40"
        >
          {SCHEME_OPTIONS.map((s) => (
            <option key={s} value={s}>{CODE_SCHEME_LABELS[s]}</option>
          ))}
          {layer.scheme === 'custom' && <option value="custom">Custom</option>}
        </select>
      </PropertyRow>

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
          {layer.colors.length < CODE_MAX_COLORS && (
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

      <PropertyRow label="Pattern">
        <button
          type="button"
          onClick={() => sendNow(patch({ seed: randomCodeSeed() }))}
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
