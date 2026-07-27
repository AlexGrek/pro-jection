/**
 * Client for the scene ZIP endpoints ([backend/src/routes/archive.rs]).
 *
 * The backend does the packing and unpacking — it holds the uploads, so it is the only side
 * that can bundle them. The frontend just hands it a scene (or a file) and moves the result.
 */

import type { Scene } from './scene'

/** Full saved scene, as returned by `GET /api/scenes/{id}` and `POST /api/scenes/import`. */
export interface StoredScene {
  id: string
  name: string
  saved_at: number
  artifacts: string[]
  scene: Scene
}

/** File name from the response's `Content-Disposition`, falling back to a slug of `name`. */
function archiveFilename(resp: Response, name: string): string {
  const match = /filename="([^"]+)"/.exec(resp.headers.get('content-disposition') ?? '')
  if (match) return match[1]
  const slug = name.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'scene'}.zip`
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Export the scene as it stands right now — saved or not — and hand the ZIP to the browser.
 * `artifacts` is the upload key list, supplied by the caller exactly as it is on save.
 */
export async function downloadSceneArchive(name: string, scene: Scene, artifacts: string[]): Promise<void> {
  const resp = await fetch('/api/scenes/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, scene, artifacts }),
  })
  if (!resp.ok) throw new Error(`Export failed (${resp.status})`)
  saveBlob(await resp.blob(), archiveFilename(resp, name))
}

/** URL that downloads an already-saved scene as a ZIP. Safe to use as an `<a download>` href. */
export function savedSceneArchiveUrl(id: string): string {
  return `/api/scenes/${id}/export`
}

/**
 * Upload a scene ZIP. The backend restores the uploads it carries and saves the scene under a
 * fresh id, returning it ready to apply to the canvas.
 */
export async function uploadSceneArchive(file: File): Promise<StoredScene> {
  const body = new FormData()
  body.append('file', file)
  const resp = await fetch('/api/scenes/import', { method: 'POST', body })
  if (!resp.ok) {
    const detail = (await resp.text()).trim()
    throw new Error(detail || `Import failed (${resp.status})`)
  }
  return (await resp.json()) as StoredScene
}
