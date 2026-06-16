export const CANVAS_W = 1920
export const CANVAS_H = 1080

export const FILL_TEXTURE_PREFIX = 'fill-'
export const ICON_TEXTURE_PREFIX = 'icon-'
export const IMAGE_TEXTURE_PREFIX = 'img-'

/** Trough of the glow-breathing cycle, as a fraction of the configured strength.
 *  Above 0 so the glow eases in and out rather than blinking fully off. */
export const GLOW_BREATH_MIN = 0.25

/** Blue used for the grid overlay (tailwind blue-500), matching the selection accent. */
export const GRID_COLOR = 0x3b82f6
/** Square grid cell in canvas pixels — 1080/9 gives an even 16×9 grid. */
export const GRID_CELL = 120
/** Depth of the grid overlay: above every layer, below the selection graphics. */
export const GRID_DEPTH = 100_000_000
