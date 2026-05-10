export const FONT_OPTIONS = [
  { id: 'outfit',         label: 'Outfit',           css: '"Outfit Variable", "Outfit", sans-serif' },
  { id: 'inter',          label: 'Inter',            css: '"Inter Variable", "Inter", sans-serif' },
  { id: 'space-grotesk',  label: 'Space Grotesk',    css: '"Space Grotesk Variable", "Space Grotesk", sans-serif' },
  { id: 'playfair',       label: 'Playfair Display', css: '"Playfair Display Variable", "Playfair Display", serif' },
  { id: 'space-mono',     label: 'Space Mono',       css: '"Space Mono", monospace' },
  { id: 'bebas-neue',     label: 'Bebas Neue',       css: '"Bebas Neue", sans-serif' },
  { id: 'dancing-script', label: 'Dancing Script',   css: '"Dancing Script Variable", "Dancing Script", cursive' },
] as const

export type FontId = typeof FONT_OPTIONS[number]['id']

export const DEFAULT_FONT_ID: FontId = 'outfit'

export const FONT_CSS: Record<FontId, string> = Object.fromEntries(
  FONT_OPTIONS.map((f) => [f.id, f.css]),
) as Record<FontId, string>
