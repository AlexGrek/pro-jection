import { useState } from 'react'
import {
  IconAperture,
  IconBlur,
  IconChevronDown,
  IconChevronUp,
  IconColorFilter,
  IconContrast,
  IconEyeglass,
  IconFlare,
  IconFocus2,
  IconGrid4x4,
  IconLayersDifference,
  IconPalette,
  IconPlus,
  IconTrash,
  IconWand,
  IconX,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
  COLOR_GRADE_PRESETS,
  DUOTONE_MAX_COLORS,
  EFFECT_MAX,
  EFFECT_TYPES,
  createEffect,
  effectLabel,
  effectSummary,
  type ColorGradePreset,
  type Effect,
  type EffectType,
} from '@/lib/scene'
import { ColorPicker } from './ColorPicker'
import type { SendMode } from './types'

interface Props {
  effects: Effect[]
  /** Replace the whole chain. `mode` follows the send-timing contract in CLAUDE.md. */
  onChange: (next: Effect[], mode?: SendMode) => void
  /** Flush the latest chain immediately — the slider-release / key-up commit. */
  onCommit: () => void
  disabled?: boolean
}

const EFFECT_ICONS: Record<EffectType, typeof IconWand> = {
  color: IconPalette,
  bloom: IconFlare,
  blur: IconBlur,
  tilt_shift: IconFocus2,
  pixelate: IconGrid4x4,
  posterize: IconLayersDifference,
  threshold: IconContrast,
  duotone: IconColorFilter,
  vignette: IconAperture,
  barrel: IconEyeglass,
}

/**
 * Header control for the scene-wide post-processing chain: add, reorder, disable and
 * tune the camera filters applied over the whole canvas. Order is the order they run
 * in, so the list reads top-to-bottom as the pipeline.
 *
 * The chain is part of the scene, so every projector renders it too — including while
 * it is being tuned here.
 */
