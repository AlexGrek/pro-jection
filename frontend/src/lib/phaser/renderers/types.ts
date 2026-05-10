import type Phaser from 'phaser'
import type { Layer } from '@/lib/scene'

export type LayerObject =
  | Phaser.GameObjects.Text
  | Phaser.GameObjects.Rectangle
  | Phaser.GameObjects.Ellipse
  | Phaser.GameObjects.Image

export interface InteractiveOpts {
  /** Default true. When false, the object is selectable on click but not draggable. */
  draggable?: boolean
  /** Drag clamp margin in canvas pixels. Only used when draggable. */
  margin?: number
}

/**
 * The slice of ProjectionScene that renderer modules need. ProjectionScene
 * implements this implicitly — public/inherited members satisfy the shape.
 */
export interface RenderCtx {
  readonly add: Phaser.GameObjects.GameObjectFactory
  readonly textures: Phaser.Textures.TextureManager
  readonly gameObjects: Map<string, LayerObject>
  readonly layerData: Map<string, Layer>
  readonly editable: boolean
  readonly selectedId: string | null
  destroyGameObject(id: string): void
  attachInteractive(go: LayerObject, id: string, opts?: InteractiveOpts): void
}
