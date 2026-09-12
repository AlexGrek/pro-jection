import Phaser from 'phaser'
import type { CodeLayer } from '@/lib/scene'
import { CANVAS_W, CANVAS_H, CODE_TEXTURE_PREFIX } from '../constants'
import type { RenderCtx } from './types'

/** Deterministic PRNG (mulberry32) — same seed always yields the same sequence, so
 *  every client renders an identical generated pattern from the same scene blob. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rand = () => number

function pick<T>(rand: Rand, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}

function textureSize(layer: CodeLayer): [number, number] {
  if (layer.fullscreen) return [CANVAS_W, CANVAS_H]
  return [Math.max(4, Math.round(layer.width * CANVAS_W)), Math.max(4, Math.round(layer.height * CANVAS_H))]
}

// Fake syntax-highlight roles, indexed into layer.colors (wraps if the palette is shorter).
const ROLE_KEYWORD = 0
const ROLE_STRING = 1
const ROLE_COMMENT = 2
const ROLE_NUMBER = 3
const ROLE_PLAIN = 4

function colorFor(layer: CodeLayer, role: number): string {
  const palette = layer.colors.length > 0 ? layer.colors : ['#d4d4d4']
  return palette[role % palette.length]
}

const MONOSPACE_FONT = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace'

const KEYWORDS = ['function', 'const', 'let', 'return', 'if', 'else', 'import', 'export', 'class', 'async', 'await', 'for', 'while', 'new', 'this', 'null', 'true', 'typeof', 'struct', 'impl', 'match', 'pub', 'fn']
const PUNCT = ['(', ')', '{', '}', '[', ']', ';', ',', '.', '=', '=>', '<', '>', '+', '-', '*', '&&', '||', '!', ':']
const IDENT_ALPHABET = 'abcdefghijklmnopqrstuvwxyz'

function randIdent(rand: Rand): string {
  const len = 3 + Math.floor(rand() * 7)
  let s = ''
  for (let i = 0; i < len; i++) s += IDENT_ALPHABET[Math.floor(rand() * IDENT_ALPHABET.length)]
  return s
}

function randNumber(rand: Rand): string {
  return String(Math.floor(rand() * 9999))
}

function randString(rand: Rand): string {
  return `"${randIdent(rand)}"`
}

/** One random code-ish token as [text, role]. */
function randToken(rand: Rand): [string, number] {
  const kind = rand()
  if (kind < 0.22) return [pick(rand, KEYWORDS), ROLE_KEYWORD]
  if (kind < 0.35) return [randString(rand), ROLE_STRING]
  if (kind < 0.48) return [randNumber(rand), ROLE_NUMBER]
  if (kind < 0.7) return [pick(rand, PUNCT), ROLE_PLAIN]
  return [randIdent(rand), ROLE_PLAIN]
}

function drawBlock(c: CanvasRenderingContext2D, layer: CodeLayer, tw: number, th: number, rand: Rand): void {
  const fontSize = layer.font_size
  c.font = `${fontSize}px ${MONOSPACE_FONT}`
  c.textBaseline = 'alphabetic'
  const lineHeight = fontSize * 1.5
  const indentWidth = c.measureText('  ').width
  const padding = fontSize * 0.5
  const maxX = tw - padding
  const numLines = Math.max(1, Math.floor((th - padding) / lineHeight))

  let indent = 0
  for (let i = 0; i < numLines; i++) {
    const y = padding + (i + 1) * lineHeight - lineHeight * 0.3
    const x0 = padding + indent * indentWidth
    let x = x0

    if (rand() < 0.12) continue // blank line

    if (rand() < 0.15) {
      const text = `// ${randIdent(rand)} ${randIdent(rand)}`
      c.fillStyle = colorFor(layer, ROLE_COMMENT)
      c.fillText(text, x0, y)
      continue
    }

    const tokenCount = 3 + Math.floor(rand() * 6)
    for (let t = 0; t < tokenCount; t++) {
      if (x > maxX) break
      const [text, role] = randToken(rand)
      c.fillStyle = colorFor(layer, role)
      c.fillText(text, x, y)
      x += c.measureText(text).width + indentWidth * 0.4

      if (text === '{') indent = Math.min(indent + 1, 5)
      if (text === '}') indent = Math.max(indent - 1, 0)
    }
  }
}

/** One continuous, unbroken stream of tokens (no indentation, no line logic) wrapped
 *  across the full texture height — like a giant minified one-liner as an editor would
 *  soft-wrap it, so the pattern fills the bounding box instead of a single clipped row. */
