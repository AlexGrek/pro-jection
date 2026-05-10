import type { ColorStop } from '@/lib/scene'

/** Parses #rrggbb (with or without leading #) to a 24-bit integer suitable for Phaser fill/stroke colors. */
export function hexToInt(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  return Number.isNaN(n) ? 0 : n
}

/** Converts a ColorStop to a CSS rgba() string for use with the HTML5 Canvas API. */
export function stopToRgba(stop: ColorStop): string {
  const hex = stop.color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16) || 0
  const g = parseInt(hex.slice(2, 4), 16) || 0
  const b = parseInt(hex.slice(4, 6), 16) || 0
  const a = Math.max(0, Math.min(1, stop.alpha ?? 1))
  return `rgba(${r},${g},${b},${a})`
}
