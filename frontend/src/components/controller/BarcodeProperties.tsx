import type { BarcodeFormat, BarcodeLayer } from '@/lib/scene'
import { randomBarcodeValue } from '@/lib/scene'
import type { PropertyControls } from './types'
import { PropertyRow } from './PropertyRow'
import { ColorPicker } from './ColorPicker'

interface Props {
  layer: BarcodeLayer
  controls: PropertyControls
}

const FORMAT_OPTIONS: { value: BarcodeFormat; label: string }[] = [
  { value: 'code128', label: 'CODE128' },
  { value: 'ean13', label: 'EAN-13' },
  { value: 'ean8', label: 'EAN-8' },
  { value: 'upc', label: 'UPC-A' },
  { value: 'qr', label: 'QR' },
]

export function BarcodeProperties({ layer, controls }: Props) {
  const { patch, sendNow, sendDebounced, sendCurrent, disabled } = controls

  return (
    <>
      <PropertyRow label="FG / BG">
        <div className="flex items-center gap-2 flex-1">
          <ColorPicker
            value={layer.color}
            onChange={(hex) => sendDebounced(patch({ color: hex }))}
            onCommit={(hex) => sendNow(patch({ color: hex }))}
            disabled={disabled}
            title="Foreground"
          />
          <button
            type="button"
            onClick={() => {
              if (layer.bg_transparent) {
                // Promote FG to BG; turn off transparency so swap is meaningful.
                sendNow(patch({ bg_transparent: false, bg_color: layer.color }))
              } else {
                sendNow(patch({ color: layer.bg_color, bg_color: layer.color }))
              }
            }}
            disabled={disabled}
            className="h-6 px-2 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Swap foreground and background"
          >
            Swap
          </button>
          <ColorPicker
            value={layer.bg_color}
            onChange={(hex) => sendDebounced(patch({ bg_color: hex, bg_transparent: false }))}
            onCommit={(hex) => sendNow(patch({ bg_color: hex, bg_transparent: false }))}
            disabled={disabled || layer.bg_transparent}
            title={layer.bg_transparent ? 'Background (transparent)' : 'Background'}
          />
          <label className="ml-auto inline-flex items-center gap-2 text-[10px] text-slate-300">
            <input
              type="checkbox"
              checked={layer.bg_transparent}
              onChange={(e) => sendNow(patch({ bg_transparent: e.target.checked }))}
              disabled={disabled}
              className="accent-blue-500"
            />
            Transparent
          </label>
        </div>
      </PropertyRow>

      <PropertyRow label="Format">
        <select
          value={layer.format}
          onChange={(e) => {
            const format = e.target.value as BarcodeFormat
            sendNow(patch({ format, code: randomBarcodeValue(format) }))
          }}
          disabled={disabled}
          className="flex-1 h-7 rounded bg-slate-900 border border-slate-700 px-2 text-[10px] text-white disabled:opacity-40"
        >
          {FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </PropertyRow>

      <PropertyRow label="Code">
        <input
          type="text"
          value={layer.code}
          onChange={(e) => sendDebounced(patch({ code: e.target.value }))}
          disabled={disabled}
          className="h-7 rounded bg-slate-900 border border-slate-700 px-2 text-[10px] text-white font-mono flex-1 disabled:opacity-40"
          spellCheck={false}
        />
        <button
          onClick={() => sendNow(patch({ code: randomBarcodeValue(layer.format) }))}
          disabled={disabled}
          className="px-2 py-1 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          Random
        </button>
      </PropertyRow>

      <PropertyRow label={layer.format === 'qr' ? 'Show Text' : 'Show Digits'}>
        <label className="inline-flex items-center gap-2 text-[10px] text-slate-300">
          <input
            type="checkbox"
            checked={layer.show_digits}
            onChange={(e) => sendNow(patch({ show_digits: e.target.checked }))}
            disabled={disabled}
            className="accent-blue-500"
          />
          {layer.format === 'qr' ? 'Visible below QR' : 'Visible below bars'}
        </label>
      </PropertyRow>

      <PropertyRow label="Size">
        <input
          type="range"
          min={10}
          max={90}
          value={Math.round(layer.width * 100)}
          onChange={(e) => patch({ width: Number(e.target.value) / 100 })}
          onPointerUp={sendCurrent}
          onKeyUp={sendCurrent}
          disabled={disabled}
          className="flex-1 accent-blue-500 touch-none"
        />
        <span className="text-slate-400 text-[10px] w-7 text-right shrink-0">
          {Math.round(layer.width * 100)}%
        </span>
      </PropertyRow>
    </>
  )
}