function drawOneliner(c: CanvasRenderingContext2D, layer: CodeLayer, tw: number, th: number, rand: Rand): void {
  const fontSize = layer.font_size
  c.font = `${fontSize}px ${MONOSPACE_FONT}`
  c.textBaseline = 'alphabetic'
  const lineHeight = fontSize * 1.3
  const padding = fontSize * 0.5
  const maxX = tw - padding
  const spaceW = c.measureText(' ').width
  const numLines = Math.max(1, Math.floor((th - padding) / lineHeight))

  for (let i = 0; i < numLines; i++) {
    const y = padding + (i + 1) * lineHeight - lineHeight * 0.3
    let x = padding
    while (x < maxX) {
      const [text, role] = randToken(rand)
      c.fillStyle = colorFor(layer, role)
      c.fillText(text, x, y)
      x += c.measureText(text).width + (rand() < 0.7 ? 0 : spaceW)
    }
  }
}

function drawHex(c: CanvasRenderingContext2D, layer: CodeLayer, tw: number, th: number, rand: Rand): void {
  const fontSize = layer.font_size
  c.font = `${fontSize}px ${MONOSPACE_FONT}`
  c.textBaseline = 'alphabetic'
  const lineHeight = fontSize * 1.4
  const padding = fontSize * 0.5
  const charW = c.measureText('0').width
  const numLines = Math.max(1, Math.floor((th - padding) / lineHeight))

  // offset (8 hex + ':' + ' ' = 10 chars) + hex groups (3 chars each) + ascii gutter ('|' + n + '|' = n+2, plus a spacer).
  const maxChars = Math.floor((tw - padding * 2) / charW)
  const bytesPerLine = Phaser.Math.Clamp(Math.floor((maxChars - 10 - 3) / 3), 4, 32)

  let offset = 0
  for (let i = 0; i < numLines; i++) {
    const y = padding + (i + 1) * lineHeight - lineHeight * 0.25
    let x = padding

    const offsetStr = offset.toString(16).padStart(8, '0')
    c.fillStyle = colorFor(layer, ROLE_COMMENT)
    c.fillText(`${offsetStr}:`, x, y)
    x += charW * 9

    const bytes: number[] = []
    for (let b = 0; b < bytesPerLine; b++) {
      const byte = Math.floor(rand() * 256)
      bytes.push(byte)
      const hex = byte.toString(16).padStart(2, '0')
      const role = b % 2 === 0 ? ROLE_NUMBER : ROLE_STRING
      c.fillStyle = colorFor(layer, role)
      c.fillText(hex, x, y)
      x += charW * 3
    }

    x += charW
    let ascii = ''
    for (const byte of bytes) ascii += byte >= 33 && byte <= 126 ? String.fromCharCode(byte) : '.'
    c.fillStyle = colorFor(layer, ROLE_COMMENT)
    c.fillText(`|${ascii}|`, x, y)

    offset += bytesPerLine
  }
}

function drawBinary(c: CanvasRenderingContext2D, layer: CodeLayer, tw: number, th: number, rand: Rand): void {
  const fontSize = layer.font_size
  c.font = `${fontSize}px ${MONOSPACE_FONT}`
  c.textBaseline = 'alphabetic'
  const lineHeight = fontSize * 1.4
  const padding = fontSize * 0.5
  const charW = c.measureText('0').width
  const numLines = Math.max(1, Math.floor((th - padding) / lineHeight))
  const maxX = tw - padding

  for (let i = 0; i < numLines; i++) {
    const y = padding + (i + 1) * lineHeight - lineHeight * 0.25
    let x = padding
    let byteIdx = 0
    while (x < maxX) {
      let byte = ''
      for (let b = 0; b < 8; b++) byte += rand() < 0.5 ? '0' : '1'
      const role = byteIdx % 2 === 0 ? ROLE_NUMBER : ROLE_PLAIN
      c.fillStyle = colorFor(layer, role)
      c.fillText(byte, x, y)
      x += charW * 9
      byteIdx++
    }
  }
}

const CLI_COMMANDS = ['git', 'npm', 'docker', 'curl', 'ssh', 'make', 'python3', 'cat', 'grep', 'ls', 'cd', 'kubectl', 'cargo', 'node']
const CLI_ARGS = ['--verbose', '-la', 'status', 'build', 'run', 'push', 'origin', 'main', './scripts/deploy.sh', '--force', 'localhost:8080', 'install']
const CLI_OUTPUT = ['Done.', 'Build succeeded', 'Connection established', '3 files changed', 'error: not found', 'Fetching origin', 'Compiling…', '100% complete', 'OK', 'Warning: deprecated flag']

