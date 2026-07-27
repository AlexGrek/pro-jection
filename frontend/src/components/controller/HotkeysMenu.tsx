import { IconX } from '@tabler/icons-react'

const isMac = navigator.userAgent.includes('Mac')
const MOD = isMac ? '⌘' : 'Ctrl+'

const HOTKEYS = [
  { keys: ['Tab'], description: 'Select next layer' },
  { keys: ['Shift+Tab'], description: 'Select previous layer' },
  { keys: ['Del', 'Bksp'], description: 'Delete selected layer' },
  { keys: [`${MOD}D`], description: 'Duplicate selected layer' },
  { keys: [']'], description: 'Move layer forward' },
  { keys: ['['], description: 'Move layer backward' },
  { keys: ['Shift+]'], description: 'Bring to front' },
  { keys: ['Shift+['], description: 'Send to back' },
  { keys: ['Esc'], description: 'Deselect' },
  { keys: ['↑↓←→'], description: 'Nudge projection corner' },
  { keys: ['Shift+↑↓←→'], description: 'Nudge corner ×20' },
]

interface Props {
  onClose: () => void
}

export function HotkeysMenu({ onClose }: Props) {
  return (
    <>
      {/* Full-screen backdrop — blocks clicks to the Phaser canvas */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute right-0 top-full mt-1 w-60 bg-slate-900 border border-slate-700/60 rounded-lg shadow-2xl z-50 overflow-hidden"
      >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Hotkeys</span>
        <button onClick={onClose} className="text-slate-500 hover:text-white p-0.5 rounded">
          <IconX size={12} stroke={1.5} />
        </button>
      </div>
      <div className="py-1">
        {HOTKEYS.map(({ keys, description }) => (
          <div key={description} className="flex items-center justify-between px-3 py-1.5">
            <span className="text-slate-400 text-[11px] font-light">{description}</span>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              {keys.map((k) => (
                <kbd
                  key={k}
                  className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600/80 text-slate-300 text-[10px] font-mono leading-none"
                >
                  {k}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
      </div>
    </>
  )
}
