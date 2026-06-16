import { useState } from 'react'
import { IconCheck, IconGrid3x3 } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { GRID_TYPES, type GridSettings } from '@/lib/scene'

interface Props {
  grid: GridSettings | null
  onChange: (grid: GridSettings | null) => void
  disabled?: boolean
}

/** Header control: toggles the scene-wide grid overlay and picks its pattern. */
export function GridControl({ grid, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const active = grid !== null

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className={`px-2 ${active ? 'text-blue-400 bg-slate-800' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        title="Grid overlay"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <IconGrid3x3 size={15} stroke={1.5} />
      </Button>
      {open && (
        <>
          {/* Backdrop — blocks clicks to the Phaser canvas */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-44 bg-slate-900 border border-slate-700/60 rounded-lg shadow-2xl z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-800 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
              Grid overlay
            </div>
            <div className="py-1">
              <GridItem label="Off" selected={!active} onClick={() => onChange(null)} />
              {GRID_TYPES.map((t) => (
                <GridItem
                  key={t.id}
                  label={t.label}
                  selected={grid?.type === t.id}
                  onClick={() => onChange({ type: t.id })}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function GridItem({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
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
