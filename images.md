# Image Layers

Image layers let the controller upload raster and vector images (PNG, JPEG, WebP, SVG) that are stored on the server and displayed on both the controller canvas and all connected projectors. The uploaded URL is embedded directly in the scene JSON so projectors fetch the image from the same backend that relayed the scene.

---

## Layer type

```typescript
interface ImageLayer extends BaseLayer {
  type: 'image'
  url: string   // empty string until an image is uploaded
  width: number // fraction of canvas width (0–1); height is derived from the image aspect ratio
}
```

`BaseLayer` fields (`x`, `y`, `opacity`, `animations`, `modifiers`) work identically to other layer types. Array and matrix modifiers are fully supported; glow is supported. The layer is draggable.

Default values when a new Image layer is added:

| field     | default |
|-----------|---------|
| `x`       | `0.5`   |
| `y`       | `0.5`   |
| `width`   | `0.4`   |
| `url`     | `""`    |
| `opacity` | `1`     |

---

## Upload API

### `POST /api/useruploads`

Accepts a `multipart/form-data` body with a single field named `file`. Accepted MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`.

Maximum body size: **20 MB**.

The file is stored via the configured OpenDAL backend (the same storage the rest of the app uses) under the path `uploads/{uuid}.{ext}`. The UUID is generated fresh per upload so filenames never collide and URLs are effectively immutable.

**Response `200`**
```json
{ "url": "/api/useruploads/550e8400-e29b-41d4-a716-446655440000.png" }
```

**Response `400`** — missing or unreadable `file` field.

**Response `415`** — file extension not in the allowed list.

**Response `500`** — storage write failed (check backend logs).

---

### `GET /api/useruploads/{key}`

Serves a previously uploaded file. `{key}` is the filename portion of the URL returned by the upload endpoint (e.g. `550e8400-e29b-41d4-a716-446655440000.png`).

**Response `200`** — file bytes with the appropriate `Content-Type` and `Cache-Control: public, max-age=31536000, immutable`.

**Response `404`** — key does not exist in storage.

Because the URL contains a UUID, the response is safe to cache indefinitely. Replacing an image uploads a new file and stores the new URL in the scene; the old file is not deleted.

---

## Storage

Files are written to the configured OpenDAL operator (see [storage.rs](backend/src/storage.rs)) under the key `uploads/{uuid}.{ext}`. For the `fs` backend this is a subdirectory of the storage root on the PVC. For `s3` it is an object key prefix. No other part of the app reads or writes the `uploads/` namespace.

Uploaded files persist for the lifetime of the storage backend. They are **not** cleaned up when sessions expire — the session cleanup task only manages in-RAM session state.

---

## Renderer

The Phaser renderer ([renderers/image.ts](frontend/src/lib/phaser/renderers/image.ts)) handles two states:

**Empty URL** — renders a dark placeholder rectangle at the configured `width` × `width × 0.5625` (16:9) so the layer occupies space in the canvas while no image has been uploaded yet.

**URL set** — loads the image via the browser's native `Image` API with `crossOrigin = "anonymous"`, draws it into a `CanvasTexture` (source resolution capped at 2048 × 2048), then displays it as a `Phaser.GameObjects.Image` scaled to `width × canvas_width` on the long axis, preserving the natural aspect ratio.

The load is asynchronous. While the image is in flight the placeholder remains visible. If the URL changes before the load completes (e.g. the user immediately replaces the image) the stale response is discarded. If the load fails the URL is cleared from the internal tracking map so the next `applyScene` call retries.

`destroyGameObject` removes both the Phaser game object and the `CanvasTexture`, and clears the module-level URL and aspect-ratio caches via `cleanupImage(id)`.

---

## Controller UI

Selecting an Image layer in the Layers panel opens the Image properties panel:

- **Upload / Replace button** — opens a native file picker filtered to `image/png,image/jpeg,image/webp,image/svg+xml`. On selection the file is `POST`ed to `/api/useruploads`; on success the returned URL is patched into the layer and sent immediately via WebSocket.
- **Width slider** — adjusts `width` from 5 % to 100 % of canvas width. Previews on drag, commits on pointer/key up (`sendCurrent`).

The standard **Alpha** slider and **Pos** readout appear below the type-specific controls, the same as for other non-fill layers. There is no color picker for image layers.

---

## Frontend integration notes

The upload is a plain `fetch` POST from `ImageProperties.tsx`. The `url` field travels in the scene JSON over WebSocket exactly like any other field — no special handling is needed on the projector side. Projectors render image layers through the same `applyImage` renderer.

In the Vite dev server the `/api` prefix is proxied to `http://localhost:8080`, so uploads and image serving work in development without any extra configuration.

Scene files saved with the **Save** button embed the absolute URL path (e.g. `/api/useruploads/…`). Loading such a scene on a different server will result in broken image references unless the files are copied to the new server's storage.

---

## Adding a new layer type reference

Image was added following the same pattern as `icon`:

| artefact | file |
|---|---|
| Scene type | [lib/scene/image.ts](frontend/src/lib/scene/image.ts) |
| Union entry | [lib/scene/index.ts](frontend/src/lib/scene/index.ts) |
| Phaser renderer | [lib/phaser/renderers/image.ts](frontend/src/lib/phaser/renderers/image.ts) |
| Texture constant | [lib/phaser/constants.ts](frontend/src/lib/phaser/constants.ts) (`IMAGE_TEXTURE_PREFIX`) |
| Dispatch + cleanup | [lib/phaser/ProjectionScene.ts](frontend/src/lib/phaser/ProjectionScene.ts) |
| Properties panel | [components/controller/ImageProperties.tsx](frontend/src/components/controller/ImageProperties.tsx) |
| Add-object button | [components/controller/AddObjectPanel.tsx](frontend/src/components/controller/AddObjectPanel.tsx) |
| Layer row icon/label | [components/controller/LayerRow.tsx](frontend/src/components/controller/LayerRow.tsx) |
| HTTP routes | [backend/src/routes/assets.rs](backend/src/routes/assets.rs) |
| Route registration | [backend/src/app.rs](backend/src/app.rs) |
