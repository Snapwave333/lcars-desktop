use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemKind {
  Folder,
  Shortcut,
  Script,
  Executable,
  Image,
  Document,
  File,
}

#[derive(Debug, Clone, Serialize)]
pub struct FsEntry {
  pub name: String,
  pub filename: String,
  pub path: String,
  pub item_type: ItemKind,
  pub extension: String,
  pub size_bytes: u64,
  pub modified_epoch: u64,
  pub hidden: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DirectoryListing {
  pub path: String,
  pub parent: Option<String>,
  pub items: Vec<FsEntry>,
  pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct QuickLocation {
  pub id: &'static str,
  pub name: String,
  pub path: String,
}

const MAX_ENTRIES: usize = 5000;
const IMAGE_EXT: &[&str] = &["png", "jpg", "jpeg", "gif", "bmp", "ico", "svg", "webp", "tif", "tiff", "heic"];
const DOC_EXT: &[&str] = &[
  "txt", "md", "json", "pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx", "rtf", "log", "xml",
  "yaml", "yml", "toml", "ini", "rs", "ts", "js", "html", "css", "py", "cs", "cpp", "h",
];
const SCRIPT_EXT: &[&str] = &["bat", "cmd", "ps1", "vbs", "sh"];
const EXEC_EXT: &[&str] = &["exe", "msi", "com", "msc"];

pub fn classify(is_dir: bool, ext: &str) -> ItemKind {
  if is_dir {
    ItemKind::Folder
  } else if ext == "lnk" || ext == "url" {
    ItemKind::Shortcut
  } else if SCRIPT_EXT.contains(&ext) {
    ItemKind::Script
  } else if EXEC_EXT.contains(&ext) {
    ItemKind::Executable
  } else if IMAGE_EXT.contains(&ext) {
    ItemKind::Image
  } else if DOC_EXT.contains(&ext) {
    ItemKind::Document
  } else {
    ItemKind::File
  }
}

fn is_hidden(path: &Path, meta: Option<&std::fs::Metadata>) -> bool {
  let dotted = path
    .file_name()
    .and_then(|n| n.to_str())
    .is_some_and(|n| n.starts_with('.'));
  #[cfg(windows)]
  {
    use std::os::windows::fs::MetadataExt;
    const HIDDEN: u32 = 0x2;
    const SYSTEM: u32 = 0x4;
    dotted || meta.is_some_and(|m| m.file_attributes() & (HIDDEN | SYSTEM) != 0)
  }
  #[cfg(not(windows))]
  {
    let _ = meta;
    dotted
  }
}

pub fn entry_for(path: &Path) -> Option<FsEntry> {
  let raw_name = path.file_name()?.to_string_lossy().to_string();
  if raw_name.eq_ignore_ascii_case("desktop.ini") {
    return None;
  }
  let meta = std::fs::metadata(path).ok();
  let is_dir = meta.as_ref().is_some_and(|m| m.is_dir());
  let ext = if is_dir {
    String::new()
  } else {
    path
      .extension()
      .map(|e| e.to_string_lossy().to_lowercase())
      .unwrap_or_default()
  };
  let kind = classify(is_dir, &ext);
  let name = match kind {
    ItemKind::Shortcut => path
      .file_stem()
      .map(|s| s.to_string_lossy().to_string())
      .unwrap_or_else(|| raw_name.clone()),
    _ => raw_name.clone(),
  };
  let hidden = is_hidden(path, meta.as_ref());
  let size_bytes = if is_dir { 0 } else { meta.as_ref().map_or(0, |m| m.len()) };
  let modified_epoch = meta
    .and_then(|m| m.modified().ok())
    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
    .map_or(0, |d| d.as_secs());
  Some(FsEntry {
    name,
    filename: raw_name,
    path: path.to_string_lossy().to_string(),
    item_type: kind,
    extension: ext,
    size_bytes,
    modified_epoch,
    hidden,
  })
}

fn read_entries(dir: &Path, out: &mut Vec<FsEntry>, seen: &mut HashSet<String>) -> Result<bool, String> {
  let entries = std::fs::read_dir(dir).map_err(|e| format!("cannot read {}: {e}", dir.display()))?;
  for entry in entries.flatten() {
    if out.len() >= MAX_ENTRIES {
      return Ok(true);
    }
    if let Some(item) = entry_for(&entry.path()) {
      if seen.insert(item.path.to_lowercase()) {
        out.push(item);
      }
    }
  }
  Ok(false)
}

fn sort_entries(items: &mut [FsEntry]) {
  items.sort_by_cached_key(|e| (e.item_type != ItemKind::Folder, e.name.to_lowercase()));
}

fn env_dir(var: &str, tail: &[&str]) -> Option<PathBuf> {
  let mut p = PathBuf::from(std::env::var_os(var)?);
  for t in tail {
    p.push(t);
  }
  p.exists().then_some(p)
}

pub fn desktop_dirs() -> Vec<PathBuf> {
  [
    env_dir("USERPROFILE", &["Desktop"]).or_else(|| env_dir("HOME", &["Desktop"])),
    env_dir("PUBLIC", &["Desktop"]),
  ]
  .into_iter()
  .flatten()
  .collect()
}

pub fn list_desktop() -> Result<DirectoryListing, String> {
  let mut items = Vec::new();
  let mut seen = HashSet::new();
  let mut truncated = false;
  for dir in desktop_dirs() {
    truncated |= read_entries(&dir, &mut items, &mut seen)?;
  }
  sort_entries(&mut items);
  Ok(DirectoryListing {
    path: String::new(),
    parent: None,
    items,
    truncated,
  })
}

pub fn list_directory(target: Option<&str>) -> Result<DirectoryListing, String> {
  let Some(raw) = target.map(str::trim).filter(|p| !p.is_empty()) else {
    return list_desktop();
  };
  let dir = PathBuf::from(raw);
  if !dir.is_dir() {
    return Err(format!("not a directory: {}", dir.display()));
  }
  let mut items = Vec::new();
  let truncated = read_entries(&dir, &mut items, &mut HashSet::new())?;
  sort_entries(&mut items);
  Ok(DirectoryListing {
    path: dir.to_string_lossy().to_string(),
    parent: dir.parent().map(|p| p.to_string_lossy().to_string()),
    items,
    truncated,
  })
}

pub fn quick_locations() -> Vec<QuickLocation> {
  let mut out = Vec::new();
  let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok();
  if let Some(home) = home {
    let base = PathBuf::from(&home);
    for (id, name, sub) in [
      ("desktop", "DESKTOP", "Desktop"),
      ("downloads", "DOWNLOADS", "Downloads"),
      ("documents", "DOCUMENTS", "Documents"),
      ("pictures", "PICTURES", "Pictures"),
      ("music", "MUSIC", "Music"),
      ("videos", "VIDEOS", "Videos"),
    ] {
      let p = base.join(sub);
      if p.exists() {
        out.push(QuickLocation { id, name: name.into(), path: p.to_string_lossy().to_string() });
      }
    }
    out.push(QuickLocation { id: "userhome", name: "USER PROFILE".into(), path: home });
  }
  #[cfg(windows)]
  {
    let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
    out.push(QuickLocation { id: "rootdrive", name: format!("SYSTEM DRIVE ({drive})"), path: format!("{drive}\\") });
  }
  #[cfg(not(windows))]
  out.push(QuickLocation { id: "rootdrive", name: "ROOT (/)".into(), path: "/".into() });
  out
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn classifies_by_extension() {
    assert_eq!(classify(true, ""), ItemKind::Folder);
    assert_eq!(classify(false, "lnk"), ItemKind::Shortcut);
    assert_eq!(classify(false, "ps1"), ItemKind::Script);
    assert_eq!(classify(false, "msc"), ItemKind::Executable);
    assert_eq!(classify(false, "webp"), ItemKind::Image);
    assert_eq!(classify(false, "toml"), ItemKind::Document);
    assert_eq!(classify(false, "bin"), ItemKind::File);
  }

  #[test]
  fn lists_directory_with_folders_first() {
    let root = std::env::temp_dir().join(format!("lcars-fs-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(root.join("zeta")).unwrap();
    std::fs::write(root.join("alpha.txt"), b"hi").unwrap();
    std::fs::write(root.join("desktop.ini"), b"").unwrap();
    let listing = list_directory(root.to_str()).unwrap();
    let names: Vec<_> = listing.items.iter().map(|i| i.filename.as_str()).collect();
    assert_eq!(names, vec!["zeta", "alpha.txt"]);
    assert_eq!(listing.items[1].size_bytes, 2);
    assert_eq!(listing.items[1].item_type, ItemKind::Document);
    std::fs::remove_dir_all(&root).unwrap();
  }

  #[test]
  fn rejects_missing_directory() {
    assert!(list_directory(Some("/definitely/not/here/lcars")).is_err());
  }
}
