import type { ReactNode } from 'react'
import {
  IconBackground,
  IconBarcode,
  IconCircle,
  IconGridDots,
  IconLetterT,
  IconMovie,
  IconPhoto,
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
  onAddImage: () => void
  onAddVideo: () => void
  onAddBarcode: () => void
  onAddRays: () => void
}

export function AddObjectPanel({ disabled, onAddText, onAddRectangle, onAddCircle, onAddFill, onAddIcon, onAddImage, onAddVideo, onAddBarcode, onAddRays }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[10px] font-medium text-slate-500 border-b border-slate-800/60 uppercase tracking-wider">
        Add Object
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
        <AddButton disabled={disabled} icon={<IconLetterT size={13} />} label="Text" onClick={onAddText} />
        <AddButton disabled={disabled} icon={<IconSquare size={13} />} label="Rectangle" onClick={onAddRectangle} />
        <AddButton disabled={disabled} icon={<IconCircle size={13} />} label="Circle" onClick={onAddCircle} />
        <AddButton disabled={disabled} icon={<IconBackground size={13} />} label="Background" onClick={onAddFill} />
        <AddButton disabled={disabled} icon={<IconVectorSpline size={13} />} label="Icon" onClick={onAddIcon} />
        <AddButton disabled={disabled} icon={<IconPhoto size={13} />} label="Image" onClick={onAddImage} />
        <AddButton disabled={disabled} icon={<IconMovie size={13} />} label="Video" onClick={onAddVideo} />
        <AddButton disabled={disabled} icon={<IconBarcode size={13} />} label="Barcode" onClick={onAddBarcode} />
        <AddButton disabled={disabled} icon={<IconGridDots size={13} />} label="Rays" onClick={onAddRays} />
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
