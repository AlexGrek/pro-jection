pub mod app;
pub mod config;
pub mod routes;
pub mod state;
pub mod storage;

use std::sync::Arc;

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
    let app = app::create_app(state);

    let bind = format!("{}:{}", cfg.host, cfg.port);
    let listener = TcpListener::bind(&bind).await?;
    info!("Listening on http://{}", bind);
    axum::serve(listener, app).await?;
    Ok(())
}
