use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::Response;
use futures::{SinkExt, StreamExt};
use std::sync::Arc;
use std::time::Instant;

use crate::session::{ServerEvent, SessionState};
use crate::state::AppState;

fn ser(event: &ServerEvent) -> String {
    serde_json::to_string(event).unwrap_or_default()
}

pub async fn ws_controller(
    ws: WebSocketUpgrade,
    Path(code): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(move |socket| handle_controller(socket, code, state))
}

pub async fn ws_projector(
    ws: WebSocketUpgrade,
    Path(code): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(move |socket| handle_projector(socket, code, state))
}

async fn handle_controller(socket: WebSocket, code: String, state: Arc<AppState>) {
    let (mut sink, mut stream) = socket.split();

    let (tx, last_message) = {
        let mut sessions = state.sessions.lock().await;
        let session = sessions.entry(code.clone()).or_insert_with(SessionState::new);

        if session.controller_connected {
            let _ = sink
                .send(Message::Text(
                    ser(&ServerEvent::Error {
                        message: "A controller is already connected to this session".into(),
                    })
                    .into(),
                ))
                .await;
            return;
        }

        session.controller_connected = true;
        session.last_disconnect = None;
        (session.tx.clone(), session.current().map(str::to_owned))
    };

    let _ = sink
        .send(Message::Text(
            ser(&ServerEvent::Connected {
                role: "controller".into(),
                session_code: code.clone(),
            })
            .into(),
        ))
        .await;

    // Replay last scene so controller canvas is in sync on reconnect.
    if let Some(msg) = last_message {
        let _ = sink.send(Message::Text(msg.into())).await;
    }

    let _ = tx.send(ser(&ServerEvent::ControllerStatus { connected: true }));

    loop {
        match stream.next().await {
            Some(Ok(Message::Text(t))) => {
                // Append to history and broadcast verbatim — no parsing.
                {
                    let mut sessions = state.sessions.lock().await;
                    if let Some(s) = sessions.get_mut(&code) {
                        s.push(t.to_string());
                    }
                }
                let _ = tx.send(t.to_string());
            }
            Some(Ok(Message::Ping(p))) => {
                if sink.send(Message::Pong(p)).await.is_err() {
                    break;
                }
            }
            Some(Ok(Message::Close(_))) | None => break,
            Some(Err(_)) => break,
            _ => {}
        }
    }

    let mut sessions = state.sessions.lock().await;
    if let Some(s) = sessions.get_mut(&code) {
        s.controller_connected = false;
        if s.projector_count == 0 {
            s.last_disconnect = Some(Instant::now());
        }
        let _ = s
            .tx
            .send(ser(&ServerEvent::ControllerStatus { connected: false }));
    }
}

async fn handle_projector(socket: WebSocket, code: String, state: Arc<AppState>) {
    let (mut sink, mut stream) = socket.split();

    let (tx, last_message, controller_connected) = {
        let mut sessions = state.sessions.lock().await;
        let session = sessions.entry(code.clone()).or_insert_with(SessionState::new);
        session.projector_count += 1;
        session.last_disconnect = None;
        (
            session.tx.clone(),
            session.current().map(str::to_owned),
            session.controller_connected,
        )
    };

    let mut rx = tx.subscribe();

    let _ = sink
        .send(Message::Text(
            ser(&ServerEvent::Connected {
                role: "projector".into(),
                session_code: code.clone(),
            })
            .into(),
        ))
        .await;

    let _ = sink
        .send(Message::Text(
            ser(&ServerEvent::ControllerStatus {
                connected: controller_connected,
            })
            .into(),
        ))
        .await;

    // Replay last scene for late-joining projectors.
    if let Some(msg) = last_message {
        let _ = sink.send(Message::Text(msg.into())).await;
    }

    loop {
        tokio::select! {
            event = rx.recv() => {
                match event {
                    Ok(json) => {
                        if sink.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            msg = stream.next() => {
                match msg {
                    Some(Ok(Message::Ping(p))) => {
                        if sink.send(Message::Pong(p)).await.is_err() { break; }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }

    let mut sessions = state.sessions.lock().await;
    if let Some(s) = sessions.get_mut(&code) {
        s.projector_count = s.projector_count.saturating_sub(1);
        if s.projector_count == 0 && !s.controller_connected {
            s.last_disconnect = Some(Instant::now());
        }
    }
}
