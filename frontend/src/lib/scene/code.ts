import type { BaseLayer } from './base'
import { DEFAULT_ANIMATIONS } from './base'

export type CodeVariant = 'block' | 'oneliner' | 'hex' | 'binary' | 'cli'

/** Maximum number of colours in a code palette. */
export const CODE_MAX_COLORS = 6

/** Named syntax-highlight presets, each a 5-colour [keyword, string, comment, number,
 *  plain] role palette. `custom` is not a preset — it marks that `colors` was hand-edited
 *  and no longer matches any preset below. */
export type CodeScheme = 'vscode-dark' | 'monokai' | 'dracula' | 'solarized-dark' | 'nord' | 'gruvbox-dark' | 'custom'

export const CODE_SCHEME_PRESETS: Record<Exclude<CodeScheme, 'custom'>, string[]> = {
  'vscode-dark': ['#569cd6', '#ce9178', '#6a9955', '#b5cea8', '#d4d4d4'],
  monokai: ['#f92672', '#e6db74', '#75715e', '#ae81ff', '#f8f8f2'],
  dracula: ['#ff79c6', '#f1fa8c', '#6272a4', '#bd93f9', '#f8f8f2'],
  'solarized-dark': ['#859900', '#2aa198', '#586e75', '#d33682', '#839496'],
  nord: ['#81a1c1', '#a3be8c', '#616e88', '#d08770', '#e5e9f0'],
  'gruvbox-dark': ['#fb4934', '#b8bb26', '#928374', '#d3869b', '#ebdbb2'],
}

export const CODE_SCHEME_LABELS: Record<Exclude<CodeScheme, 'custom'>, string> = {
  'vscode-dark': 'VS Code Dark',
  monokai: 'Monokai',
  dracula: 'Dracula',
  'solarized-dark': 'Solarized Dark',
  nord: 'Nord',
  'gruvbox-dark': 'Gruvbox Dark',
}

/** A generated pattern that reads as code — a scrolling function body, a giant
 *  minified one-liner, a hex/binary dump, or a fake terminal session. Deterministic:
 *  `seed` drives the PRNG so every connected client (controller + projector) renders
 *  the exact same pattern — the backend never re-generates or parses this, it just
 *  relays the scene blob. */
export interface CodeLayer extends BaseLayer {
  type: 'code'
  variant: CodeVariant
  /** Monospace glyph size, in canvas pixels. */
  font_size: number
  /** Which named preset `colors` currently matches, or `custom` after a hand edit.
   *  Purely a UI hint for the scheme picker — rendering only ever reads `colors`. */
  scheme: CodeScheme
  /** Palette of 1–6 hex colours standing in for syntax-highlight roles (keyword,
   *  string, comment, number, plain), assigned round-robin if fewer than 5 given. */
  colors: string[]
  /** PRNG seed. Same seed + settings always produce the same generated pattern. */
  seed: number
  /** Bounding box width as a fraction of canvas width. Only used when fullscreen=false. */
  width: number
  /** Bounding box height as a fraction of canvas height. Only used when fullscreen=false. */
  height: number
  /** When true, the pattern fills the entire canvas (1920×1080). */
  fullscreen: boolean
}

export const DEFAULT_CODE_LAYER: Omit<CodeLayer, 'id'> = {
  type: 'code',
  x: 0.5,
  y: 0.5,
  opacity: 1,
  animations: DEFAULT_ANIMATIONS,
  modifiers: [],
  variant: 'block',
  font_size: 22,
  scheme: 'vscode-dark',
  colors: [...CODE_SCHEME_PRESETS['vscode-dark']],
  seed: 1,
  width: 0.5,
  height: 0.5,
  fullscreen: false,
}

export function randomCodeSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000)
}
