# pro-jection

Wireless slide projector control over WebSocket. A controller screen composes a scene of layers (text, shapes, gradient backgrounds) and the scene appears on one or more projector screens in real time. Sessions are identified by a 6-digit numeric code and managed entirely in server RAM — no database.

## How it works

1. Open the app on two devices (or two browser tabs).
2. Pick **Controller** on one, enter any 6-digit code.
3. Pick **Projector** on the other, enter the same code.
4. Compose a scene on the controller — every edit is auto-sent to the projector. Text input is debounced; sliders and color pickers commit on release.

Sessions are created on first connect and survive client disconnects. They are cleaned up automatically after all clients have been gone for 10 minutes.

## Session rules

| Rule | Detail |
|---|---|
| Code format | 6 digits, user-chosen |
| Controllers per session | **1** — a second controller is rejected with an error message |
| Projectors per session | Unlimited |
| State kept | Full scene history with undo/redo cursor |
| Persistence | RAM only; lost on pod restart |
| Cleanup | Removed 10 min after last client disconnects |

## WebSocket protocol

Two endpoints, both under `/ws/`:

```
ws://<host>/ws/controller/<code>
ws://<host>/ws/projector/<code>
```

### Server → client events (typed JSON)

| `type` | Fields | Sent when |
|---|---|---|
| `connected` | `role`, `session_code` | On successful handshake |
| `controller_status` | `connected` (bool) | Controller connects or disconnects |
| `error` | `message` | Connection refused (e.g. duplicate controller) |

On connect, clients also receive the last scene the controller sent (replayed verbatim, no wrapper).

### Controller → server → projectors

The controller sends the full scene JSON directly — no envelope. The server stores it, appends it to history, and broadcasts it to all projectors unchanged:

```json
{
  "objects": [
    {
      "id": "bg",
      "type": "fill",
      "fill": "linear",
      "angle": 180,
      "stops": [
        { "offset": 0, "color": "#0f172a", "alpha": 1 },
        { "offset": 1, "color": "#1e293b", "alpha": 1 }
      ],
      "x": 0.5, "y": 0.5, "opacity": 1, "animations": {}, "modifiers": []
    },
    {
      "id": "abc",
      "type": "text",
      "x": 0.5, "y": 0.3,
      "font_size": 96,
      "color": "#ffffff",
      "text": "Hello, world",
      "font_family": "outfit",
      "opacity": 1, "animations": {}, "modifiers": []
    }
  ]
}
```

Clients distinguish server events from scene updates by checking for a known `type` field.

## Scene type system

Each scene is an ordered array of layers (later in array = drawn on top). All layers share `BaseLayer` fields and add their own.

### Common fields (every layer)

| Field | Type | Description |
|---|---|---|
| `id` | string | Client-generated unique identifier |
| `type` | `"text"` \| `"shape"` \| `"fill"` | Layer discriminator |
| `x` | number | Horizontal position, 0–1 (left to right) |
| `y` | number | Vertical position, 0–1 (top to bottom) |
| `opacity` | number | Layer alpha, 0–1 |
| `animations` | object | Always `{}` — reserved for future use |
| `modifiers` | array | Always `[]` — reserved for Blender-style modifier stack |

### Text layer (`type: "text"`)

| Field | Type | Description |
|---|---|---|
| `text` | string | Display text |
| `font_size` | number | Font size in 1920×1080 canvas pixels |
| `color` | string | Text color (hex `#rrggbb`) |
| `font_family` | string | One of `outfit` · `inter` · `space-grotesk` · `playfair` · `space-mono` · `bebas-neue` · `dancing-script` |

### Shape layer (`type: "shape"`)

| Field | Type | Description |
|---|---|---|
| `shape` | `"rectangle"` \| `"circle"` | Shape kind (circle is rendered as an ellipse using `width` × `height`) |
| `width` | number | Normalized width, 0–1 of canvas width |
| `height` | number | Normalized height, 0–1 of canvas height |
| `color` | string | Hex `#rrggbb` — fill color when filled, outline color when not |
| `filled` | boolean | When false, outline only |
| `stroke_width` | number | Outline width in canvas pixels (used when `filled=false`) |

### Fill layer (`type: "fill"`)

A full-canvas background. Position is fixed at the canvas center; the layer's `x`/`y` are ignored by the renderer.

| Field | Type | Description |
|---|---|---|
| `fill` | `"solid"` \| `"linear"` | Fill kind. Solid uses `stops[0]`; linear uses all stops |
| `stops` | `ColorStop[]` | Each stop is `{ offset: 0..1, color: "#rrggbb", alpha: 0..1 }` |
| `angle` | number | Linear gradient angle in CSS degrees (0 = bottom→top, 180 = top→bottom) |

The Phaser canvas on both sides operates in 1920×1080 logical pixels and scales via `Phaser.Scale.FIT` to fill the viewport.

## History & undo/redo

Every scene the controller sends is appended to a server-side history stack. The controller can step backwards (undo) and forwards (redo) via HTTP. Moving the cursor broadcasts the scene at the new position to all connected projectors.

