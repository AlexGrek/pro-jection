import type { GlowAnimation, Layer } from '@/lib/scene'
import { DEFAULT_GLOW_ANIMATION, GLOW_PERIOD_MAX, GLOW_PERIOD_MIN, getGlowModifier } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'

interface Props {
  layer: Layer
  controls: PropertyControls
}

export function GlowAnimationPanel({ layer, controls }: Props) {
  const { patch, sendNow, sendCurrent, disabled } = controls
  const glowMod = getGlowModifier(layer)
  const anim = layer.animations.glow

  const patchAnim = (update: Partial<GlowAnimation>): Layer[] => {
    const updated = { ...DEFAULT_GLOW_ANIMATION, ...anim, ...update }
    return patch({ animations: { ...layer.animations, glow: updated } })
  }

  const addAnim = () => {
    sendNow(patch({ animations: { ...layer.animations, glow: { ...DEFAULT_GLOW_ANIMATION } } }))
  }

  const removeAnim = () => {
    const next = { ...layer.animations }
    delete next.glow
    sendNow(patch({ animations: next }))
  }

  // No animation yet: offer to add it, but only once there's a glow modifier to breathe.
  if (!anim) {
    return (
      <div className="p-2">
        {glowMod ? (
          <button
            onClick={addAnim}
            disabled={disabled}
            className="w-full text-[10px] text-slate-400 hover:text-white border border-dashed border-slate-700 hover:border-slate-500 rounded px-2 py-1.5 transition-colors disabled:opacity-40"
          >
            + Glow breathing
          </button>
        ) : (
          <p className="text-slate-700 text-[10px] px-1 py-1 italic">
            Add a Glow modifier to enable glow breathing.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-slate-300 uppercase tracking-wider">Glow breathing</span>
        <button
          onClick={removeAnim}
          disabled={disabled}
          className="text-[10px] text-slate-600 hover:text-red-400 transition-colors px-1 disabled:opacity-40"
          title="Remove animation"
        >
          ×
        </button>
      </div>

      {!glowMod && (
        <p className="text-amber-600/80 text-[10px] px-1 italic">
          Add a Glow modifier for this to show.
        </p>
      )}

      <PropertyRow label="Period">
        <input
          type="range"
          min={GLOW_PERIOD_MIN}
          max={GLOW_PERIOD_MAX}
          step={0.1}
          value={anim.period}
          onChange={(e) => patchAnim({ period: Number(e.target.value) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-8 text-right shrink-0">
          {anim.period.toFixed(1)}s
        </span>
      </PropertyRow>
    </div>
  )
}
