//! Persisted scenes with a rolling 14-day lifetime and reference-counted artifacts.
//!
//! Each saved scene is one file at `scenes/{id}.json` wrapping metadata plus the raw scene
//! blob. The scene blob is stored via [`serde_json::value::RawValue`] so the backend never
//! parses scene *content* — it only reads/writes the wrapper. The set of uploaded artifacts a
//! scene references is supplied by the frontend (`artifacts`), so the backend stays
//! content-agnostic. An upload lives as long as at least one scene references it; see the GC
//! in [`crate::run_gc`] and the immediate cleanup on re-save / delete below.

use std::collections::HashSet;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use opendal::Operator;
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;

use crate::state::AppState;

/// A saved scene's rolling lifetime. Re-saving rewrites the file and refreshes `saved_at`.
const SCENE_TTL_SECS: u64 = 14 * 24 * 60 * 60;
/// Grace period for an upload that no surviving scene references yet — long enough that a
/// freshly uploaded image survives until the user saves the scene that uses it.
const UPLOAD_GRACE: Duration = Duration::from_secs(24 * 60 * 60);

/// Request body for create (`POST`), re-save (`PUT`) and ZIP export (`POST …/export`).
#[derive(Deserialize)]
pub struct SaveRequest {
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) artifacts: Vec<String>,
    pub(crate) scene: Box<RawValue>,
}

/// On-disk representation of a saved scene.
#[derive(Serialize, Deserialize)]
pub struct StoredScene {
    pub id: String,
    pub name: String,
    pub saved_at: u64,
    pub artifacts: Vec<String>,
    pub scene: Box<RawValue>,
}

/// Lightweight summary returned by list / create / update (no scene body).
#[derive(Serialize)]
pub struct SceneMeta {
    id: String,
    name: String,
    saved_at: u64,
}

impl From<&StoredScene> for SceneMeta {
    fn from(s: &StoredScene) -> Self {
        SceneMeta {
            id: s.id.clone(),
            name: s.name.clone(),
            saved_at: s.saved_at,
        }
    }
}

pub(crate) fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub(crate) fn scene_path(id: &str) -> String {
    format!("scenes/{id}.json")
}

pub(crate) fn upload_path(key: &str) -> String {
    format!("uploads/{key}")
}

/// Reject ids that could escape the `scenes/` prefix via path traversal.
pub(crate) fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Reject artifact keys that could escape the `uploads/` prefix or name a file the upload
/// endpoint would not have accepted.
///
/// Artifact lists are caller-supplied — by the frontend on save, by the manifest on ZIP import
/// — and are pasted straight into [`upload_path`], which the delete paths then hand to
/// `storage.delete`. A key must therefore stay a plain upload file name.
pub(crate) fn valid_artifact_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 128
        && !key.starts_with('.')
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && crate::routes::assets::ext_allowed(&crate::routes::assets::ext_of(key))
}

/// Union of artifact keys referenced by every stored scene, optionally excluding one scene id.
///
/// Shared with the periodic GC ([`crate::run_gc`]) and the immediate cleanup paths.
pub async fn referenced_artifacts(storage: &Operator, exclude_id: Option<&str>) -> HashSet<String> {
    let mut refs = HashSet::new();
    let entries = match storage.list("scenes/").await {
        Ok(e) => e,
        Err(e) => {
            log::warn!("scenes: list failed: {e}");
            return refs;
        }
    };
    for entry in &entries {
        if entry.path().ends_with('/') {
            continue;
        }
        let stored = match read_scene(storage, entry.path()).await {
            Some(s) => s,
            None => continue,
        };
        if exclude_id == Some(stored.id.as_str()) {
            continue;
        }
        refs.extend(stored.artifacts);
    }
    refs
}

