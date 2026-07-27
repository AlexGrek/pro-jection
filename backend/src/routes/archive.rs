//! ZIP import/export of scenes: one portable file holding the scene JSON plus every upload it
//! references.
//!
//! ```text
//! scene.json      manifest: { format, version, name, exported_at, artifacts, scene }
//! assets/<key>    one entry per referenced upload, under its original storage key
//! ```
//!
//! The backend stays content-agnostic — exactly as for saved scenes ([`super::scenes`]), the
//! `scene` blob is a [`RawValue`] that is never parsed, and the artifact list comes from the
//! caller (the request body on export, the manifest on import). Assets keep their original
//! `uploads/` key across the round trip, so the `/api/useruploads/{key}` URLs inside the scene
//! blob keep resolving without anyone having to rewrite them.

use std::collections::HashSet;
use std::io::{Cursor, Read, Write};
use std::sync::Arc;

use axum::{
    Json,
    body::Body,
    extract::{Multipart, Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use opendal::Operator;
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

use crate::routes::scenes::{
    SaveRequest, StoredScene, now_secs, read_scene, scene_path, upload_path, valid_artifact_key,
    valid_id, write_scene,
};
use crate::state::AppState;

/// Marker identifying our archives; import rejects anything else.
const FORMAT: &str = "pro-jection-scene";
/// Manifest schema version. Import accepts anything it knows, i.e. `<= VERSION`.
const VERSION: u32 = 1;
const MANIFEST_NAME: &str = "scene.json";
const ASSET_DIR: &str = "assets/";
/// Ceiling on bytes unpacked from an uploaded archive, so a zip bomb can't exhaust the pod.
const MAX_UNPACKED: u64 = 400 * 1024 * 1024;

/// `scene.json` inside the archive. `id`/`saved_at` are deliberately absent: they belong to a
/// particular server, and import always mints a fresh scene.
#[derive(Serialize, Deserialize)]
struct Manifest {
    format: String,
    version: u32,
    name: String,
    exported_at: u64,
    #[serde(default)]
    artifacts: Vec<String>,
    scene: Box<RawValue>,
}

/// Turn a scene name into a safe ASCII download file name.
fn archive_filename(name: &str) -> String {
    let mut slug: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    while slug.contains("--") {
        slug = slug.replace("--", "-");
    }
    let slug = slug.trim_matches('-');
    let slug = if slug.is_empty() { "scene" } else { slug };
    format!("{}.zip", &slug[..slug.len().min(64)])
}

fn zip_response(bytes: Vec<u8>, filename: &str) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/zip"),
    );
    if let Ok(v) = HeaderValue::from_str(&format!("attachment; filename=\"{filename}\"")) {
        headers.insert(header::CONTENT_DISPOSITION, v);
    }
    (headers, Body::from(bytes)).into_response()
}

/// Pack a manifest plus its assets into a ZIP. Blocking (CPU + memory bound) — call from
/// [`tokio::task::spawn_blocking`].
fn pack(manifest: Vec<u8>, files: Vec<(String, Vec<u8>)>) -> zip::result::ZipResult<Vec<u8>> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    // Uploads are already-compressed media; deflating them costs CPU and saves nothing.
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

    zip.start_file(MANIFEST_NAME, deflated)?;
    zip.write_all(&manifest)?;
    for (key, bytes) in files {
        zip.start_file(format!("{ASSET_DIR}{key}"), stored)?;
        zip.write_all(&bytes)?;
    }
    Ok(zip.finish()?.into_inner())
}

