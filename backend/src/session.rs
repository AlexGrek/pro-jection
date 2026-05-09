use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;
use tokio::sync::{Mutex, broadcast};

/// Server-generated control events. Scene data is forwarded as raw text without parsing.
#[derive(Clone, Serialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerEvent {
    Connected { role: String, session_code: String },
    ControllerStatus { connected: bool },
    Error { message: String },
}

pub struct SessionState {
    /// Ordered list of raw scene JSON strings sent by the controller.
    pub history: Vec<String>,
    /// Index of the currently displayed scene. Valid iff `!history.is_empty()`.
    pub cursor: usize,
    pub controller_connected: bool,
    pub projector_count: usize,
    pub last_disconnect: Option<Instant>,
    pub tx: broadcast::Sender<String>,
}

impl SessionState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(128);
        Self {
            history: Vec::new(),
            cursor: 0,
            controller_connected: false,
            projector_count: 0,
            last_disconnect: None,
            tx,
        }
    }

    /// Append a new scene, truncating any redo history beyond the current cursor.
    pub fn push(&mut self, scene: String) {
        if self.history.is_empty() {
            self.history.push(scene);
            self.cursor = 0;
        } else {
            self.history.truncate(self.cursor + 1);
            self.history.push(scene);
            self.cursor = self.history.len() - 1;
        }
    }

    /// The raw scene string at the current cursor, if any.
    pub fn current(&self) -> Option<&str> {
        self.history.get(self.cursor).map(String::as_str)
    }
}

pub type SessionStore = Arc<Mutex<HashMap<String, SessionState>>>;
