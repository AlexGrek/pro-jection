use std::path::PathBuf;

use anyhow::{Context, Result};

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub storage_config: PathBuf,
    pub static_dir: String,
    pub cors_allowed_origins: Vec<String>,
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let port: u16 = std::env::var("PORT")
            .unwrap_or_else(|_| "8080".to_string())
            .parse()
            .context("PORT must be a u16")?;
        let storage_config = std::env::var("STORAGE_CONFIG")
            .unwrap_or_else(|_| "config/storage.yaml".to_string())
            .into();
        let static_dir =
            std::env::var("STATIC_DIR").unwrap_or_else(|_| "../frontend/dist".to_string());
        let cors_allowed_origins = std::env::var("CORS_ALLOWED_ORIGINS")
            .ok()
            .map(|s| {
                s.split(',')
                    .map(|x| x.trim().to_string())
                    .filter(|x| !x.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        Ok(Self {
            host,
            port,
            storage_config,
            static_dir,
            cors_allowed_origins,
        })
    }
}
