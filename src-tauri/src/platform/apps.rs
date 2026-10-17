use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct InstalledApp {
  pub id: String,
  pub name: String,
  pub path: String,
  pub category: &'static str,
  pub code: String,
  pub color: &'static str,
}

const SKIP_WORDS: &[&str] = &["uninstall", "help", "readme", "documentation", "website", "release notes", "license", "manual"];

const CATEGORIES: &[(&str, &str, &[&str])] = &[
  (
    "DEVELOPMENT",
    "c-lavender",
    &["code", "visual studio", "studio", "git", "terminal", "powershell", "cmd", "wsl", "developer", "sdk", "python", "node", "cmake", "jetbrains", "docker"],
  ),
  ("GAMES", "c-orange", &["game", "steam", "epic", "bluestacks", "roblox", "minecraft", "battle.net", "gog", "xbox"]),
  (
    "INTERNET & COMMS",
    "c-sky",
    &["chrome", "firefox", "edge", "browser", "opera", "brave", "discord", "telegram", "slack", "teams", "zoom", "outlook", "wireguard", "vpn", "thunderbird"],
  ),
  (
    "MEDIA & GRAPHICS",
    "c-pink",
    &["media", "player", "obs", "plex", "video", "music", "vlc", "spotify", "blender", "paint", "photo", "gimp", "audacity", "krita"],
  ),
  (
    "OFFICE",
    "c-peach",
    &["word", "excel", "powerpoint", "onenote", "office", "notepad", "libreoffice", "acrobat", "pdf"],
  ),
  (
    "SYSTEM & ADMIN",
    "c-gold",
    &["manager", "monitor", "services", "registry", "control", "event", "device", "disk", "admin", "administrative tools", "system tools", "defragment", "recovery"],
  ),
];

pub fn categorize(name: &str, full_path: &str) -> (&'static str, &'static str) {
  let name = name.to_lowercase();
  let path = full_path.to_lowercase();
  CATEGORIES
    .iter()
    .find(|(_, _, words)| words.iter().any(|w| name.contains(w) || (w.contains(' ') && path.contains(w))))
    .map(|(c, color, _)| (*c, *color))
    .unwrap_or(("UTILITY & TOOLS", "c-teal"))
}

fn search_roots() -> Vec<PathBuf> {
  let start_menu = ["Microsoft", "Windows", "Start Menu", "Programs"];
  let mut roots = Vec::new();
  for var in ["ProgramData", "APPDATA"] {
    if let Some(base) = std::env::var_os(var) {
      let p = start_menu.iter().fold(PathBuf::from(base), |p, s| p.join(s));
      if p.exists() {
        roots.push(p);
      }
    }
  }
  roots.extend(super::fs::desktop_dirs());
  roots
}

fn walk(dir: &Path, depth: usize, found: &mut Vec<(String, String)>, seen: &mut HashSet<String>) {
  if depth > 6 {
    return;
  }
  let Ok(entries) = std::fs::read_dir(dir) else { return };
  for entry in entries.flatten() {
    let path = entry.path();
    let Ok(ft) = entry.file_type() else { continue };
    if ft.is_dir() {
      walk(&path, depth + 1, found, seen);
      continue;
    }
    let is_link = path
      .extension()
      .and_then(|e| e.to_str())
      .is_some_and(|e| e.eq_ignore_ascii_case("lnk") || e.eq_ignore_ascii_case("url"));
    if !is_link {
      continue;
    }
    let stem = path.file_stem().map(|s| s.to_string_lossy().trim().to_string()).unwrap_or_default();
    let lower = stem.to_lowercase();
    if stem.is_empty() || SKIP_WORDS.iter().any(|w| lower.contains(w)) || !seen.insert(lower) {
      continue;
    }
    found.push((stem, path.to_string_lossy().to_string()));
  }
}

pub fn scan() -> Vec<InstalledApp> {
  let mut found = Vec::new();
  let mut seen = HashSet::new();
  for root in search_roots() {
    walk(&root, 0, &mut found, &mut seen);
  }
  found.sort_by_cached_key(|(name, _)| name.to_lowercase());
  found
    .into_iter()
    .enumerate()
    .map(|(i, (name, path))| {
      let (category, color) = categorize(&name, &path);
      InstalledApp {
        id: format!("app-{}", i + 1),
        code: format!("APP-{:03}", i + 1),
        name,
        path,
        category,
        color,
      }
    })
    .collect()
}

static CACHE: Mutex<Option<Vec<InstalledApp>>> = Mutex::new(None);

pub fn installed(rescan: bool) -> Vec<InstalledApp> {
  let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
  if rescan || cache.is_none() {
    *cache = Some(scan());
  }
  cache.clone().unwrap_or_default()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn categorizes_known_apps() {
    assert_eq!(categorize("Visual Studio Code", "").0, "DEVELOPMENT");
    assert_eq!(categorize("Steam", "").0, "GAMES");
    assert_eq!(categorize("Google Chrome", "").0, "INTERNET & COMMS");
    assert_eq!(categorize("VLC media player", "").0, "MEDIA & GRAPHICS");
    assert_eq!(categorize("Excel", "").0, "OFFICE");
    assert_eq!(categorize("Defragment", r"c:\x\administrative tools\y.lnk").0, "SYSTEM & ADMIN");
    assert_eq!(categorize("Zzz", "").0, "UTILITY & TOOLS");
  }
}
