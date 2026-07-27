import { useState } from 'react'
import {
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconPerspective,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { CORNER_LABELS, defaultProjection, type ProjectionSettings } from '@/lib/scene'

/** Nudge steps in canvas pixels, matching the arrow-key steps on desktop. */
const NUDGE_SMALL = 1
const NUDGE_BIG = 20

interface Props {
  projection: ProjectionSettings | null
  onChange: (projection: ProjectionSettings | null) => void
  /** Move the selected corner by a delta in canvas pixels. */
  onNudge: (dxPx: number, dyPx: number) => void
  /** Controller-local preview: false = flat, true = warped. Never sent to the projector. */
  warpPreview: boolean
  onWarpPreviewChange: (warped: boolean) => void
  cornerEditing: boolean
  onCornerEditingChange: (editing: boolean) => void
  selectedCorner: number | null
  onSelectCorner: (index: number | null) => void
  disabled?: boolean
}

/**
 * Header control for the scene-wide keystone warp: toggles it on/off, switches the
 * controller between flat and projected preview, and picks the corner that the
 * arrow keys nudge. The projector always renders projected.
 */
export function ProjectionControl({
  projection,
  onChange,
  onNudge,
  warpPreview,
  onWarpPreviewChange,
  cornerEditing,
  onCornerEditingChange,
  selectedCorner,
  onSelectCorner,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [bigStep, setBigStep] = useState(false)
  const active = projection !== null
  const step = bigStep ? NUDGE_BIG : NUDGE_SMALL

  const toggle = () => {
    if (active) {
      onChange(null)
      onSelectCorner(null)
      onWarpPreviewChange(false)
    } else {
      onChange(defaultProjection())
      onSelectCorner(0)
    }
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className={`px-2 ${active ? 'text-blue-400 bg-slate-800' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        title="3D projection"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <IconPerspective size={15} stroke={1.5} />
      </Button>
      {open && (
        <>
          {/* Backdrop — blocks clicks to the Phaser canvas */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-60 bg-slate-900 border border-slate-700/60 rounded-lg shadow-2xl z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-800 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
              3D projection
            </div>
            <div className="py-1">
              <Row label={active ? 'On' : 'Off'} selected={active} onClick={toggle} />
            </div>

            {active && (
              <>
                <div className="px-3 py-1.5 border-t border-slate-800 flex items-center gap-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-auto">Preview</span>
                  <Segment label="Flat" selected={!warpPreview} onClick={() => onWarpPreviewChange(false)} />
                  <Segment label="Projected" selected={warpPreview} onClick={() => onWarpPreviewChange(true)} />
                </div>

                <div className="border-t border-slate-800 py-1">
                  <Row
                    label="Calibration mode"
                    selected={cornerEditing}
                    onClick={() => onCornerEditingChange(!cornerEditing)}
                  />
                  <p className="px-3 pb-1 text-[10px] font-light text-slate-600 leading-snug">
                    Shows corner handles here and an alignment grid on every projector.
                  </p>
                </div>

                <div className="border-t border-slate-800 py-1">
                  {projection.corners.map((c, i) => (
                    <button
                      key={CORNER_LABELS[i]}
                      onClick={() => onSelectCorner(i)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-light transition-colors text-left ${
                        i === selectedCorner
                          ? 'text-blue-400 bg-slate-800/70'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      {CORNER_LABELS[i]}
                      <span className="font-mono text-[10px] text-slate-500 shrink-0 ml-2">
                        {c.x.toFixed(3)}, {c.y.toFixed(3)}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Nudge pad — the mobile controller has no arrow keys. */}
                <div className="border-t border-slate-800 px-3 py-2 flex items-center gap-3">
                  <div className="grid grid-cols-3 grid-rows-3 gap-0.5 shrink-0">
                    <span />
                    <Nudge Icon={IconChevronUp} onClick={() => onNudge(0, -step)} />
                    <span />
                    <Nudge Icon={IconChevronLeft} onClick={() => onNudge(-step, 0)} />
                    <span />
                    <Nudge Icon={IconChevronRight} onClick={() => onNudge(step, 0)} />
                    <span />
                    <Nudge Icon={IconChevronDown} onClick={() => onNudge(0, step)} />
                    <span />
                  </div>
                  <button
                    onClick={() => setBigStep((b) => !b)}
                    className={`px-2 py-1 rounded text-[10px] font-light transition-colors ${
                      bigStep ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {step} px
                  </button>
                </div>

                <div className="border-t border-slate-800 py-1">
                  <Row label="Reset corners" selected={false} onClick={() => onChange(defaultProjection())} />
                </div>

                <div className="px-3 py-2 border-t border-slate-800 text-[10px] font-light text-slate-500 leading-relaxed">
                  ↑↓←→ nudge · Shift for big steps · Tab for next corner
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Row({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-light text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors text-left"
    >
      {label}
      {selected && <IconCheck size={13} stroke={1.5} className="text-blue-400 shrink-0" />}
    </button>
  )
}

function Nudge({ Icon, onClick }: { Icon: typeof IconChevronUp; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
    >
      <Icon size={13} stroke={2} />
    </button>
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
