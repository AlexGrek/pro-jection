import type { ReactNode } from 'react'
import {
  IconBackground,
  IconCircle,
  IconLetterT,
  IconSquare,
  IconVectorSpline,
} from '@tabler/icons-react'

interface Props {
  disabled: boolean
  onAddText: () => void
  onAddRectangle: () => void
  onAddCircle: () => void
  onAddFill: () => void
  onAddIcon: () => void
}

export function AddObjectPanel({ disabled, onAddText, onAddRectangle, onAddCircle, onAddFill, onAddIcon }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[10px] font-medium text-slate-500 border-b border-slate-800/60 uppercase tracking-wider">
        Add Object
      </div>
      <div className="p-2 space-y-1">
        <AddButton disabled={disabled} icon={<IconLetterT size={13} />} label="Text" onClick={onAddText} />
        <AddButton disabled={disabled} icon={<IconSquare size={13} />} label="Rectangle" onClick={onAddRectangle} />
        <AddButton disabled={disabled} icon={<IconCircle size={13} />} label="Circle" onClick={onAddCircle} />
        <AddButton disabled={disabled} icon={<IconBackground size={13} />} label="Background" onClick={onAddFill} />
        <AddButton disabled={disabled} icon={<IconVectorSpline size={13} />} label="Icon" onClick={onAddIcon} />
      </div>
    </div>
  )
}

function AddButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-2 py-2 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </button>
  )
}
