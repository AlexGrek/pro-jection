use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use std::sync::Arc;

use crate::state::AppState;

fn json_response(body: String) -> Response {
    (StatusCode::OK, [(header::CONTENT_TYPE, "application/json")], body).into_response()
}

/// GET /api/sessions/{code}/history
/// Returns `{ "cursor": N, "items": [ <raw scene json>, ... ] }`.
pub async fn get_history(
    Path(code): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Response {
    let sessions = state.sessions.lock().await;
    let Some(session) = sessions.get(&code) else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let items = session.history.join(",");
    let body = format!(r#"{{"cursor":{},"items":[{}]}}"#, session.cursor, items);
    json_response(body)
}

/// POST /api/sessions/{code}/history/undo
/// Moves the cursor one step back and broadcasts the scene at the new position.
/// Returns `{ "cursor": N, "scene": <raw scene json> }` or 204 if already at start.
pub async fn undo(
    Path(code): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Response {
    let (tx, cursor, scene) = {
        let mut sessions = state.sessions.lock().await;
        let Some(session) = sessions.get_mut(&code) else {
            return StatusCode::NOT_FOUND.into_response();
        };
        if session.history.is_empty() || session.cursor == 0 {
            return StatusCode::NO_CONTENT.into_response();
        }
        session.cursor -= 1;
        let cursor = session.cursor;
        let scene = session.history[cursor].clone();
        (session.tx.clone(), cursor, scene)
    };

    let _ = tx.send(scene.clone());
    json_response(format!(r#"{{"cursor":{},"scene":{}}}"#, cursor, scene))
}

/// POST /api/sessions/{code}/history/redo
/// Moves the cursor one step forward and broadcasts the scene at the new position.
/// Returns `{ "cursor": N, "scene": <raw scene json> }` or 204 if already at end.
pub async fn redo(
    Path(code): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Response {
    let (tx, cursor, scene) = {
        let mut sessions = state.sessions.lock().await;
        let Some(session) = sessions.get_mut(&code) else {
            return StatusCode::NOT_FOUND.into_response();
        };
        if session.history.is_empty() || session.cursor >= session.history.len() - 1 {
            return StatusCode::NO_CONTENT.into_response();
        }
        session.cursor += 1;
        let cursor = session.cursor;
        let scene = session.history[cursor].clone();
        (session.tx.clone(), cursor, scene)
    };

    let _ = tx.send(scene.clone());
    json_response(format!(r#"{{"cursor":{},"scene":{}}}"#, cursor, scene))
}
