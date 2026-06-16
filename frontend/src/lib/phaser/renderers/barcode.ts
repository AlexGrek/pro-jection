import Phaser from 'phaser'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type { BarcodeLayer } from '@/lib/scene'
import { BARCODE_TEXTURE_PREFIX, CANVAS_H, CANVAS_W } from '../constants'
import type { RenderCtx } from './types'

const signatures = new Map<string, string>()
/** Natural width/height of the generated barcode texture per layer id. */
const aspects = new Map<string, number>()
/** Track which QR signature is currently being generated per layer id. */
const pendingQr = new Map<string, string>()

/** Typical CODE128-with-digits aspect — used before first render or for placeholders. */
const DEFAULT_ASPECT = 3.2
const QR_DEFAULT_ASPECT = 1
const QR_TEXT_FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
const QR_TEXTURE_SIZE = 1024
const BARCODE_HEIGHT_PX = 220
const BARCODE_FONT_PX = 44
const BARCODE_MARGIN_PX = 16
const BARCODE_TEXT_MARGIN_PX = 12

function displaySize(layer: BarcodeLayer): [number, number] {
  const w = Math.max(40, layer.width * CANVAS_W)
  const aspect = aspects.get(layer.id) ?? (layer.format === 'qr' ? QR_DEFAULT_ASPECT : DEFAULT_ASPECT)
  return [w, w / aspect]
}

const FORMAT_MAP: Partial<Record<BarcodeLayer['format'], string>> = {
  code128: 'CODE128',
  ean13: 'EAN13',
  ean8: 'EAN8',
  upc: 'UPC',
}

function validForFormat(code: string, format: BarcodeLayer['format']): boolean {
  if (format === 'qr') return code.length > 0
  if (format === 'code128') return code.length > 0
  if (format === 'ean13') return /^\d{12,13}$/.test(code)
  if (format === 'ean8') return /^\d{7,8}$/.test(code)
  return /^\d{11,12}$/.test(code)
}

function normalizedCode(code: string, format: BarcodeLayer['format']): string {
  if (format === 'qr') return code
  const digits = code.replace(/\D+/g, '')
  if (format === 'ean13') return digits.slice(0, 13)
  if (format === 'ean8') return digits.slice(0, 8)
  if (format === 'upc') return digits.slice(0, 12)
  return code
}

function layerSignature(layer: BarcodeLayer, code: string): string {
  return JSON.stringify([code, layer.format, layer.show_digits, layer.color, layer.bg_color, layer.bg_transparent])
}

function mountPlaceholder(ctx: RenderCtx, layer: BarcodeLayer, invalid = false): void {
  const px = layer.x * CANVAS_W
  const py = layer.y * CANVAS_H
  const [displayW, displayH] = displaySize(layer)
  const existing = ctx.gameObjects.get(layer.id)

  if (existing instanceof Phaser.GameObjects.Rectangle) {
    existing
      .setPosition(px, py)
      .setSize(displayW, displayH)
      .setAlpha(layer.opacity)
      .setStrokeStyle(2, invalid ? 0xef4444 : 0x334155)
  } else {
    if (existing) ctx.destroyGameObject(layer.id)
    const placeholder = ctx.add
      .rectangle(px, py, displayW, displayH, invalid ? 0x111827 : 0x1e293b)
      .setStrokeStyle(2, invalid ? 0xef4444 : 0x334155)
      .setAlpha(layer.opacity)
    ctx.gameObjects.set(layer.id, placeholder)
    if (ctx.editable) ctx.attachInteractive(placeholder, layer.id)
  }
}

function mountImage(ctx: RenderCtx, layer: BarcodeLayer, key: string): void {
  if (!ctx.textures.exists(key)) {
    mountPlaceholder(ctx, layer)
    return
  }

  const px = layer.x * CANVAS_W
  const py = layer.y * CANVAS_H
  const [displayW, displayH] = displaySize(layer)
  const existing = ctx.gameObjects.get(layer.id)

  if (existing instanceof Phaser.GameObjects.Image) {
    existing
      .setTexture(key)
      .setPosition(px, py)
      .setDisplaySize(displayW, displayH)
      .setAlpha(layer.opacity)
  } else {
    if (existing) {
      existing.destroy()
      ctx.gameObjects.delete(layer.id)
    }
    const go = ctx.add
      .image(px, py, key)
      .setOrigin(0.5)
      .setDisplaySize(displayW, displayH)
      .setAlpha(layer.opacity)
    ctx.gameObjects.set(layer.id, go)
    if (ctx.editable) ctx.attachInteractive(go, layer.id)
  }
}

