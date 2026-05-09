use std::collections::HashMap;
use std::sync::Arc;

use opendal::Operator;
use tokio::sync::Mutex;

use crate::config::AppConfig;
use crate::session::SessionState;

pub struct AppState {
    pub config: AppConfig,
    pub storage: Operator,
    pub sessions: Arc<Mutex<HashMap<String, SessionState>>>,
}

impl AppState {
    pub fn new(config: AppConfig, storage: Operator) -> Self {
        Self {
            config,
            storage,
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
