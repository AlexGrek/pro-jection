import type { BaseLayer } from './base'
import { DEFAULT_ANIMATIONS } from './base'

export type BarcodeFormat = 'code128' | 'ean13' | 'ean8' | 'upc' | 'qr'

export interface BarcodeLayer extends BaseLayer {
  type: 'barcode'
  /** Barcode payload string. Rules depend on selected format. */
  code: string
  format: BarcodeFormat
  /** Draw human-readable value below bars. */
  show_digits: boolean
  /** Foreground (bars + digits) color. */
  color: string
  /** Background color when not transparent. */
  bg_color: string
  /** When true, barcode background is fully transparent. */
  bg_transparent: boolean
  /** Width as a fraction of canvas width. Height is derived from the barcode aspect at render time. */
  width: number
  /** Legacy / wire-format field; display height is derived from width and texture aspect. */
  height: number
}

function randomDigits(length: number): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += Math.floor(Math.random() * 10).toString()
  }
  return out
}

function randomAlnum(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // avoid ambiguous chars
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

export function randomBarcodeValue(format: BarcodeFormat): string {
  if (format === 'ean13') return randomDigits(12)
  if (format === 'ean8') return randomDigits(7)
  if (format === 'upc') return randomDigits(11)
  if (format === 'qr') return `QR-${randomAlnum(10)}`
  // CODE128 accepts rich character sets; numeric by default keeps UX simple.
  return randomDigits(12)
}

export const DEFAULT_BARCODE_LAYER: Omit<BarcodeLayer, 'id'> = {
  type: 'barcode',
  x: 0.5,
  y: 0.5,
  code: randomBarcodeValue('code128'),
  format: 'code128',
  show_digits: true,
  color: '#111111',
  bg_color: '#ffffff',
  bg_transparent: false,
  width: 0.4,
  height: 0.22,
  opacity: 1,
  animations: DEFAULT_ANIMATIONS,
  modifiers: [],
}