See [history.md](history.md) for the full cursor model, truncation behaviour, and endpoint contracts.

| Endpoint | Method | Description |
|---|---|---|
| `/api/sessions/{code}/history` | GET | Full history array + current cursor |
| `/api/sessions/{code}/history/undo` | POST | Step cursor back; returns new scene |
| `/api/sessions/{code}/history/redo` | POST | Step cursor forward; returns new scene |

## Stack

| Layer | Tech |
|---|---|
| Backend | Rust, Axum 0.8, tokio, `tokio::sync::broadcast` for fan-out |
| Frontend | Vite + React 19 + TypeScript, Tailwind v4, `react-router-dom`, Phaser 4 |
| Deployment | Single StatefulSet pod, Helm chart, Traefik ingress, cert-manager TLS |
| Storage | OpenDAL (`fs` on a `ReadWriteOnce` PVC) — not used for sessions |

## Running locally

```bash
task dev          # starts backend :8080 and Vite :5173 in parallel
```

Open `http://localhost:5173`. The Vite dev server proxies `/ws/*`, `/api/*`, and `/health` paths to the backend.

## Project layout

```
backend/
  src/
    main.rs          # entry point, starts cleanup task
    app.rs           # axum router
    config.rs        # env vars
    session.rs       # SessionState, history stack, ServerEvent
    state.rs         # AppState (config + storage + sessions)
    storage.rs       # OpenDAL operator loader
    routes/
      health.rs      # /live, /ready, /health
      sessions.rs    # /ws/controller/:code, /ws/projector/:code
      history.rs     # /api/sessions/:code/history (undo/redo)
      ws_test.rs     # /ws/echo (echo test)
frontend/
  src/
    App.tsx          # routes
    lib/
      scene/              # canonical Scene / Layer types (wire format)
        index.ts            #   Layer union, Scene, EMPTY_SCENE, barrel
        base.ts             #   BaseLayer, Animations, Modifier
        fonts.ts            #   font catalogue (7 variants)
        text.ts             #   TextLayer + default
        shape.ts            #   ShapeLayer + rect/circle defaults
        fill.ts             #   FillLayer + ColorStop + default
      phaser/
        ProjectionScene.ts  # 1920×1080 scene; owns gameObjects/layerData maps; dispatches per-type
        constants.ts        # CANVAS_W/H, selection colors, fill texture key prefix
        colors.ts           # hex/rgba helpers
        fillTexture.ts      # paintFill — solid + linear gradient onto a 2D canvas
        renderers/
          types.ts            # RenderCtx interface, LayerObject union, InteractiveOpts
          text.ts             # applyText + refreshTextSelection
          shape.ts            # applyShape + refreshShapeSelection
          fill.ts             # applyFill (CanvasTexture lifecycle)
    pages/
      HomePage.tsx        # mode picker + 6-digit code dialog
      ControllerPage.tsx  # WS client; orchestrates state, send timing, layout
      ProjectorPage.tsx   # WS client, full-screen canvas, auto-reconnect
      HealthPage.tsx      # /health viewer
      WsTestPage.tsx      # /ws/echo tester
    components/
      PhaserCanvas.tsx    # forwardRef wrapper: applyScene / selectObject / getScene
      CodeInput.tsx       # 6-digit entry dialog
      controller/         # type-specific controller UI
        types.ts            #   PropertyControls (patch/sendNow/sendDebounced/sendCurrent)
        PropertyRow.tsx     #   shared label/content row
        TextProperties.tsx  #   text-layer Properties panel
        ShapeProperties.tsx #   shape-layer Properties panel
        FillProperties.tsx  #   fill-layer Properties panel (gradient stops)
        LayerRow.tsx        #   single Layers-panel row + reorder buttons
        AddObjectPanel.tsx  #   Text / Rectangle / Circle / Background buttons
      ui/                 # button, card, dialog, input
helm-chart/          # StatefulSet + PVC + two Ingresses + storage ConfigMap
Dockerfile           # two-stage: host builds frontend, image copies dist/
Taskfile.yml         # dev, build, ship, logs
history.md           # undo/redo cursor model and HTTP API reference
```

## Deployment

```bash
task ship   # frontend install → docker build+push → helm upgrade --install
```

- Image: `grekodocker/pro-jection` (`:latest` + `:<git-short-hash>`)
- Host: `proj.alexgr.space`, TLS via cert-manager
- HTTP → HTTPS redirect via Traefik `Middleware`
- PVC survives `helm uninstall` (StatefulSet volumeClaimTemplates)

## Env vars (backend)

| Var | Default | Purpose |
|---|---|---|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8080` | Bind port |
| `STORAGE_CONFIG` | `config/storage.yaml` | OpenDAL YAML path |
| `STATIC_DIR` | `../frontend/dist` | Served as SPA |
| `CORS_ALLOWED_ORIGINS` | _(empty)_ | Extra allowed origins, comma-separated |
