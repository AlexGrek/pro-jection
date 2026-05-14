pub mod app;
pub mod config;
pub mod routes;
pub mod session;
pub mod state;
pub mod storage;

use std::sync::Arc;
use std::time::{Duration, Instant};

use log::info;
use opendal::Operator;
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

    // GC: delete uploads older than 24 hours, runs every 3 hours.
    let storage_gc = state.storage.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3 * 60 * 60));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            run_upload_gc(&storage_gc).await;
        }
    });

    let app = app::create_app(state);

    let bind = format!("{}:{}", cfg.host, cfg.port);
    let listener = TcpListener::bind(&bind).await?;
    info!("Listening on http://{}", bind);
    axum::serve(listener, app).await?;
    Ok(())
}

async fn run_upload_gc(storage: &Operator) {
    let cutoff = opendal::raw::Timestamp::now() - Duration::from_secs(24 * 60 * 60);

    let entries = match storage.list("uploads/").await {
        Ok(e) => e,
        Err(e) => {
            log::warn!("upload GC: list failed: {e}");
            return;
        }
    };

    let mut deleted = 0u32;
    let mut errors = 0u32;

    for entry in &entries {
        if entry.path().ends_with('/') {
            continue;
        }

        let meta = match storage.stat(entry.path()).await {
            Ok(m) => m,
            Err(e) => {
                log::warn!("upload GC: stat {} failed: {e}", entry.path());
                errors += 1;
                continue;
            }
        };

        let Some(last_modified) = meta.last_modified() else {
            continue;
        };

        if last_modified >= cutoff {
            continue;
        }

        match storage.delete(entry.path()).await {
            Ok(()) => deleted += 1,
            Err(e) => {
                log::warn!("upload GC: delete {} failed: {e}", entry.path());
                errors += 1;
            }
        }
    }

    if deleted > 0 || errors > 0 {
        log::info!("Upload GC: deleted={deleted} errors={errors}");
    }
}
