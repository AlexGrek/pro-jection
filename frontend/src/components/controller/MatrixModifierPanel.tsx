import type { Layer, MatrixModifier } from '@/lib/scene'
import { getMatrixModifier } from '@/lib/scene'
import { PropertyRow } from './PropertyRow'
import type { PropertyControls } from './types'

interface Props {
  layer: Layer
  controls: PropertyControls
}

const DEFAULT_MATRIX: MatrixModifier = {
  type: 'matrix',
  cols: 3,
  rows: 3,
  offset_x: 1.1,
  offset_y: 1.1,
  relative: true,
}

export function MatrixModifierPanel({ layer, controls }: Props) {
  const { patch, sendNow, sendCurrent, disabled } = controls
  const mat = getMatrixModifier(layer)

  const patchMat = (update: Partial<MatrixModifier>): Layer[] => {
    const updated = { ...mat!, ...update }
    const newModifiers = layer.modifiers.map((m) => (m.type === 'matrix' ? updated : m))
    return patch({ modifiers: newModifiers })
  }

  const addMatrix = () => {
    sendNow(patch({ modifiers: [...layer.modifiers, { ...DEFAULT_MATRIX }] }))
  }

  const removeMatrix = () => {
    sendNow(patch({ modifiers: layer.modifiers.filter((m) => m.type !== 'matrix') }))
  }

  if (!mat) {
    return (
      <div className="p-2">
        <button
          onClick={addMatrix}
          disabled={disabled}
          className="w-full text-[10px] text-slate-400 hover:text-white border border-dashed border-slate-700 hover:border-slate-500 rounded px-2 py-1.5 transition-colors disabled:opacity-40"
        >
          + Matrix
        </button>
      </div>
    )
  }

  const canRelative = layer.type !== 'fill'
  const sliderMin = mat.relative ? -300 : -100
  const sliderMax = mat.relative ? 300 : 100
  const toSlider = (v: number) => Math.round(v * 100)
  const fromSlider = (s: number) => s / 100
  const fmtOffset = (v: number) =>
    mat.relative ? v.toFixed(2) + 'x' : String(Math.round(v * 100))

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-slate-300 uppercase tracking-wider">Matrix</span>
        <button
          onClick={removeMatrix}
          disabled={disabled}
          className="text-[10px] text-slate-600 hover:text-red-400 transition-colors px-1 disabled:opacity-40"
          title="Remove modifier"
        >
          ×
        </button>
      </div>

      <PropertyRow label="Cols">
        <input
          type="range"
          min={1}
          max={10}
          value={mat.cols}
          onChange={(e) => sendNow(patchMat({ cols: Number(e.target.value) }))}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-5 text-right shrink-0">{mat.cols}</span>
      </PropertyRow>

      <PropertyRow label="Rows">
        <input
          type="range"
          min={1}
          max={10}
          value={mat.rows}
          onChange={(e) => sendNow(patchMat({ rows: Number(e.target.value) }))}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-5 text-right shrink-0">{mat.rows}</span>
      </PropertyRow>

      {canRelative && (
        <PropertyRow label="Rel">
          <label className="flex items-center gap-1.5 text-slate-400 text-[10px] cursor-pointer">
            <input
              type="checkbox"
              checked={mat.relative}
              onChange={(e) => sendNow(patchMat({ relative: e.target.checked }))}
              disabled={disabled}
              className="accent-blue-500"
            />
            Object size
          </label>
        </PropertyRow>
      )}

      <PropertyRow label="Off X">
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          value={toSlider(mat.offset_x)}
          onChange={(e) => patchMat({ offset_x: fromSlider(Number(e.target.value)) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-8 text-right shrink-0">
          {fmtOffset(mat.offset_x)}
        </span>
      </PropertyRow>

      <PropertyRow label="Off Y">
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          value={toSlider(mat.offset_y)}
          onChange={(e) => patchMat({ offset_y: fromSlider(Number(e.target.value)) })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-8 text-right shrink-0">
          {fmtOffset(mat.offset_y)}
        </span>
      </PropertyRow>
    </div>
  )
}
