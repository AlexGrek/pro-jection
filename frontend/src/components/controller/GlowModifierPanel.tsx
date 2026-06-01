import type { GlowModifier, Layer } from '@/lib/scene'
import { getGlowModifier } from '@/lib/scene'
import { ColorPicker } from './ColorPicker'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'

interface Props {
  layer: Layer
  controls: PropertyControls
}

const DEFAULT_GLOW: GlowModifier = {
  type: 'glow',
  color: '#ffffff',
  outer_strength: 4,
  inner_strength: 0,
  distance: 12,
}

export function GlowModifierPanel({ layer, controls }: Props) {
  const { patch, sendNow, sendDebounced, sendCurrent, disabled } = controls
  const glow = getGlowModifier(layer)

  const patchGlow = (update: Partial<GlowModifier>): Layer[] => {
    const updated = { ...glow!, ...update }
    const newModifiers = layer.modifiers.map((m) => (m.type === 'glow' ? updated : m))
    return patch({ modifiers: newModifiers })
  }

  const addGlow = () => {
    const layerColor = 'color' in layer ? (layer.color as string) : DEFAULT_GLOW.color
    const newModifiers = [...layer.modifiers, { ...DEFAULT_GLOW, color: layerColor }]
    sendNow(patch({ modifiers: newModifiers }))
  }

  const removeGlow = () => {
    const newModifiers = layer.modifiers.filter((m) => m.type !== 'glow')
    sendNow(patch({ modifiers: newModifiers }))
  }

  if (!glow) {
    return (
      <div className="p-2 border-t border-slate-800/50">
        <button
          onClick={addGlow}
          disabled={disabled}
          className="w-full text-[10px] text-slate-400 hover:text-white border border-dashed border-slate-700 hover:border-slate-500 rounded px-2 py-1.5 transition-colors disabled:opacity-40"
        >
          + Glow
        </button>
      </div>
    )
  }

  return (
    <div className="p-2 border-t border-slate-800/50 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-slate-300 uppercase tracking-wider">Glow</span>
        <button
          onClick={removeGlow}
          disabled={disabled}
          className="text-[10px] text-slate-600 hover:text-red-400 transition-colors px-1 disabled:opacity-40"
          title="Remove modifier"
        >
          ×
        </button>
      </div>

      <PropertyRow label="Color">
        <ColorPicker
          value={glow.color}
          onChange={(hex) => sendDebounced(patchGlow({ color: hex }))}
          onCommit={(hex) => sendNow(patchGlow({ color: hex }))}
          disabled={disabled}
        />
      </PropertyRow>

      <PropertyRow label="Outer">
        <input
          type="range"
          min={0}
          max={20}
          step={0.5}
          value={glow.outer_strength}
          onChange={(e) => patchGlow({ outer_strength: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">
          {glow.outer_strength}
        </span>
      </PropertyRow>

      <PropertyRow label="Inner">
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={glow.inner_strength}
          onChange={(e) => patchGlow({ inner_strength: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">
          {glow.inner_strength}
        </span>
      </PropertyRow>

      <PropertyRow label="Dist">
        <input
          type="range"
          min={5}
          max={50}
          value={glow.distance}
          onChange={(e) => patchGlow({ distance: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">
          {glow.distance}
        </span>
      </PropertyRow>
    </div>
  )
}
