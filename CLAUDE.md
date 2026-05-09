# pro-jection

Single-pod full-stack app. The pod IS the file storage — OpenDAL `fs` scheme on a `ReadWriteOnce` PVC. **No database, no auth.**

## Layout

- [backend/](backend/) — Rust single crate (no workspace). Axum 0.8, OpenDAL 0.55 (`fs` + `s3` only), tokio. Edition 2024.
- [frontend/](frontend/) — Vite + React 19 + TS. `react-router-dom` (library mode — `BrowserRouter`/`Routes`/`Route`, **not** the React Router framework). Tailwind v4 via the Vite plugin (`@tailwindcss/vite` + single `@import "tailwindcss"` in [src/index.css](frontend/src/index.css)) — no `tailwind.config.js`, no `postcss.config.js`.
- [helm-chart/](helm-chart/) — Helm chart. StatefulSet (1 replica) + PVC + Service + two Ingresses (HTTP→HTTPS via Traefik middleware) + storage ConfigMap.
- [Dockerfile](Dockerfile) — two-stage. Frontend is built on the **host** before `docker build`; the Dockerfile copies `frontend/dist/` → `/app/static/`.
- [Taskfile.yml](Taskfile.yml) — `task dev` runs both servers; `task ship` builds + pushes + deploys.

## Backend

- Entry: [backend/src/main.rs](backend/src/main.rs). Reads env via [config.rs](backend/src/config.rs), loads OpenDAL operator from a YAML file ([storage.rs](backend/src/storage.rs)), starts the axum app.
- Routes (all unauthenticated):
  - `GET /live` — liveness, always 200
  - `GET /ready` — readiness, probes OpenDAL backend
  - `GET /health` — JSON health summary
  - `GET /ws/echo` — WebSocket echo for manual testing ([ws_test.rs](backend/src/routes/ws_test.rs))
  - `/assets/*` → ServeDir (no fallback, so a missing hashed chunk 404s cleanly)
  - everything else → SPA fallback to `index.html`
- Env vars (with defaults): `HOST=0.0.0.0`, `PORT=8080`, `STORAGE_CONFIG=config/storage.yaml`, `STATIC_DIR=../frontend/dist`, `CORS_ALLOWED_ORIGINS=` (comma-separated).
- Storage YAML: only `fs` and `s3` schemes are accepted. For `fs`, relative `root` resolves against the YAML file's dir. See [storage.rs](backend/src/storage.rs).

## Frontend

- Pages: [App.tsx](frontend/src/App.tsx) (`/`), [HealthPage.tsx](frontend/src/pages/HealthPage.tsx) (`/health`), [WsTestPage.tsx](frontend/src/pages/WsTestPage.tsx) (`/ws-test`).
- Vite dev server proxies `/health`, `/live`, `/ready`, `/ws` → backend on `localhost:8080` ([vite.config.ts](frontend/vite.config.ts)).
- Tailwind: write classes directly in JSX. No config file by design — extend via CSS in [index.css](frontend/src/index.css) using `@theme` if needed.

## Deployment

- Image: `grekodocker/pro-jection`. Tagged `:latest` and `:<git-short-hash>`.
- Ingress host: **proj.alexgr.space**. TLS secret defaults to `pro-jection-tls`. Wire cert-manager via `ingress.annotations` in [values.yaml](helm-chart/values.yaml).
- HTTP→HTTPS: Traefik `Middleware` (`redirectScheme`, permanent), referenced from the HTTP ingress.
- PVC: 2Gi default at `/storage`, kept across `helm uninstall` (StatefulSet semantics). The OpenDAL storage YAML is rendered by [storage-config.yaml](helm-chart/templates/storage-config.yaml) and mounted at `/etc/pro-jection/storage.yaml`.
- Probes: `/live` (liveness), `/ready` (readiness — does an OpenDAL `check()` per request, fine for one pod).

## Common tasks

- `task dev` — backend + Vite in parallel (kills existing :8080/:5173 first)
- `task frontend:build` — produces `frontend/dist/`
- `task docker:build` — builds frontend, then image with persistent buildx cache
- `task ship` — frontend install → docker push → `helm upgrade --install`
- `task template` / `task lint` — render/lint the chart locally
- `task logs` — tail pod logs

## Conventions

- Single crate at [backend/](backend/) — don't split into a workspace until there's a real second binary.
- Don't add a database or auth without explicit ask. The whole design assumes one stateful pod owning its PVC.
- Tailwind v4 only — never reintroduce `tailwind.config.js` or PostCSS configs (the Vite plugin handles everything).
- React Router stays in **library mode** (`react-router-dom` `BrowserRouter`). Don't migrate to the framework/data-router setup.
