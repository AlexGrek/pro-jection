use std::sync::Arc;

use axum::{
    Json,
    body::Body,
    extract::{Multipart, Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::IntoResponse,
};
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
pub struct UploadResponse {
    url: String,
}

/// File extensions accepted as uploads. Shared with the ZIP importer
/// ([`crate::routes::archive`]) so an archive can never smuggle in a kind of file that the
/// upload endpoint would have rejected.
pub fn ext_allowed(ext: &str) -> bool {
    matches!(
        ext,
        "png" | "jpg" | "jpeg" | "webp" | "svg" | "mp4" | "webm" | "ogv" | "mov"
    )
}

/// Lowercased extension of a file name, or `""` when it has none.
pub fn ext_of(name: &str) -> String {
    std::path::Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

/// Content type served for an uploaded key's extension.
pub fn content_type_for(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "ogv" => "video/ogg",
        "mov" => "video/quicktime",
        _ => "application/octet-stream",
    }
}

pub async fn upload(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, StatusCode> {
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        if field.name() != Some("file") {
            continue;
        }

        let filename = field.file_name().unwrap_or("upload").to_string();
        let ext = ext_of(&filename);

        if !ext_allowed(&ext) {
            return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE);
        }

        let data = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?;
        let key = format!("{}.{}", uuid::Uuid::new_v4(), ext);
        let storage_path = format!("uploads/{key}");

        state
            .storage
            .write(&storage_path, data)
            .await
            .map_err(|e| {
                log::error!("storage write error: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        let url = format!("/api/useruploads/{key}");
        return Ok(Json(UploadResponse { url }));
    }

    Err(StatusCode::BAD_REQUEST)
}

pub async fn serve(
    State(state): State<Arc<AppState>>,
    Path(key): Path<String>,
) -> impl IntoResponse {
    let storage_path = format!("uploads/{key}");
    match state.storage.read(&storage_path).await {
        Ok(buf) => {
            let content_type = content_type_for(&ext_of(&key));
            let mut headers = HeaderMap::new();
            headers.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static(content_type),
            );
            headers.insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=31536000, immutable"),
            );
            (headers, Body::from(buf.to_bytes())).into_response()
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