/// Build the archive for one scene: manifest + every artifact that is still in storage.
///
/// Artifacts that have already been swept keep the export going (with a warning) rather than
/// failing it — a scene that lost an upload is still worth exporting.
async fn build(storage: &Operator, name: String, artifacts: Vec<String>, scene: Box<RawValue>) -> Response {
    let keys: Vec<String> = {
        let mut seen = HashSet::new();
        artifacts
            .into_iter()
            .filter(|k| valid_artifact_key(k) && seen.insert(k.clone()))
            .collect()
    };

    let manifest = Manifest {
        format: FORMAT.to_string(),
        version: VERSION,
        name: name.clone(),
        exported_at: now_secs(),
        artifacts: keys.clone(),
        scene,
    };
    let manifest_bytes = match serde_json::to_vec(&manifest) {
        Ok(b) => b,
        Err(e) => {
            log::error!("archive: manifest serialize failed: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let mut files: Vec<(String, Vec<u8>)> = Vec::with_capacity(keys.len());
    for key in keys {
        match storage.read(&upload_path(&key)).await {
            Ok(buf) => files.push((key, buf.to_vec())),
            Err(e) => log::warn!("archive: artifact {key} unavailable, skipped: {e}"),
        }
    }

    let bytes = match tokio::task::spawn_blocking(move || pack(manifest_bytes, files)).await {
        Ok(Ok(b)) => b,
        Ok(Err(e)) => {
            log::error!("archive: pack failed: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
        Err(e) => {
            log::error!("archive: pack task failed: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    zip_response(bytes, &archive_filename(&name))
}

/// `POST /api/scenes/export` — export the scene in the request body (the controller's live
/// canvas, saved or not). Same body shape as `POST /api/scenes`.
pub async fn export_current(State(state): State<Arc<AppState>>, Json(req): Json<SaveRequest>) -> Response {
    build(&state.storage, req.name, req.artifacts, req.scene).await
}

/// `GET /api/scenes/{id}/export` — export a saved scene. Plain `GET` so the browser can
/// download it from a link.
pub async fn export_saved(Path(id): Path<String>, State(state): State<Arc<AppState>>) -> Response {
    if !valid_id(&id) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let Some(stored) = read_scene(&state.storage, &scene_path(&id)).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    build(&state.storage, stored.name, stored.artifacts, stored.scene).await
}

/// Unpack an archive into its manifest bytes and `(key, bytes)` assets. Blocking — call from
/// [`tokio::task::spawn_blocking`].
///
/// Tolerates archives that were re-zipped with a wrapping folder (`my-scene/scene.json`) by
/// taking the manifest's own directory as the root. Entries outside that root, asset keys that
/// are not plain file names, and anything past [`MAX_UNPACKED`] are skipped.
fn unpack(bytes: Vec<u8>) -> Result<(Vec<u8>, Vec<(String, Vec<u8>)>), String> {
    let mut zip = ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("not a ZIP archive: {e}"))?;

    let root = (0..zip.len())
        .filter_map(|i| zip.by_index(i).ok().map(|f| f.name().to_string()))
        .find(|n| n == MANIFEST_NAME || n.ends_with(&format!("/{MANIFEST_NAME}")))
        .map(|n| n[..n.len() - MANIFEST_NAME.len()].to_string())
        .ok_or_else(|| format!("{MANIFEST_NAME} not found in archive"))?;

    let mut manifest = Vec::new();
    let mut files = Vec::new();
    let mut unpacked: u64 = 0;

    for i in 0..zip.len() {
        let mut file = zip.by_index(i).map_err(|e| format!("unreadable entry: {e}"))?;
        if file.is_dir() {
            continue;
        }
        let name = file.name().to_string();
        let Some(rel) = name.strip_prefix(root.as_str()) else {
            continue;
        };

        let is_manifest = rel == MANIFEST_NAME;
        let asset_key = rel.strip_prefix(ASSET_DIR).filter(|k| valid_artifact_key(k));
        if !is_manifest && asset_key.is_none() {
            if rel.starts_with(ASSET_DIR) {
                log::warn!("archive import: skipped asset entry {name}");
            }
            continue;
        }

        unpacked += file.size();
        if unpacked > MAX_UNPACKED {
            return Err("archive contents exceed the size limit".to_string());
        }

        let mut buf = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut buf)
            .map_err(|e| format!("failed to read {name}: {e}"))?;

        match asset_key {
            Some(key) => files.push((key.to_string(), buf)),
            None => manifest = buf,
        }
    }

    Ok((manifest, files))
}

/// `POST /api/scenes/import` — restore a ZIP archive: write back the uploads it carries, save
/// the scene under a fresh id, and return it in the same shape as `GET /api/scenes/{id}` so the
/// controller can load it straight onto the canvas.
pub async fn import_archive(State(state): State<Arc<AppState>>, mut multipart: Multipart) -> Response {
    let mut data: Option<Vec<u8>> = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() != Some("file") {
            continue;
        }
        match field.bytes().await {
            Ok(b) => data = Some(b.to_vec()),
            Err(e) => {
                log::warn!("archive import: read body failed: {e}");
                return (StatusCode::BAD_REQUEST, "could not read the uploaded file").into_response();
            }
        }
        break;
    }
    let Some(data) = data else {
        return (StatusCode::BAD_REQUEST, "no file field in the request").into_response();
    };

    let (manifest_bytes, files) = match tokio::task::spawn_blocking(move || unpack(data)).await {
        Ok(Ok(v)) => v,
        Ok(Err(msg)) => {
            log::warn!("archive import: {msg}");
            return (StatusCode::BAD_REQUEST, msg).into_response();
        }
        Err(e) => {
            log::error!("archive import: unpack task failed: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let manifest: Manifest = match serde_json::from_slice(&manifest_bytes) {
        Ok(m) => m,
        Err(e) => {
            log::warn!("archive import: manifest parse failed: {e}");
            return (StatusCode::BAD_REQUEST, format!("invalid {MANIFEST_NAME}: {e}")).into_response();
        }
    };
    if manifest.format != FORMAT {
        return (StatusCode::BAD_REQUEST, "not a pro-jection scene archive").into_response();
    }
    if manifest.version > VERSION {
        return (
            StatusCode::BAD_REQUEST,
            format!("archive version {} is newer than this server supports", manifest.version),
        )
            .into_response();
    }

    // Assets keep their original key. Keys are UUID-based, so an existing file is the same
    // file — leave it alone and let its own reference counting stand.
    for (key, bytes) in files {
        let path = upload_path(&key);
        if state.storage.exists(&path).await.unwrap_or(false) {
            continue;
        }
        if let Err(e) = state.storage.write(&path, bytes).await {
            log::error!("archive import: write artifact {key} failed: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }

    let stored = StoredScene {
        id: uuid::Uuid::new_v4().to_string(),
        name: if manifest.name.trim().is_empty() {
            "Imported scene".to_string()
        } else {
            manifest.name
        },
        saved_at: now_secs(),
        artifacts: manifest
            .artifacts
            .into_iter()
            .filter(|k| valid_artifact_key(k))
            .collect(),
        scene: manifest.scene,
    };
    if let Err(resp) = write_scene(&state.storage, &stored).await {
        return resp;
    }
    Json(stored).into_response()
}