/// Read and deserialize a stored scene at a full storage path, logging+skipping on failure.
pub(crate) async fn read_scene(storage: &Operator, path: &str) -> Option<StoredScene> {
    let buf = match storage.read(path).await {
        Ok(b) => b,
        Err(e) => {
            log::warn!("scenes: read {path} failed: {e}");
            return None;
        }
    };
    match serde_json::from_slice::<StoredScene>(&buf.to_bytes()) {
        Ok(s) => Some(s),
        Err(e) => {
            log::warn!("scenes: parse {path} failed: {e}");
            None
        }
    }
}

/// Drop artifact keys that are not plain upload file names (see [`valid_artifact_key`]).
fn sanitize_artifacts(artifacts: Vec<String>) -> Vec<String> {
    artifacts
        .into_iter()
        .filter(|k| {
            let ok = valid_artifact_key(k);
            if !ok {
                log::warn!("scenes: ignoring invalid artifact key {k:?}");
            }
            ok
        })
        .collect()
}

/// Delete each candidate upload that is not in `referenced`.
async fn delete_unreferenced(storage: &Operator, candidates: &[String], referenced: &HashSet<String>) {
    for key in candidates {
        if referenced.contains(key) {
            continue;
        }
        match storage.delete(&upload_path(key)).await {
            Ok(()) => log::info!("scenes: deleted orphaned artifact {key}"),
            Err(e) => log::warn!("scenes: delete artifact {key} failed: {e}"),
        }
    }
}