function randHostTag(rand: Rand): string {
  return `user@host-${Math.floor(rand() * 90 + 10)}`
}

function drawCli(c: CanvasRenderingContext2D, layer: CodeLayer, tw: number, th: number, rand: Rand): void {
  const fontSize = layer.font_size
  c.font = `${fontSize}px ${MONOSPACE_FONT}`
  c.textBaseline = 'alphabetic'
  const lineHeight = fontSize * 1.5
  const padding = fontSize * 0.5
  const maxX = tw - padding
  const numLines = Math.max(1, Math.floor((th - padding) / lineHeight))

  for (let i = 0; i < numLines; i++) {
    const y = padding + (i + 1) * lineHeight - lineHeight * 0.3
    let x = padding

    if (i === 0 || rand() < 0.45) {
      const prompt = `${randHostTag(rand)}:~$ `
      c.fillStyle = colorFor(layer, ROLE_COMMENT)
      c.fillText(prompt, x, y)
      x += c.measureText(prompt).width

      const cmd = pick(rand, CLI_COMMANDS)
      c.fillStyle = colorFor(layer, ROLE_KEYWORD)
      c.fillText(cmd, x, y)
      x += c.measureText(`${cmd} `).width

      const argCount = 1 + Math.floor(rand() * 3)
      for (let a = 0; a < argCount; a++) {
        if (x > maxX) break
        const arg = pick(rand, CLI_ARGS)
        c.fillStyle = colorFor(layer, ROLE_STRING)
        c.fillText(arg, x, y)
        x += c.measureText(`${arg} `).width
      }
    } else {
      const out = pick(rand, CLI_OUTPUT)
      c.fillStyle = colorFor(layer, ROLE_PLAIN)
      c.fillText(out, x, y)
    }
  }
}

function drawCode(c: CanvasRenderingContext2D, layer: CodeLayer, tw: number, th: number): void {
  c.clearRect(0, 0, tw, th)
  const rand = mulberry32(layer.seed)
  switch (layer.variant) {
    case 'block': return drawBlock(c, layer, tw, th, rand)
    case 'oneliner': return drawOneliner(c, layer, tw, th, rand)
    case 'hex': return drawHex(c, layer, tw, th, rand)
    case 'binary': return drawBinary(c, layer, tw, th, rand)
    case 'cli': return drawCli(c, layer, tw, th, rand)
  }
}

export function applyCode(ctx: RenderCtx, layer: CodeLayer): void {
  const key = `${CODE_TEXTURE_PREFIX}${layer.id}`
  const [tw, th] = textureSize(layer)
  const px = layer.fullscreen ? CANVAS_W / 2 : layer.x * CANVAS_W
  const py = layer.fullscreen ? CANVAS_H / 2 : layer.y * CANVAS_H

  const existing = ctx.gameObjects.get(layer.id)

  // Destroy if wrong type or texture dimensions changed.
  let needCreate = !existing || !(existing instanceof Phaser.GameObjects.Image)
  if (!needCreate && ctx.textures.exists(key)) {
    const src = ctx.textures.get(key).source[0]
    if (src.width !== tw || src.height !== th) needCreate = true
  } else if (!needCreate) {
    needCreate = true
  }

  if (needCreate && existing) ctx.destroyGameObject(layer.id)

  let canvasTex: Phaser.Textures.CanvasTexture
  if (needCreate) {
    if (ctx.textures.exists(key)) ctx.textures.remove(key)
    canvasTex = ctx.textures.createCanvas(key, tw, th) as Phaser.Textures.CanvasTexture
  } else {
    canvasTex = ctx.textures.get(key) as Phaser.Textures.CanvasTexture
  }

  const c2d = canvasTex.getContext()
  if (c2d) drawCode(c2d, layer, tw, th)
  canvasTex.refresh()

  if (needCreate) {
    const img = ctx.add.image(px, py, key).setOrigin(0.5).setAlpha(layer.opacity)
    ctx.gameObjects.set(layer.id, img)
    if (ctx.editable) {
      ctx.attachInteractive(img, layer.id, { draggable: !layer.fullscreen })
    }
  } else {
    const img = existing as Phaser.GameObjects.Image
    img.setPosition(px, py).setAlpha(layer.opacity)
  }
}
