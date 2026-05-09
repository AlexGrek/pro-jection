use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::state::AppState;

/// GET /live — Kubernetes liveness. Returns 200 whenever the HTTP server can respond.
pub async fn live() -> StatusCode {
    StatusCode::OK
}

/// GET /ready — Kubernetes readiness. Probes storage backend.
pub async fn ready(State(state): State<Arc<AppState>>) -> StatusCode {
    match state.storage.check().await {
        Ok(()) => StatusCode::OK,
        Err(_) => StatusCode::SERVICE_UNAVAILABLE,
    }
}

/// GET /health — JSON health summary for ops/diagnostics.
pub async fn health_check(State(state): State<Arc<AppState>>) -> (StatusCode, Json<Value>) {
    let storage_ok = state.storage.check().await.is_ok();
    let code = if storage_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    let status = if storage_ok { "healthy" } else { "degraded" };

    (
        code,
        Json(json!({
            "status": status,
            "storage": storage_ok,
            "timestamp": chrono::Utc::now(),
            "version": env!("CARGO_PKG_VERSION"),
        })),
    )
}
