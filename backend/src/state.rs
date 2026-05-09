use opendal::Operator;

use crate::config::AppConfig;

pub struct AppState {
    pub config: AppConfig,
    pub storage: Operator,
}

impl AppState {
    pub fn new(config: AppConfig, storage: Operator) -> Self {
        Self { config, storage }
    }
}
