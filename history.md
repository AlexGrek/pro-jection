# History & Undo / Redo

Session history tracks every scene the controller has sent. It is stored in server RAM alongside the session and exposes a cursor that the controller can move backwards (undo) or forwards (redo) via HTTP.

The projector is unaware of the history mechanism — moving the cursor broadcasts the scene at the new position to projectors exactly like a normal send.

---

## Cursor model

History is a flat array of raw scene JSON strings. The cursor is a zero-based index into that array pointing to the **currently displayed scene**.

```
index:   0        1        2        3
         [scene1] [scene2] [scene3] [scene4]
                                      ^
                                   cursor = 3  (current)
```

- **Undo** moves the cursor left (cursor − 1).
- **Redo** moves the cursor right (cursor + 1).
- Undo is unavailable when `cursor == 0`.
- Redo is unavailable when `cursor == history.length − 1`.

---

## New send rewrites history

When the controller sends a new scene it is always appended at `cursor + 1`. Any scenes that existed beyond the cursor (redo history) are **discarded** first.

```
Before:  [s1] [s2] [s3] [s4]
                    ^
                  cursor = 2

Send s5: truncate after cursor → [s1] [s2] [s3]
         append s5              → [s1] [s2] [s3] [s5]
         advance cursor         →                  ^
                                              cursor = 3
```

This is standard linear undo/redo behaviour: branching off in a new direction permanently removes the alternate future.

---

## HTTP API

All endpoints are scoped to a session code. The session does not need to exist in advance — the WebSocket handlers create it on first connect; the history endpoints return `404` if the code is unknown.

### `GET /api/sessions/{code}/history`

Returns the full history array and the current cursor.

**Response `200`**
```json
{
  "cursor": 2,
  "items": [
    { "objects": [...] },
    { "objects": [...] },
    { "objects": [...] }
  ]
}
```

`items[cursor]` is the scene currently shown on projectors. Items are raw JSON objects — not strings.

When history is empty the response is `{"cursor": 0, "items": []}`.

---

### `POST /api/sessions/{code}/history/undo`

Moves the cursor one step back and broadcasts the scene at the new position to all connected projectors.

**Response `200`** — cursor moved:
```json
{
  "cursor": 1,
  "scene": { "objects": [...] }
}
```

**Response `204`** — already at the beginning; cursor unchanged, nothing broadcast.

---

### `POST /api/sessions/{code}/history/redo`

Moves the cursor one step forward and broadcasts the scene at the new position.

**Response `200`** — cursor moved:
```json
{
  "cursor": 3,
  "scene": { "objects": [...] }
}
```

**Response `204`** — already at the end; cursor unchanged, nothing broadcast.

---

## Frontend integration

On `200` from undo or redo, apply the returned scene to the controller canvas immediately (no need to wait for a WebSocket echo — the HTTP response carries the authoritative scene):

```typescript
const res = await fetch(`/api/sessions/${code}/history/undo`, { method: 'POST' })
if (res.status === 200) {
  const { cursor, scene } = await res.json()
  applyObjects(scene.objects)
  // optionally sync cursor state for enabling/disabling buttons
}
// 204 → already at start, disable undo button
```

To keep undo/redo buttons accurate without polling, fetch `GET /history` after each send and after each undo/redo to refresh `cursor` and `items.length`.

---

## Backend notes

The backend stores history as `Vec<String>` of raw JSON blobs. It never parses scene content — scenes are appended, indexed, and forwarded verbatim. Responses embed the raw blobs directly into the JSON body via string formatting, so no serialisation round-trip occurs.

History lives in RAM with the session and is lost when the session is cleaned up (10 minutes after all clients disconnect).
