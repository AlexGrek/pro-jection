# Saved scenes & artifact reference counting

Saved scenes are the **one persisted concept** in pro-jection. They are distinct from RAM
**sessions** (controller ↔ projector pairs, which are never written to storage). A saved scene
is a durable snapshot of the controller's canvas, stored on the OpenDAL backend with a rolling
14-day lifetime. The uploaded images a scene references ("artifacts") live exactly as long as
at least one saved scene still references them.

The backend never parses scene *content*: the scene blob is stored and returned verbatim via
`serde_json::value::RawValue`, and the list of artifacts a scene references is **supplied by
the frontend**, not extracted server-side.

---

## Storage layout

- `scenes/{id}.json` — one file per saved scene:
  ```json
  {
    "id": "8f3c…",
    "name": "Opening slide",
    "saved_at": 1718000000,
    "artifacts": ["a1b2.png", "c3d4.jpg"],
    "scene": { "objects": [ … ] }
  }
  ```
  `id` is a server-generated UUID. `saved_at` is unix seconds — the lifetime clock. `artifacts`
  is the set of `uploads/` keys the scene references. `scene` is the raw canvas blob.
- `uploads/{key}` — uploaded images, written by [assets.rs](backend/src/routes/assets.rs).
  An `ImageLayer.url` is `/api/useruploads/{key}`; the frontend strips the prefix to get `key`.

---

## Lifetime rules

- **14-day TTL.** A scene is deleted ~14 days after its last save. Re-saving rewrites the file
  and refreshes `saved_at`, extending the lifetime.
- **Artifacts are reference-counted.** An upload is kept as long as any surviving scene lists
  it in `artifacts`. It is deleted when no scene references it.
- **Grace for unsaved uploads.** A freshly uploaded image that no scene references yet survives
  for a 24-hour grace period, long enough for the user to save the scene that uses it. After
  that, if still unreferenced, the periodic GC removes it.
- **"Save As" shares artifacts.** Saving a copy (new id) referencing the same artifacts keeps
  those artifacts alive through either copy; deleting/changing one copy does not orphan an
  artifact the other still uses.

### When artifacts are deleted

| Trigger | What happens |
|---|---|
| **Re-save** (`PUT`) | Artifacts in the old version but not the new one are deleted **immediately**, unless another scene still references them. |
| **Delete** (`DELETE`) | The scene's artifacts are deleted immediately, unless another scene still references them. |
| **GC sweep** (every 3 h) | Expired scenes (`saved_at` > 14 d) are removed first; then any `uploads/` key referenced by no surviving scene and older than the 24 h grace is swept. |

The immediate-cleanup paths and the GC sweep share one helper,
[`referenced_artifacts`](backend/src/routes/scenes.rs) — the union of `artifacts` across all
stored scenes (optionally excluding one id).

---

## HTTP API

All endpoints are unauthenticated, like the rest of the app.

### `GET /api/scenes`
List saved scenes (metadata only), newest first.
```json
[ { "id": "8f3c…", "name": "Opening slide", "saved_at": 1718000000 }, … ]
```

### `POST /api/scenes`
Create a new saved scene (first save of a new scene, **or** "Save As"). Body:
```json
{ "name": "Opening slide", "artifacts": ["a1b2.png"], "scene": { "objects": [ … ] } }
```
**Response `200`** `{ "id", "name", "saved_at" }`.

### `GET /api/scenes/{id}`
Return the full stored scene (scene blob embedded verbatim). `404` if absent.

### `PUT /api/scenes/{id}`
Re-save: refresh the lifetime and immediately drop artifacts the scene no longer references.
Same body as `POST`. **Response `200`** `{ "id", "name", "saved_at" }`; `404` if the scene no
longer exists (the controller then falls back to creating a fresh one).

### `DELETE /api/scenes/{id}`
Delete the scene and any artifacts it alone referenced. **Response `204`**.

---

## Frontend integration

The controller ([ControllerPage.tsx](frontend/src/pages/ControllerPage.tsx)) tracks
`currentSceneId` / `currentSceneName`:

- **Save** — `PUT /api/scenes/{id}` if a scene id is held, else opens a name prompt and
  `POST`s a new one.
- **Save As** — always opens a name prompt and `POST`s a new copy, adopting the new id.
- **Open** — [SceneStorageDialogs.tsx](frontend/src/components/controller/SceneStorageDialogs.tsx)
  lists `GET /api/scenes`; selecting one `GET`s it, applies the scene to the canvas and pushes
  it to projectors (`applyObjects` + `sendNow`), and adopts its id/name. Rows can be deleted
  via `DELETE`.

The `artifacts` array is built client-side from the scene's image layers:
`objects.filter(o => o.type === 'image' && o.url).map(o => key(o.url))`, deduped. This keeps
the backend content-agnostic — it trusts the supplied list.

Note: saving is unrelated to the in-RAM undo/redo history ([history.md](history.md)); saved
scenes persist independently of session lifetime.
