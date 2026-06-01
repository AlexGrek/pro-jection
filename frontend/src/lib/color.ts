/**
 * Tiny colour helpers for the custom {@link ColorPicker}. Everything speaks the
 * `#rrggbb` hex wire format the scene layers store; HSL is only an editing
 * convenience for the hue / saturation / lightness sliders.
 */

export interface Hsl {
  /** Hue, 0–360. */
  h: number
  /** Saturation, 0–100. */
  s: number
  /** Lightness, 0–100. */
  l: number
}

/** Parse a `#rgb` / `#rrggbb` (with or without `#`) string to `[r,g,b]` 0–255, or null. */
export function parseHex(input: string): [number, number, number] | null {
  let h = input.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** Returns the canonical `#rrggbb` form of any accepted hex input, or null. */
export function normalizeHex(input: string): string | null {
  const rgb = parseHex(input)
  return rgb ? rgbToHex(...rgb) : null
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = (parseHex(hex) ?? [0, 0, 0]).map((n) => n / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToHex(h: number, s: number, l: number): string {
  const S = s / 100
  const L = l / 100
  const c = (1 - Math.abs(2 * L - 1)) * S
  const hp = ((((h % 360) + 360) % 360)) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r: number
  let g: number
  let b: number
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = L - c / 2
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** Curated swatch palette: greys + a Tailwind-ish spectrum. 5 columns × 6 rows. */
export const SWATCHES: string[] = [
  '#000000', '#404040', '#737373', '#a3a3a3', '#ffffff',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#facc15',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
  '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#fb7185', '#fda4af',
  '#7c2d12', '#1e293b', '#0f172a', '#064e3b', '#312e81',
]