pub(crate) async fn write_scene(storage: &Operator, stored: &StoredScene) -> Result<(), Response> {
    let body = serde_json::to_vec(stored).map_err(|e| {
        log::error!("scenes: serialize failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR.into_response()
    })?;
    storage.write(&scene_path(&stored.id), body).await.map_err(|e| {
        log::error!("scenes: write {} failed: {e}", stored.id);
        StatusCode::INTERNAL_SERVER_ERROR.into_response()
    })?;
    Ok(())
}

/// `GET /api/scenes` — list saved scenes (metadata only), newest first.
pub async fn list(State(state): State<Arc<AppState>>) -> Response {
    let entries = match state.storage.list("scenes/").await {
        Ok(e) => e,
        Err(e) => {
            log::error!("scenes: list failed: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };
    let mut metas: Vec<SceneMeta> = Vec::new();
    for entry in &entries {
        if entry.path().ends_with('/') {
            continue;
        }
        if let Some(stored) = read_scene(&state.storage, entry.path()).await {
            metas.push((&stored).into());
        }
    }
    metas.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
    Json(metas).into_response()
}

/// `POST /api/scenes` — create a new saved scene (first save or "Save As").
pub async fn create(State(state): State<Arc<AppState>>, Json(req): Json<SaveRequest>) -> Response {
    let stored = StoredScene {
        id: uuid::Uuid::new_v4().to_string(),
        name: req.name,
        saved_at: now_secs(),
        artifacts: sanitize_artifacts(req.artifacts),
        scene: req.scene,
    };
    if let Err(resp) = write_scene(&state.storage, &stored).await {
        return resp;
    }
    Json(SceneMeta::from(&stored)).into_response()
}

/// `GET /api/scenes/{id}` — full stored scene (scene blob embedded verbatim).
pub async fn get(Path(id): Path<String>, State(state): State<Arc<AppState>>) -> Response {
    if !valid_id(&id) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match read_scene(&state.storage, &scene_path(&id)).await {
        Some(stored) => Json(stored).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// `PUT /api/scenes/{id}` — re-save: refresh the lifetime and immediately drop artifacts the
/// scene no longer references (unless another scene still references them).
pub async fn update(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(req): Json<SaveRequest>,
) -> Response {
    if !valid_id(&id) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let Some(old) = read_scene(&state.storage, &scene_path(&id)).await else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let stored = StoredScene {
        id: id.clone(),
        name: req.name,
        saved_at: now_secs(),
        artifacts: sanitize_artifacts(req.artifacts),
        scene: req.scene,
    };
    if let Err(resp) = write_scene(&state.storage, &stored).await {
        return resp;
    }

    // Artifacts the previous version referenced but the new one no longer does.
    let new_set: HashSet<&String> = stored.artifacts.iter().collect();
    let removed: Vec<String> = old
        .artifacts
        .into_iter()
        .filter(|k| !new_set.contains(k))
        .collect();
    if !removed.is_empty() {
        let referenced = referenced_artifacts(&state.storage, Some(&id)).await;
        delete_unreferenced(&state.storage, &removed, &referenced).await;
    }

    Json(SceneMeta::from(&stored)).into_response()
}

/// `DELETE /api/scenes/{id}` — delete the scene and any artifacts it alone referenced.
pub async fn remove(Path(id): Path<String>, State(state): State<Arc<AppState>>) -> Response {
    if !valid_id(&id) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let Some(stored) = read_scene(&state.storage, &scene_path(&id)).await else {
        return StatusCode::NOT_FOUND.into_response();
    };

    if let Err(e) = state.storage.delete(&scene_path(&id)).await {
        log::error!("scenes: delete {id} failed: {e}");
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    if !stored.artifacts.is_empty() {
        let referenced = referenced_artifacts(&state.storage, Some(&id)).await;
        delete_unreferenced(&state.storage, &stored.artifacts, &referenced).await;
    }

    StatusCode::NO_CONTENT.into_response()
}

/// Periodic garbage collection: expire scenes past their TTL, then sweep any upload that no
/// surviving scene references and that is past the grace period. Run from `main`.
pub async fn run_gc(storage: &Operator) {
    let expired = expire_scenes(storage).await;
    if expired > 0 {
        log::info!("Scene GC: deleted {expired} expired scene(s)");
    }
    sweep_artifacts(storage).await;
}

/// Delete every scene whose `saved_at` is older than [`SCENE_TTL_SECS`]. Returns the count.
async fn expire_scenes(storage: &Operator) -> u32 {
    let now = now_secs();
    let entries = match storage.list("scenes/").await {
        Ok(e) => e,
        Err(e) => {
            log::warn!("scene GC: list failed: {e}");
            return 0;
        }
    };
    let mut deleted = 0;
    for entry in &entries {
        if entry.path().ends_with('/') {
            continue;
        }
        let Some(stored) = read_scene(storage, entry.path()).await else {
            continue;
        };
        if now.saturating_sub(stored.saved_at) <= SCENE_TTL_SECS {
            continue;
        }
        match storage.delete(entry.path()).await {
            Ok(()) => deleted += 1,
            Err(e) => log::warn!("scene GC: delete {} failed: {e}", entry.path()),
        }
    }
    deleted
}

/// Delete uploads referenced by no surviving scene that are older than [`UPLOAD_GRACE`].
async fn sweep_artifacts(storage: &Operator) {
    let referenced = referenced_artifacts(storage, None).await;
    let cutoff = opendal::raw::Timestamp::now() - UPLOAD_GRACE;

    let entries = match storage.list("uploads/").await {
        Ok(e) => e,
        Err(e) => {
            log::warn!("upload GC: list failed: {e}");
            return;
        }
    };

    let mut deleted = 0u32;
    let mut errors = 0u32;
    for entry in &entries {
        if entry.path().ends_with('/') {
            continue;
        }
        let key = entry.path().rsplit('/').next().unwrap_or(entry.path());
        if referenced.contains(key) {
            continue;
        }
        let meta = match storage.stat(entry.path()).await {
            Ok(m) => m,
            Err(e) => {
                log::warn!("upload GC: stat {} failed: {e}", entry.path());
                errors += 1;
                continue;
            }
        };
        let Some(last_modified) = meta.last_modified() else {
            continue;
        };
        if last_modified >= cutoff {
            continue;
        }
        match storage.delete(entry.path()).await {
            Ok(()) => deleted += 1,
            Err(e) => {
                log::warn!("upload GC: delete {} failed: {e}", entry.path());
                errors += 1;
            }
        }
    }

    if deleted > 0 || errors > 0 {
        log::info!("Upload GC: deleted={deleted} errors={errors}");
    }
}
