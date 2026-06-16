import type { ReactNode } from 'react'
import {
  IconBackground,
  IconBarcode,
  IconChevronDown,
  IconChevronUp,
  IconChevronsDown,
  IconChevronsUp,
  IconCircle,
  IconGridDots,
  IconLetterT,
  IconMovie,
  IconPhoto,
  IconCopy,
  IconSquare,
  IconTrash,
  IconVectorSpline,
} from '@tabler/icons-react'
import type { Layer } from '@/lib/scene'
import { findIconDef } from '@/lib/icons'

interface Props {
  layer: Layer
  /** Real index into the objects array (not the panel display index). */
  idx: number
  total: number
  selected: boolean
  onSelect: () => void
  onMove: (target: number) => void
  onDelete: () => void
  onDuplicate: () => void
}

export function LayerRow({ layer, idx, total, selected, onSelect, onMove, onDelete, onDuplicate }: Props) {
  const isFront = idx === total - 1
  const isBack = idx === 0

  return (
    <div
      className={`flex items-center gap-0.5 pl-2 pr-1 py-1 rounded border transition-colors ${
        selected
          ? 'bg-blue-500/10 border-blue-500 text-white'
          : 'bg-slate-800/20 border-white/5 text-slate-400 hover:text-white hover:bg-slate-800/40 hover:border-white/10'
      }`}
    >
      <button
        onClick={onSelect}
        className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
      >
        <LayerIcon layer={layer} />
        <span className="text-xs font-light truncate">{layerLabel(layer)}</span>
      </button>
      <ReorderBtn
        label="Bring to front"
        icon={<IconChevronsUp size={12} stroke={1.5} />}
        disabled={isFront}
        onClick={() => onMove(total - 1)}
      />
      <ReorderBtn
        label="Forward"
        icon={<IconChevronUp size={12} stroke={1.5} />}
        disabled={isFront}
        onClick={() => onMove(idx + 1)}
      />
      <ReorderBtn
        label="Backward"
        icon={<IconChevronDown size={12} stroke={1.5} />}
        disabled={isBack}
        onClick={() => onMove(idx - 1)}
      />
      <ReorderBtn
        label="Send to back"
        icon={<IconChevronsDown size={12} stroke={1.5} />}
        disabled={isBack}
        onClick={() => onMove(0)}
      />
      <button
        type="button"
        onClick={onDuplicate}
        title="Duplicate layer"
        aria-label="Duplicate layer"
        className="shrink-0 p-0.5 rounded text-slate-500 hover:text-white hover:bg-slate-700/60"
      >
        <IconCopy size={12} stroke={1.5} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Delete layer"
        aria-label="Delete layer"
        className="shrink-0 p-0.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-950/40"
      >
        <IconTrash size={12} stroke={1.5} />
      </button>
    </div>
  )
}

function LayerIcon({ layer }: { layer: Layer }) {
  if (layer.type === 'text') return <IconLetterT size={11} className="shrink-0" />
  if (layer.type === 'fill') return <IconBackground size={11} className="shrink-0" />
  if (layer.type === 'icon') return <IconVectorSpline size={11} className="shrink-0" />
  if (layer.type === 'image') return <IconPhoto size={11} className="shrink-0" />
  if (layer.type === 'video') return <IconMovie size={11} className="shrink-0" />
  if (layer.type === 'barcode') return <IconBarcode size={11} className="shrink-0" />
  if (layer.type === 'rays') return <IconGridDots size={11} className="shrink-0" />
  if (layer.shape === 'circle') return <IconCircle size={11} className="shrink-0" />
  return <IconSquare size={11} className="shrink-0" />
}

export function layerLabel(layer: Layer): string {
  if (layer.type === 'text') return layer.text || '(empty)'
  if (layer.type === 'shape') return layer.shape === 'circle' ? 'Circle' : 'Rectangle'
  if (layer.type === 'fill') return layer.fill === 'linear' ? 'Gradient' : 'Solid Fill'
  if (layer.type === 'icon') return findIconDef(layer.icon_id)?.def.label ?? 'Icon'
  if (layer.type === 'image') return layer.url ? 'Image' : 'Image (empty)'
  if (layer.type === 'video') return layer.url ? 'Video' : 'Video (empty)'
  if (layer.type === 'barcode') return layer.code ? `Barcode ${layer.code}` : 'Barcode'
  if (layer.type === 'rays') return layer.fullscreen ? 'Rays (fullscreen)' : `Rays ${layer.columns}×${layer.rows}`
  return (layer as Layer).type
}

interface ReorderBtnProps {
  label: string
  icon: ReactNode
  disabled: boolean
  onClick: () => void
}

function ReorderBtn({ label, icon, disabled, onClick }: ReorderBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="shrink-0 p-0.5 rounded text-slate-500 hover:text-white hover:bg-slate-700/60 disabled:opacity-20 disabled:hover:text-slate-500 disabled:hover:bg-transparent disabled:cursor-not-allowed"
    >
      {icon}
    </button>
  )
}
