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

## ZIP archives

A scene can leave the server as a single portable `.zip` and come back on another deployment,
carrying its uploads with it. Implemented in [archive.rs](backend/src/routes/archive.rs).

```text
scene.json      { "format": "pro-jection-scene", "version": 1, "name", "exported_at",
                  "artifacts": ["a1b2.png"], "scene": { "objects": [ … ] } }
assets/a1b2.png one entry per referenced upload, stored under its original key
```

The backend packs and unpacks because it owns the uploads — the frontend never sees them. It
still does not parse scene content: the blob is a `RawValue` from end to end, and **assets keep
their original `uploads/` key across the round trip**, so the `/api/useruploads/{key}` URLs
inside the blob keep resolving without anyone rewriting them. Keys are UUIDs, so a key that
already exists on import is the same file and is left alone.

`scene.json` is deflated; assets are stored uncompressed (they are already-compressed media).
An archive re-zipped with a wrapping folder (`my-scene/scene.json`, as Finder and Explorer
produce) still imports — the manifest's own directory is taken as the archive root.

### `POST /api/scenes/export`
Export the scene in the request body — the controller's live canvas, saved or not. Same body
as `POST /api/scenes` (`{ name, artifacts, scene }`). **Response `200`** `application/zip` with
a `Content-Disposition` filename derived from the scene name. Artifacts that are no longer in
storage are skipped with a warning rather than failing the export.

### `GET /api/scenes/{id}/export`
Export an already-saved scene. A plain `GET` so the UI can point an `<a download>` straight at
it. `404` if the scene is gone.

### `POST /api/scenes/import`
Multipart (`file` = the ZIP, 200 MB cap). Writes back the uploads the archive carries, then
saves the scene under a **fresh id** with a fresh `saved_at` — importing never overwrites an
existing scene, and the imported scene starts its own 14-day clock. **Response `200`** is the
full stored scene, the same shape as `GET /api/scenes/{id}`, so the controller can apply it to
the canvas without a second round trip. `400` with a plain-text reason for a non-ZIP, a missing
`scene.json`, a foreign `format`, a `version` newer than the server knows, or contents past the
400 MB unpacked ceiling.

Import ignores entries it should not trust: an asset key that is not a plain upload file name
(path separators, traversal, a nested directory, an extension the upload endpoint would have
rejected) is skipped and logged. The same guard,
[`valid_artifact_key`](backend/src/routes/scenes.rs), also filters the `artifacts` list on
every save — those keys end up in `storage.delete` calls when a scene is re-saved or deleted.

### Frontend

[sceneArchive.ts](frontend/src/lib/sceneArchive.ts) wraps the three endpoints. In the
controller: the header's ZIP button exports the live canvas, and
[SceneStorageDialogs.tsx](frontend/src/components/controller/SceneStorageDialogs.tsx) adds a
per-row export link plus an "Import from ZIP…" action to the Open dialog. An imported scene is
adopted like an opened one (`loadStoredScene` — canvas, projectors, and the id/name the Save
button re-saves).

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
