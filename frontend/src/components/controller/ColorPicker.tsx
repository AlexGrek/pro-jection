import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SWATCHES, hexToHsl, hslToHex, normalizeHex, type Hsl } from '@/lib/color'

export interface ColorPickerProps {
  /** Current colour as `#rrggbb`. */
  value: string
  /** Live, debounced preview while tuning (slider drag / hex typing / system drag). */
  onChange: (hex: string) => void
  /** Immediate commit (slider release / swatch / hex blur / system close / dismiss). */
  onCommit?: (hex: string) => void
  disabled?: boolean
  /** Classes for the trigger swatch button. Defaults to the small property-row swatch. */
  className?: string
  title?: string
}

const TRIGGER_CLASS =
  'w-7 h-6 rounded cursor-pointer border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0'

/**
 * Drop-in replacement for `<input type="color">` with a curated swatch palette,
 * hue / saturation / lightness sliders, a hex field, and an escape hatch to the
 * OS colour picker. `onChange` streams a debounced preview while tuning;
 * `onCommit` carries the final hex on release / swatch / blur / dismiss so the
 * caller can flush an immediate send.
 */
export function ColorPicker({ value, onChange, onCommit, disabled, className, title }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Dismiss from the popover just closes — it has already committed its own hex.
  const close = useCallback(() => setOpen(false), [])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (open) {
            onCommit?.(value)
            setOpen(false)
          } else {
            setOpen(true)
          }
        }}
        title={title ?? value}
        aria-label="Pick colour"
        className={className ?? TRIGGER_CLASS}
        style={{ backgroundColor: value }}
      />
      {open && !disabled && (
        <ColorPopover anchor={triggerRef} value={value} onChange={onChange} onCommit={onCommit} onClose={close} />
      )}
    </>
  )
}

interface PopoverProps {
  anchor: React.RefObject<HTMLButtonElement | null>
  value: string
  onChange: (hex: string) => void
  onCommit?: (hex: string) => void
  onClose: () => void
}

const POPOVER_WIDTH = 236
const SCREEN_MARGIN = 8

/**
 * Mounted fresh each time the picker opens, so it seeds its editing state from
 * `value` once. While open this component owns the colour (the popover dismisses
 * on any outside interaction before `value` could change underneath it).
 */
function ColorPopover({ anchor, value, onChange, onCommit, onClose }: PopoverProps) {
  const popRef = useRef<HTMLDivElement>(null)
  const nativeRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const [hsl, setHsl] = useState<Hsl>(() => hexToHsl(value))
  const [hex, setHex] = useState(() => normalizeHex(value) ?? '#000000')
  const [hexText, setHexText] = useState(hex)

  // Latest values for the document-level dismiss listeners, so they subscribe once.
  const latest = useRef({ hex, onCommit, onClose })
  useEffect(() => {
    latest.current = { hex, onCommit, onClose }
  })

  /** Apply a colour internally; `commit` chooses the immediate vs debounced channel. */
  const apply = (h: string, commit: boolean) => {
    setHsl(hexToHsl(h))
    setHex(h)
    setHexText(h)
    if (commit) onCommit?.(h)
    else onChange(h)
  }

  const slide = (next: Hsl) => {
    setHsl(next)
    const h = hslToHex(next.h, next.s, next.l)
    setHex(h)
    setHexText(h)
    onChange(h)
  }

  // Position under the trigger, flipping above when out of room; track scroll/resize.
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      const h = popRef.current?.offsetHeight ?? 320
      let left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - SCREEN_MARGIN)
      left = Math.max(SCREEN_MARGIN, left)
      let top = rect.bottom + 6
      if (top + h > window.innerHeight - SCREEN_MARGIN) {
        top = Math.max(SCREEN_MARGIN, rect.top - 6 - h)
      }
      setPos({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  // Dismiss on outside pointer-down or Escape — committing the current hex first.
  useEffect(() => {
    const dismiss = () => {
      latest.current.onCommit?.(latest.current.hex)
      latest.current.onClose()
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t) || anchor.current?.contains(t)) return
      dismiss()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor])

  const hueTrack =
    'linear-gradient(to right,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)'
  const satTrack = `linear-gradient(to right,${hslToHex(hsl.h, 0, hsl.l)},${hslToHex(hsl.h, 100, hsl.l)})`
  const lightTrack = `linear-gradient(to right,#000000,${hslToHex(hsl.h, hsl.s, 50)},#ffffff)`

  const sliders: Array<[string, number, number, string, (v: number) => void]> = [
    ['H', hsl.h, 360, hueTrack, (v) => slide({ ...hsl, h: v })],
    ['S', hsl.s, 100, satTrack, (v) => slide({ ...hsl, s: v })],
    ['L', hsl.l, 100, lightTrack, (v) => slide({ ...hsl, l: v })],
  ]

  return createPortal(
    <div
      ref={popRef}
      className="fixed z-60 w-59 rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-2xl"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {/* Current colour + hex field */}
      <div className="mb-3 flex items-center gap-2">
        <div className="h-8 w-8 shrink-0 rounded border border-slate-700" style={{ backgroundColor: hex }} />
        <div className="flex flex-1 items-center rounded border border-slate-700 bg-slate-800 px-1.5">
          <span className="text-[11px] text-slate-500">#</span>
          <input
            type="text"
            value={hexText.replace(/^#/, '')}
            spellCheck={false}
            maxLength={6}
            onChange={(e) => {
              const raw = e.target.value
              setHexText(raw)
              const n = normalizeHex(raw)
              if (n) {
                setHsl(hexToHsl(n))
                setHex(n)
                onChange(n)
              }
            }}
            onBlur={() => {
              setHexText(hex)
              onCommit?.(hex)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setHexText(hex)
                onCommit?.(hex)
              }
            }}
            className="w-full bg-transparent py-1 font-mono text-[11px] uppercase text-white outline-none"
          />
        </div>
      </div>

      {/* Hue / Saturation / Lightness sliders */}
      <div className="mb-3 space-y-2">
        {sliders.map(([label, val, max, track, set]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-3 shrink-0 text-[10px] font-medium text-slate-500">{label}</span>
            <input
              type="range"
              min={0}
              max={max}
              value={val}
              onChange={(e) => set(Number(e.target.value))}
              onPointerUp={() => onCommit?.(hex)}
              onKeyUp={() => onCommit?.(hex)}
              className="color-slider flex-1"
              style={{ background: track }}
            />
            <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-slate-400">
              {Math.round(val)}
            </span>
          </div>
        ))}
      </div>

      {/* Swatch palette */}
      <div className="mb-3 grid grid-cols-5 gap-1.5">
        {SWATCHES.map((c) => {
          const active = c.toLowerCase() === hex.toLowerCase()
          return (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => apply(c, true)}
              className={`h-6 rounded border transition-transform hover:scale-110 ${
                active ? 'border-white ring-1 ring-white' : 'border-slate-700'
              }`}
              style={{ backgroundColor: c }}
            />
          )
        })}
      </div>

      {/* System picker escape hatch */}
      <button
        type="button"
        onClick={() => nativeRef.current?.click()}
        className="flex w-full items-center justify-center gap-1.5 rounded border border-slate-700 bg-slate-800 py-1.5 text-[10px] text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.012 17.5 2 12 2z" />
        </svg>
        System picker
      </button>
      <input
        ref={nativeRef}
        type="color"
        value={hex}
        onInput={(e) => apply((e.target as HTMLInputElement).value, false)}
        onChange={(e) => apply(e.target.value, true)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
    </div>,
    document.body,
  )
}
