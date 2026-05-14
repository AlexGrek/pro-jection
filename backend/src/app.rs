use std::sync::Arc;

use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::http::HeaderValue;
use axum::routing::{get, post};
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use crate::routes;
use crate::state::AppState;

pub fn create_app(state: Arc<AppState>) -> Router {
    let static_dir = state.config.static_dir.clone();

    // Hashed asset directory served separately so a request for a chunk that no
    // longer exists gets a clean 404 rather than index.html mis-served as JS.
    let assets_dir = format!("{}/assets", &static_dir);

    // Everything else falls back to index.html for client-side React Router.
    let spa_fallback = ServeDir::new(&static_dir)
        .not_found_service(ServeFile::new(format!("{}/index.html", &static_dir)));

    let mut allowed_origins: Vec<HeaderValue> = vec![
        "http://localhost:5173".parse().unwrap(),
        "http://127.0.0.1:5173".parse().unwrap(),
    ];
    for origin in &state.config.cors_allowed_origins {
        match origin.parse::<HeaderValue>() {
            Ok(v) => allowed_origins.push(v),
            Err(_) => log::warn!("Invalid CORS origin ignored: {origin}"),
        }
    }
    let cors = CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    Router::new()
        .route("/live", get(routes::health::live))
        .route("/ready", get(routes::health::ready))
        .route("/health", get(routes::health::health_check))
        .route("/ws/echo", get(routes::ws_test::ws_echo))
        .route("/ws/controller/{code}", get(routes::sessions::ws_controller))
        .route("/ws/projector/{code}", get(routes::sessions::ws_projector))
        .route("/api/sessions/{code}/history", get(routes::history::get_history))
        .route("/api/sessions/{code}/history/undo", post(routes::history::undo))
        .route("/api/sessions/{code}/history/redo", post(routes::history::redo))
        .route("/api/useruploads", post(routes::assets::upload).layer(DefaultBodyLimit::max(20 * 1024 * 1024)))
        .route("/api/useruploads/{key}", get(routes::assets::serve))
        .nest_service("/assets", ServeDir::new(&assets_dir))
        .fallback_service(spa_fallback)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
