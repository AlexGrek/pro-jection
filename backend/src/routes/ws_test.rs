use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::Response;
use futures::StreamExt;
use serde_json::json;

/// GET /ws/echo — unauthenticated WebSocket echo for manual testing.
pub async fn ws_echo(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(handle_ws_echo)
}

async fn handle_ws_echo(mut socket: WebSocket) {
    let _ = socket
        .send(Message::Text(
            json!({ "type": "hello" }).to_string().into(),
        ))
        .await;

    while let Some(msg_result) = socket.next().await {
        let msg = match msg_result {
            Ok(m) => m,
            Err(_) => return,
        };

        match msg {
            Message::Text(text) => {
                let text = text.to_string();
                let _ = socket
                    .send(Message::Text(
                        json!({ "type": "echo", "text": text }).to_string().into(),
                    ))
                    .await;
            }
            Message::Binary(bytes) => {
                let _ = socket.send(Message::Binary(bytes)).await;
            }
            Message::Ping(payload) => {
                let _ = socket.send(Message::Pong(payload)).await;
            }
            Message::Pong(_) => {}
            Message::Close(_) => return,
        }
    }
}