export function EffectsControl({ effects, onChange, onCommit, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const activeCount = effects.filter((e) => e.enabled).length
  const full = effects.length >= EFFECT_MAX

  const add = (type: EffectType) => {
    if (full) return
    const effect = createEffect(type)
    onChange([...effects, effect])
    setExpandedId(effect.id)
    setAdding(false)
  }

  const remove = (id: string) => {
    onChange(effects.filter((e) => e.id !== id))
    setExpandedId((prev) => (prev === id ? null : prev))
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= effects.length) return
    const next = [...effects]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  const set = (id: string, patch: Record<string, unknown>, mode: SendMode = 'now') => {
    onChange(effects.map((e) => (e.id === id ? ({ ...e, ...patch } as Effect) : e)), mode)
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className={`px-2 ${activeCount > 0 ? 'text-blue-400 bg-slate-800' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        title="Post-processing"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <IconWand size={15} stroke={1.5} />
      </Button>
      {open && (
        <>
          {/* Backdrop — blocks clicks to the Phaser canvas */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-72 max-h-[75vh] overflow-y-auto bg-slate-900 border border-slate-700/60 rounded-lg shadow-2xl z-50">
            <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-2 sticky top-0 bg-slate-900 z-10">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                Post-processing
              </span>
              <span className="text-[10px] font-light text-slate-600 ml-auto">
                {effects.length}/{EFFECT_MAX}
              </span>
            </div>

            {effects.length === 0 && (
              <p className="px-3 py-2 text-[10px] font-light text-slate-600 leading-snug">
                Filters applied to the whole canvas, in order. Every projector renders them too.
              </p>
            )}

            {effects.map((effect, i) => {
              const Icon = EFFECT_ICONS[effect.type]
              const expanded = expandedId === effect.id
              return (
                <div key={effect.id} className="border-t border-slate-800">
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={effect.enabled}
                      onChange={(e) => set(effect.id, { enabled: e.target.checked })}
                      title={effect.enabled ? 'Disable' : 'Enable'}
                      className="accent-blue-500 shrink-0"
                    />
                    <button
                      onClick={() => setExpandedId(expanded ? null : effect.id)}
                      className={`flex-1 min-w-0 flex items-center gap-1.5 text-left transition-colors ${
                        effect.enabled ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-400'
                      }`}
                    >
                      <Icon size={12} stroke={1.5} className="shrink-0" />
                      <span className="text-[11px] font-light truncate">{effectLabel(effect.type)}</span>
                      <span className="text-[9px] font-mono text-slate-600 ml-auto shrink-0">
                        {effectSummary(effect)}
                      </span>
                    </button>
                    <IconBtn label="Earlier" disabled={i === 0} onClick={() => move(i, i - 1)}>
                      <IconChevronUp size={12} stroke={1.5} />
                    </IconBtn>
                    <IconBtn label="Later" disabled={i === effects.length - 1} onClick={() => move(i, i + 1)}>
                      <IconChevronDown size={12} stroke={1.5} />
                    </IconBtn>
                    <button
                      type="button"
                      onClick={() => remove(effect.id)}
                      title="Remove effect"
                      aria-label="Remove effect"
                      className="shrink-0 p-0.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-950/40"
                    >
                      <IconTrash size={12} stroke={1.5} />
                    </button>
                  </div>
                  {expanded && (
                    <div className="px-3 pb-2.5 pt-0.5 flex flex-col gap-2">
                      <EffectParams
                        effect={effect}
                        set={(patch, mode) => set(effect.id, patch, mode)}
                        commit={onCommit}
                      />
                    </div>
                  )}
                </div>
              )
            })}

            <div className="border-t border-slate-800">
              {adding ? (
                <>
                  <div className="px-3 py-1.5 flex items-center">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Add effect</span>
                    <button
                      onClick={() => setAdding(false)}
                      className="ml-auto p-0.5 rounded text-slate-500 hover:text-white hover:bg-slate-800"
                      aria-label="Cancel"
                    >
                      <IconX size={12} stroke={1.5} />
                    </button>
                  </div>
                  <div className="pb-1">
                    {EFFECT_TYPES.map((t) => {
                      const Icon = EFFECT_ICONS[t.id]
                      return (
                        <button
                          key={t.id}
                          onClick={() => add(t.id)}
                          title={t.hint}
                          className="w-full flex items-start gap-1.5 px-3 py-1.5 text-left text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                        >
                          <Icon size={12} stroke={1.5} className="shrink-0 mt-0.5" />
                          <span className="min-w-0">
                            <span className="block text-[11px] font-light leading-tight">{t.label}</span>
                            <span className="block text-[9px] font-light text-slate-600 leading-tight">{t.hint}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  disabled={full}
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] font-light text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                >
                  <IconPlus size={12} stroke={1.5} />
                  {full ? `Chain full (${EFFECT_MAX})` : 'Add effect'}
                </button>
              )}
            </div>

            {effects.length > 0 && (
              <div className="border-t border-slate-800">
                <button
                  onClick={() => {
                    onChange([])
                    setExpandedId(null)
                  }}
                  className="w-full px-3 py-1.5 text-left text-[11px] font-light text-slate-500 hover:text-white hover:bg-slate-800/60 transition-colors"
                >
                  Clear chain
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface ParamProps {
  effect: Effect
  set: (patch: Record<string, unknown>, mode?: SendMode) => void
  commit: () => void
}

/** Per-type parameter controls. Sliders preview locally and commit on release. */
function EffectParams({ effect, set, commit }: ParamProps) {
  switch (effect.type) {
    case 'color':
      return (
        <>
          <Row label="Preset">
            <select
              value={effect.preset}
              onChange={(e) => set({ preset: e.target.value as ColorGradePreset })}
              className="flex-1 min-w-0 bg-slate-950 border border-slate-700 text-white text-[10px] rounded h-6 px-1"
            >
              {COLOR_GRADE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </Row>
          <Slider label="Bright" value={effect.brightness} min={0} max={2} step={0.02}
            onInput={(v) => set({ brightness: v }, 'none')} commit={commit} />
          <Slider label="Contrast" value={effect.contrast} min={-1} max={1} step={0.02}
            onInput={(v) => set({ contrast: v }, 'none')} commit={commit} />
          <Slider label="Satur." value={effect.saturation} min={-1.5} max={2} step={0.02}
            onInput={(v) => set({ saturation: v }, 'none')} commit={commit} />
          <Slider label="Hue" value={effect.hue} min={0} max={360} step={1} unit="°" decimals={0}
            onInput={(v) => set({ hue: v }, 'none')} commit={commit} />
        </>
      )

    case 'bloom':
      return (
        <>
          <Slider label="Thresh." value={effect.threshold} min={0} max={0.95} step={0.01}
            onInput={(v) => set({ threshold: v }, 'none')} commit={commit} />
          <Slider label="Radius" value={effect.radius} min={1} max={24} step={1} unit="px" decimals={0}
            onInput={(v) => set({ radius: v }, 'none')} commit={commit} />
          <Slider label="Strength" value={effect.strength} min={0} max={2} step={0.05}
            onInput={(v) => set({ strength: v }, 'none')} commit={commit} />
        </>
      )

    case 'blur':
      return (
        <>
          <Slider label="Radius" value={effect.radius} min={0} max={16} step={0.5} unit="px"
            onInput={(v) => set({ radius: v }, 'none')} commit={commit} />
          <Slider label="Strength" value={effect.strength} min={0} max={4} step={0.05}
            onInput={(v) => set({ strength: v }, 'none')} commit={commit} />
        </>
      )

    case 'tilt_shift':
      return (
        <>
          <Slider label="Radius" value={effect.radius} min={0} max={2} step={0.05}
            onInput={(v) => set({ radius: v }, 'none')} commit={commit} />
          <Slider label="Falloff" value={effect.falloff} min={0.2} max={4} step={0.05}
            onInput={(v) => set({ falloff: v }, 'none')} commit={commit} />
          <Slider label="Angle" value={effect.angle} min={0} max={180} step={1} unit="°" decimals={0}
            onInput={(v) => set({ angle: v }, 'none')} commit={commit} />
          <Slider label="Bloom" value={effect.amount} min={0} max={4} step={0.05}
            onInput={(v) => set({ amount: v }, 'none')} commit={commit} />
          <Slider label="Contrast" value={effect.contrast} min={0} max={1} step={0.02}
            onInput={(v) => set({ contrast: v }, 'none')} commit={commit} />
        </>
      )

    case 'pixelate':
      return (
        <Slider label="Block" value={effect.amount} min={1} max={48} step={1} unit="px" decimals={0}
          onInput={(v) => set({ amount: v }, 'none')} commit={commit} />
      )

    case 'posterize':
      return (
        <>
          <Slider label="Levels" value={effect.steps} min={2} max={16} step={1} decimals={0}
            onInput={(v) => set({ steps: v }, 'none')} commit={commit} />
          <Row label="Space">
            <Segment label="RGB" selected={effect.mode === 'rgb'} onClick={() => set({ mode: 'rgb' })} />
            <Segment label="HSV" selected={effect.mode === 'hsv'} onClick={() => set({ mode: 'hsv' })} />
          </Row>
          <Check label="Dither" checked={effect.dither} onChange={(v) => set({ dither: v })} />
        </>
      )

    case 'threshold':
      return (
        <>
          <Slider label="Low" value={effect.edge1} min={0} max={1} step={0.01}
            onInput={(v) => set({ edge1: v }, 'none')} commit={commit} />
          <Slider label="High" value={effect.edge2} min={0} max={1} step={0.01}
            onInput={(v) => set({ edge2: v }, 'none')} commit={commit} />
          <Check label="Invert" checked={effect.invert} onChange={(v) => set({ invert: v })} />
        </>
      )

    case 'duotone':
      return (
        <>
          <Row label="Ramp">
            <div className="flex items-center gap-1 flex-wrap">
              {effect.colors.map((hex, i) => (
                <ColorPicker
                  key={i}
                  value={hex}
                  title={i === 0 ? 'Shadows' : i === effect.colors.length - 1 ? 'Highlights' : `Stop ${i + 1}`}
                  onChange={(next) => set({ colors: effect.colors.map((c, j) => (j === i ? next : c)) }, 'debounced')}
                  onCommit={(next) => set({ colors: effect.colors.map((c, j) => (j === i ? next : c)) })}
                />
              ))}
              {effect.colors.length < DUOTONE_MAX_COLORS && (
                <button
                  onClick={() => set({ colors: [...effect.colors, '#ffffff'] })}
                  title="Add stop"
                  className="w-6 h-6 rounded border border-slate-700 text-slate-500 hover:text-white hover:border-slate-500 flex items-center justify-center"
                >
                  <IconPlus size={11} stroke={1.5} />
                </button>
              )}
              {effect.colors.length > 2 && (
                <button
                  onClick={() => set({ colors: effect.colors.slice(0, -1) })}
                  title="Remove last stop"
                  className="w-6 h-6 rounded border border-slate-700 text-slate-500 hover:text-red-400 hover:border-red-800 flex items-center justify-center"
                >
                  <IconX size={11} stroke={1.5} />
                </button>
              )}
            </div>
          </Row>
          <Slider label="Mix" value={effect.mix} min={0} max={1} step={0.01}
            onInput={(v) => set({ mix: v }, 'none')} commit={commit} />
          <Check label="Dither" checked={effect.dither} onChange={(v) => set({ dither: v })} />
        </>
      )

    case 'vignette':
      return (
        <>
          <Slider label="Radius" value={effect.radius} min={0} max={1} step={0.01}
            onInput={(v) => set({ radius: v }, 'none')} commit={commit} />
          <Slider label="Strength" value={effect.strength} min={0} max={1} step={0.01}
            onInput={(v) => set({ strength: v }, 'none')} commit={commit} />
          <Slider label="Centre X" value={effect.x} min={0} max={1} step={0.01}
            onInput={(v) => set({ x: v }, 'none')} commit={commit} />
          <Slider label="Centre Y" value={effect.y} min={0} max={1} step={0.01}
            onInput={(v) => set({ y: v }, 'none')} commit={commit} />
          <Row label="Colour">
            <ColorPicker
              value={effect.color}
              onChange={(hex) => set({ color: hex }, 'debounced')}
              onCommit={(hex) => set({ color: hex })}
            />
          </Row>
        </>
      )

    case 'barrel':
      return (
        <Slider label="Amount" value={effect.amount} min={0} max={2} step={0.01}
          onInput={(v) => set({ amount: v }, 'none')} commit={commit} />
      )
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-500 text-[10px] w-14 shrink-0">{label}</span>
      {children}
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  decimals?: number
  onInput: (value: number) => void
  commit: () => void
}

function Slider({ label, value, min, max, step, unit = '', decimals = 2, onInput, commit }: SliderProps) {
  return (
    <Row label={label}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onInput(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        className="flex-1 accent-blue-500 touch-none"
      />
      <span className="text-slate-400 text-[10px] w-10 text-right shrink-0 font-mono">
        {value.toFixed(decimals)}{unit}
      </span>
    </Row>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-slate-400 text-[10px] font-light cursor-pointer pl-16">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-blue-500"
      />
      {label}
    </label>
  )
}

function Segment({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[10px] font-light transition-colors ${
        selected ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:text-white hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  )
}

function IconBtn({ label, disabled, onClick, children }: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="shrink-0 p-0.5 rounded text-slate-500 hover:text-white hover:bg-slate-700/60 disabled:opacity-20 disabled:hover:text-slate-500 disabled:hover:bg-transparent disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}
