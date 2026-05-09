//! OpenDAL-backed object storage from a YAML config.
//!
//! YAML layout: a single mapping with `type` or `scheme` (OpenDAL scheme) and flat scalar
//! options for [`opendal::Operator::via_iter`]. Only `fs` and `s3` are supported.
//!
//! For `fs`, relative `root` / `atomic_write_dir` are resolved against the YAML file directory.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use opendal::Operator;

const PATH_OPTION_KEYS: &[&str] = &["root", "atomic_write_dir"];

/// Verify connectivity to the storage backend.
pub async fn check(op: &Operator) -> Result<()> {
    op.check()
        .await
        .context("storage connectivity check failed")
}

fn ensure_supported_scheme(scheme: &str) -> Result<()> {
    match scheme {
        "fs" | "s3" => Ok(()),
        other => bail!(
            "storage scheme `{other}` is not supported; allowed: `fs`, S3-compatible `s3`"
        ),
    }
}

/// Load an OpenDAL [`Operator`] from a YAML config file.
pub fn load_operator_from_yaml_path(config_path: &Path) -> Result<Operator> {
    let raw = std::fs::read_to_string(config_path)
        .with_context(|| format!("read storage config {}", config_path.display()))?;

    let value: serde_yaml::Value = serde_yaml::from_str(&raw)
        .with_context(|| format!("parse YAML {}", config_path.display()))?;

    let mapping = value.as_mapping().ok_or_else(|| {
        anyhow::anyhow!(
            "storage config {}: root must be a YAML mapping",
            config_path.display()
        )
    })?;

    let mut scheme: Option<String> = None;
    let mut pairs: Vec<(String, String)> = Vec::new();

    for (k, v) in mapping {
        let key = k.as_str().ok_or_else(|| {
            anyhow::anyhow!(
                "storage config {}: keys must be strings",
                config_path.display()
            )
        })?;
        if key == "type" || key == "scheme" {
            scheme = Some(yaml_scalar_to_string(v).with_context(|| {
                format!(
                    "storage config {}: `{key}` must be a string scalar",
                    config_path.display()
                )
            })?);
            continue;
        }
        let val = yaml_scalar_to_string(v).with_context(|| {
            format!(
                "storage config {}: option `{key}` must be a scalar",
                config_path.display()
            )
        })?;
        pairs.push((key.to_string(), val));
    }

    let scheme = scheme
        .ok_or_else(|| {
            anyhow::anyhow!(
                "storage config {}: missing `type` or `scheme` (OpenDAL backend)",
                config_path.display()
            )
        })?
        .trim()
        .to_lowercase();

    ensure_supported_scheme(&scheme).with_context(|| config_path.display().to_string())?;

    let config_dir = config_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    if scheme == "fs" {
        resolve_relative_path_options(&config_dir, &mut pairs)
            .with_context(|| format!("resolve paths in {}", config_path.display()))?;
        ensure_fs_directories(&pairs)
            .with_context(|| format!("prepare fs dirs for {}", config_path.display()))?;
    }

    Operator::via_iter(scheme.as_str(), pairs)
        .map_err(|e| anyhow::anyhow!("OpenDAL ({scheme}): {e}"))
}

fn yaml_scalar_to_string(v: &serde_yaml::Value) -> Result<String> {
    match v {
        serde_yaml::Value::String(s) => Ok(s.clone()),
        serde_yaml::Value::Number(n) => Ok(n.to_string()),
        serde_yaml::Value::Bool(b) => Ok(b.to_string()),
        serde_yaml::Value::Null => bail!("unexpected null"),
        _ => bail!("expected a scalar"),
    }
}

fn resolve_relative_path_options(config_dir: &Path, pairs: &mut [(String, String)]) -> Result<()> {
    for (k, v) in pairs.iter_mut() {
        if !PATH_OPTION_KEYS.contains(&k.as_str()) {
            continue;
        }
        let p = Path::new(v.as_str());
        if p.is_absolute() {
            continue;
        }
        let joined = config_dir.join(p);
        std::fs::create_dir_all(&joined).with_context(|| format!("mkdir {}", joined.display()))?;
        let canon = joined
            .canonicalize()
            .with_context(|| format!("canonicalize {}", joined.display()))?;
        *v = canon.to_string_lossy().into_owned();
    }
    Ok(())
}

fn ensure_fs_directories(pairs: &[(String, String)]) -> Result<()> {
    for (k, v) in pairs {
        if k == "root" || k == "atomic_write_dir" {
            std::fs::create_dir_all(v).with_context(|| format!("mkdir storage path {v}"))?;
        }
    }
    Ok(())
}