function uploadTexture(ctx: RenderCtx, key: string, source: HTMLCanvasElement): void {
  if (ctx.textures.exists(key)) ctx.textures.remove(key)
  const tex = ctx.textures.createCanvas(key, source.width, source.height) as Phaser.Textures.CanvasTexture
  const c = tex.getContext()
  c.clearRect(0, 0, source.width, source.height)
  c.drawImage(source, 0, 0)
  tex.refresh()
}

function startQrGeneration(ctx: RenderCtx, layer: BarcodeLayer, code: string, signature: string, key: string): void {
  if (pendingQr.get(layer.id) === signature) return
  pendingQr.set(layer.id, signature)
  aspects.set(layer.id, QR_DEFAULT_ASPECT)

  const base = document.createElement('canvas')

  QRCode.toCanvas(base, code, {
    width: QR_TEXTURE_SIZE,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: layer.color,
      light: layer.bg_transparent ? '#00000000' : layer.bg_color,
    },
  })
    .then(() => {
      const cur = ctx.layerData.get(layer.id) as BarcodeLayer | undefined
      const curCode = cur ? normalizedCode(cur.code, cur.format) : ''
      const curSig = cur ? layerSignature(cur, curCode) : null
      if (!cur || cur.format !== 'qr' || curSig !== signature) return

      const canvas = document.createElement('canvas')
      if (cur.show_digits) {
        const fontPx = 44
        const pad = 16
        canvas.width = base.width
        canvas.height = base.height + fontPx + pad * 2
        const c2 = canvas.getContext('2d')
        if (!c2) return
        if (!cur.bg_transparent) {
          c2.fillStyle = cur.bg_color
          c2.fillRect(0, 0, canvas.width, canvas.height)
        } else {
          c2.clearRect(0, 0, canvas.width, canvas.height)
        }
        c2.drawImage(base, 0, 0)
        c2.fillStyle = cur.color
        c2.font = `${fontPx}px ${QR_TEXT_FONT}`
        c2.textAlign = 'center'
        c2.textBaseline = 'middle'
        c2.fillText(curCode, canvas.width / 2, base.height + pad + fontPx / 2)
      } else {
        canvas.width = base.width
        canvas.height = base.height
        const c2 = canvas.getContext('2d')
        if (!c2) return
        c2.clearRect(0, 0, canvas.width, canvas.height)
        c2.drawImage(base, 0, 0)
      }

      aspects.set(layer.id, canvas.width / (canvas.height || 1))
      signatures.set(layer.id, signature)
      pendingQr.delete(layer.id)
      uploadTexture(ctx, key, canvas)
      mountImage(ctx, cur, key)
    })
    .catch(() => {
      if (pendingQr.get(layer.id) === signature) pendingQr.delete(layer.id)
    })
}

export function cleanupBarcode(id: string): void {
  signatures.delete(id)
  aspects.delete(id)
  pendingQr.delete(id)
}

export function applyBarcode(ctx: RenderCtx, layer: BarcodeLayer): void {
  const key = `${BARCODE_TEXTURE_PREFIX}${layer.id}`
  const code = normalizedCode(layer.code, layer.format)

  if (!validForFormat(code, layer.format)) {
    mountPlaceholder(ctx, layer, true)
    signatures.delete(layer.id)
    aspects.delete(layer.id)
    pendingQr.delete(layer.id)
    return
  }

  const signature = layerSignature(layer, code)
  const needsRegenerate = signatures.get(layer.id) !== signature || !ctx.textures.exists(key)

  if (needsRegenerate) {
    if (layer.format === 'qr') {
      // Never bind an Image to a texture that is missing or about to be replaced.
      mountPlaceholder(ctx, layer)
      startQrGeneration(ctx, layer, code, signature, key)
      return
    }

    const barcodeCanvas = document.createElement('canvas')
    try {
      const jsFormat = FORMAT_MAP[layer.format]
      if (!jsFormat) throw new Error('format')
      JsBarcode(barcodeCanvas, code, {
        format: jsFormat,
        displayValue: layer.show_digits,
        lineColor: layer.color,
        background: layer.bg_transparent ? 'rgba(0,0,0,0)' : layer.bg_color,
        margin: BARCODE_MARGIN_PX,
        width: jsFormat === 'CODE128' ? 5 : 4,
        height: BARCODE_HEIGHT_PX,
        fontSize: BARCODE_FONT_PX,
        textMargin: BARCODE_TEXT_MARGIN_PX,
      })
    } catch {
      mountPlaceholder(ctx, layer, true)
      signatures.delete(layer.id)
      aspects.delete(layer.id)
      return
    }

    aspects.set(layer.id, barcodeCanvas.width / (barcodeCanvas.height || 1))
    signatures.set(layer.id, signature)
    uploadTexture(ctx, key, barcodeCanvas)
  }

  if (layer.format === 'qr' && pendingQr.has(layer.id)) {
    mountPlaceholder(ctx, layer)
    return
  }

  mountImage(ctx, layer, key)
}
