pub mod app;
pub mod config;
pub mod routes;
pub mod session;
pub mod state;
pub mod storage;

use std::sync::Arc;
use std::time::{Duration, Instant};

use log::info;
use tokio::net::TcpListener;

use crate::state::AppState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::dotenv();
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    let cfg = config::AppConfig::from_env()?;
    info!("Starting pro-jection-backend");
    info!("  Host: {}", cfg.host);
    info!("  Port: {}", cfg.port);
    info!("  Storage: {}", cfg.storage_config.display());

    let storage = storage::load_operator_from_yaml_path(&cfg.storage_config)
        .map_err(|e| format!("Failed to init storage: {e:#}"))?;
    info!("    OpenDAL scheme: {}", storage.info().scheme());
    storage::check(&storage)
        .await
        .map_err(|e| format!("Storage health check failed: {e:#}"))?;

    let state = Arc::new(AppState::new(cfg.clone(), storage));

    // Clean up sessions with no clients for >10 minutes.
    let sessions = state.sessions.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(60));
        loop {
            interval.tick().await;
            let cutoff = Instant::now() - Duration::from_secs(600);
            let mut map = sessions.lock().await;
            let before = map.len();
            map.retain(|_, s| {
                if s.controller_connected || s.projector_count > 0 {
                    return true;
                }
                s.last_disconnect.map_or(true, |t| t > cutoff)
            });
            let removed = before - map.len();
            if removed > 0 {
                log::info!("Session cleanup: removed {removed} stale session(s)");
            }
        }
    });

    let app = app::create_app(state);

    let bind = format!("{}:{}", cfg.host, cfg.port);
    let listener = TcpListener::bind(&bind).await?;
    info!("Listening on http://{}", bind);
    axum::serve(listener, app).await?;
    Ok(())
}
