# syntax=docker/dockerfile:1.7
# Build context: repo root.
# The frontend is built on the HOST before `docker build` — frontend/dist/ is copied in.
# Target platform is always linux/amd64 — passed via docker buildx --platform flag.

ARG TARGETPLATFORM=linux/amd64
FROM --platform=$TARGETPLATFORM rust:1.91-slim-bookworm AS builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache deps: copy manifests first, build a stub, fetch crates.
COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir -p src && echo "fn main() {}" > src/main.rs
RUN --mount=type=cache,id=projection-cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=projection-cargo-git,target=/usr/local/cargo/git \
    cargo fetch --locked

# Real sources.
COPY backend/ ./
RUN --mount=type=cache,id=projection-cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=projection-cargo-git,target=/usr/local/cargo/git \
    --mount=type=cache,id=projection-rust-target,target=/app/.target-cache \
    CARGO_TARGET_DIR=/app/.target-cache cargo build --release --locked && \
    cp /app/.target-cache/release/pro-jection-backend /app/pro-jection-backend

# ── Final image ───────────────────────────────────────────────────────────────
ARG TARGETPLATFORM=linux/amd64
FROM --platform=$TARGETPLATFORM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/pro-jection-backend ./pro-jection-backend
COPY frontend/dist/ ./static/

EXPOSE 8080
ENV HOST=0.0.0.0
ENV PORT=8080
ENV STATIC_DIR=/app/static
# STORAGE_CONFIG is provided by the helm chart (mounted from a ConfigMap).
ENV STORAGE_CONFIG=/etc/pro-jection/storage.yaml

CMD ["./pro-jection-backend"]
