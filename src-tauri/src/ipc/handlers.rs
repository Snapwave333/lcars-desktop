use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use std::process::Command;

const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_VALUE: &str = "LCARSShell";
const WINLOGON_KEY: &str = r"HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon";

fn main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
  app.get_webview_window("main")
    .ok_or_else(|| "no main window".to_string())
}

fn str_arg<'a>(args: &'a Value, key: &str) -> Result<&'a str, String> {
  args
    .get(key)
    .and_then(|v| v.as_str())
    .ok_or_else(|| format!("missing '{key}' argument"))
}

fn str_list(args: &Value, key: &str) -> Vec<String> {
  args
    .get(key)
    .and_then(|v| v.as_array())
    .map(|a| {
      a.iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect()
    })
    .unwrap_or_default()
}

fn exe_path() -> Result<String, String> {
  let exe = std::env::current_exe().map_err(|e| e.to_string())?;
  Ok(format!("\"{}\"", exe.display()))
}

fn reg(args: &[&str]) -> Result<(), String> {
  let status = Command::new("reg")
    .args(args)
    .output()
    .map_err(|e| e.to_string())?;
  if status.status.success() {
    Ok(())
  } else {
    Err(String::from_utf8_lossy(&status.stderr).trim().to_string())
  }
}

pub fn get_current_wallpaper() -> String {
  #[cfg(windows)]
  {
    if let Ok(output) = Command::new("reg")
      .args(&["query", r"HKCU\Control Panel\Desktop", "/v", "WallPaper"])
      .output()
    {
      if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
          if line.contains("WallPaper") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
              return parts[2..].join(" ");
            }
          }
        }
      }
    }
  }
  String::new()
}

pub fn list_desktop_items() -> Result<Value, String> {
  let mut items = Vec::new();
  let mut seen_paths = std::collections::HashSet::new();

  let mut desktop_dirs = Vec::new();
  if let Ok(profile) = std::env::var("USERPROFILE") {
    let p = std::path::PathBuf::from(profile).join("Desktop");
    if p.exists() {
      desktop_dirs.push(p);
    }
  }
  if let Ok(public_dir) = std::env::var("PUBLIC") {
    let p = std::path::PathBuf::from(public_dir).join("Desktop");
    if p.exists() {
      desktop_dirs.push(p);
    }
  }

  for dir in desktop_dirs {
    if let Ok(entries) = std::fs::read_dir(&dir) {
      for entry in entries.flatten() {
        let path = entry.path();
        if path.file_name().map(|n| n == "desktop.ini").unwrap_or(false) {
          continue;
        }
        let full_path = path.to_string_lossy().to_string();
        if seen_paths.contains(&full_path) {
          continue;
        }
        seen_paths.insert(full_path.clone());

        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        let raw_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();

        let item_type = if is_dir {
          "folder"
        } else if ext == "lnk" || ext == "url" {
          "shortcut"
        } else if ext == "bat" || ext == "cmd" || ext == "ps1" {
          "script"
        } else if ext == "exe" {
          "executable"
        } else if ["png", "jpg", "jpeg", "ico", "bmp", "svg", "webp"].contains(&ext.as_str()) {
          "image"
        } else if ["txt", "md", "json", "pdf", "docx", "doc", "csv", "xlsx"].contains(&ext.as_str()) {
          "document"
        } else {
          "file"
        };

        let display_name = if ext == "lnk" || ext == "url" {
          path.file_stem().and_then(|s| s.to_str()).unwrap_or(&raw_name).to_string()
        } else {
          raw_name.clone()
        };

        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified = metadata
          .and_then(|m| m.modified().ok())
          .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
          .map(|d| d.as_secs())
          .unwrap_or(0);

        items.push(json!({
          "name": display_name,
          "filename": raw_name,
          "path": full_path,
          "item_type": item_type,
          "extension": ext,
          "size_bytes": size,
          "modified_epoch": modified,
        }));
      }
    }
  }

  items.sort_by(|a, b| {
    let name_a = a["name"].as_str().unwrap_or("");
    let name_b = b["name"].as_str().unwrap_or("");
    name_a.to_lowercase().cmp(&name_b.to_lowercase())
  });

  Ok(Value::Array(items))
}

pub fn list_directory(target_path: Option<&str>) -> Result<Value, String> {
  let target = match target_path {
    Some(p) if !p.trim().is_empty() => std::path::PathBuf::from(p.trim()),
    _ => return list_desktop_items(),
  };

  if !target.exists() {
    return Err(format!("path does not exist: {}", target.display()));
  }

  let mut items = Vec::new();
  if let Ok(entries) = std::fs::read_dir(&target) {
    for entry in entries.flatten() {
      let path = entry.path();
      if path.file_name().map(|n| n == "desktop.ini").unwrap_or(false) {
        continue;
      }
      let full_path = path.to_string_lossy().to_string();
      let metadata = entry.metadata().ok();
      let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
      let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
      let raw_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();

      let item_type = if is_dir {
        "folder"
      } else if ext == "lnk" || ext == "url" {
        "shortcut"
      } else if ext == "bat" || ext == "cmd" || ext == "ps1" {
        "script"
      } else if ext == "exe" {
        "executable"
      } else if ["png", "jpg", "jpeg", "ico", "bmp", "svg", "webp", "gif"].contains(&ext.as_str()) {
        "image"
      } else if ["txt", "md", "json", "pdf", "docx", "doc", "csv", "xlsx", "yaml", "yml", "toml", "rs", "ts", "js", "html", "css"].contains(&ext.as_str()) {
        "document"
      } else {
        "file"
      };

      let display_name = if ext == "lnk" || ext == "url" {
        path.file_stem().and_then(|s| s.to_str()).unwrap_or(&raw_name).to_string()
      } else {
        raw_name.clone()
      };

      let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
      let modified = metadata
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

      items.push(json!({
        "name": display_name,
        "filename": raw_name,
        "path": full_path,
        "item_type": item_type,
        "extension": ext,
        "size_bytes": size,
        "modified_epoch": modified,
      }));
    }
  }

  items.sort_by(|a, b| {
    let is_dir_a = a["item_type"] == "folder";
    let is_dir_b = b["item_type"] == "folder";
    if is_dir_a != is_dir_b {
      return is_dir_b.cmp(&is_dir_a);
    }
    let name_a = a["name"].as_str().unwrap_or("");
    let name_b = b["name"].as_str().unwrap_or("");
    name_a.to_lowercase().cmp(&name_b.to_lowercase())
  });

  Ok(Value::Array(items))
}

pub fn get_quick_locations() -> Value {
  let mut locations = Vec::new();
  if let Ok(profile) = std::env::var("USERPROFILE") {
    let p = std::path::PathBuf::from(&profile);
    let desktop = p.join("Desktop");
    let downloads = p.join("Downloads");
    let documents = p.join("Documents");
    let pictures = p.join("Pictures");
    locations.push(json!({ "id": "desktop", "name": "DESKTOP", "path": desktop.to_string_lossy().to_string() }));
    locations.push(json!({ "id": "downloads", "name": "DOWNLOADS", "path": downloads.to_string_lossy().to_string() }));
    locations.push(json!({ "id": "documents", "name": "DOCUMENTS", "path": documents.to_string_lossy().to_string() }));
    locations.push(json!({ "id": "pictures", "name": "PICTURES", "path": pictures.to_string_lossy().to_string() }));
    locations.push(json!({ "id": "userhome", "name": "USER PROFILE", "path": profile }));
  }
  let sys_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
  locations.push(json!({ "id": "rootdrive", "name": format!("SYSTEM DRIVE ({sys_drive})"), "path": format!("{sys_drive}\\") }));
  json!(locations)
}

pub fn scan_installed_apps() -> Value {
  let mut apps = Vec::new();
  let mut seen_names = std::collections::HashSet::new();

  let mut search_dirs = Vec::new();
  if let Ok(program_data) = std::env::var("ProgramData") {
    let p = std::path::PathBuf::from(program_data).join("Microsoft").join("Windows").join("Start Menu").join("Programs");
    if p.exists() {
      search_dirs.push(p);
    }
  }
  if let Ok(app_data) = std::env::var("APPDATA") {
    let p = std::path::PathBuf::from(app_data).join("Microsoft").join("Windows").join("Start Menu").join("Programs");
    if p.exists() {
      search_dirs.push(p);
    }
  }
  if let Ok(profile) = std::env::var("USERPROFILE") {
    let p = std::path::PathBuf::from(profile).join("Desktop");
    if p.exists() {
      search_dirs.push(p);
    }
  }
  if let Ok(public) = std::env::var("PUBLIC") {
    let p = std::path::PathBuf::from(public).join("Desktop");
    if p.exists() {
      search_dirs.push(p);
    }
  }

  fn walk_dir(dir: &std::path::Path, apps: &mut Vec<Value>, seen: &mut std::collections::HashSet<String>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
      for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
          walk_dir(&path, apps, seen);
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
          if ext.eq_ignore_ascii_case("lnk") || ext.eq_ignore_ascii_case("url") {
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            let stem_lower = stem.to_lowercase();
            if stem_lower.contains("uninstall")
              || stem_lower.contains("help")
              || stem_lower.contains("readme")
              || stem_lower.contains("documentation")
              || stem_lower.contains("website")
              || stem_lower.contains("release notes")
              || stem_lower.contains("license")
              || stem.is_empty()
            {
              continue;
            }
            if seen.contains(&stem_lower) {
              continue;
            }
            seen.insert(stem_lower.clone());

            let full_path = path.to_string_lossy().to_string();
            let full_lower = full_path.to_lowercase();

            let category = if stem_lower.contains("code")
              || stem_lower.contains("visual studio")
              || stem_lower.contains("studio")
              || stem_lower.contains("git")
              || stem_lower.contains("terminal")
              || stem_lower.contains("powershell")
              || stem_lower.contains("cmd")
              || stem_lower.contains("wsl")
              || stem_lower.contains("developer")
              || stem_lower.contains("sdk")
              || stem_lower.contains("python")
              || stem_lower.contains("node")
              || stem_lower.contains("cmake")
            {
              "DEVELOPMENT"
            } else if stem_lower.contains("game")
              || stem_lower.contains("steam")
              || stem_lower.contains("epic")
              || stem_lower.contains("bluestacks")
              || stem_lower.contains("play")
              || stem_lower.contains("roblox")
              || stem_lower.contains("minecraft")
            {
              "GAMES"
            } else if stem_lower.contains("chrome")
              || stem_lower.contains("firefox")
              || stem_lower.contains("edge")
              || stem_lower.contains("browser")
              || stem_lower.contains("tor")
              || stem_lower.contains("discord")
              || stem_lower.contains("telegram")
              || stem_lower.contains("slack")
              || stem_lower.contains("wireguard")
              || stem_lower.contains("vpn")
            {
              "INTERNET & COMMS"
            } else if stem_lower.contains("media")
              || stem_lower.contains("player")
              || stem_lower.contains("obs")
              || stem_lower.contains("plex")
              || stem_lower.contains("video")
              || stem_lower.contains("music")
              || stem_lower.contains("vlc")
              || stem_lower.contains("spotify")
              || stem_lower.contains("blender")
              || stem_lower.contains("paint")
              || stem_lower.contains("photo")
            {
              "MEDIA & GRAPHICS"
            } else if stem_lower.contains("manager")
              || stem_lower.contains("monitor")
              || stem_lower.contains("services")
              || stem_lower.contains("registry")
              || stem_lower.contains("control")
              || stem_lower.contains("event")
              || stem_lower.contains("device")
              || stem_lower.contains("disk")
              || stem_lower.contains("admin")
              || full_lower.contains("administrative tools")
              || full_lower.contains("system tools")
            {
              "SYSTEM & ADMIN"
            } else {
              "UTILITY & TOOLS"
            };

            let color = match category {
              "DEVELOPMENT" => "c-lavender",
              "GAMES" => "c-orange",
              "INTERNET & COMMS" => "c-sky",
              "MEDIA & GRAPHICS" => "c-pink",
              "SYSTEM & ADMIN" => "c-gold",
              _ => "c-teal",
            };

            let id_num = apps.len() + 1;
            apps.push(json!({
              "id": format!("app-{id_num}"),
              "name": stem,
              "path": full_path,
              "category": category,
              "code": format!("APP-{:03}", id_num),
              "color": color,
            }));
          }
        }
      }
    }
  }

  for dir in search_dirs {
    walk_dir(&dir, &mut apps, &mut seen_names);
  }

  apps.sort_by(|a, b| {
    let name_a = a["name"].as_str().unwrap_or("");
    let name_b = b["name"].as_str().unwrap_or("");
    name_a.to_lowercase().cmp(&name_b.to_lowercase())
  });

  json!(apps)
}

pub fn get_shell_status() -> Value {
  let mut autostart = false;
  let mut shell_is_lcars = false;
  #[cfg(windows)]
  {
    if let Ok(out) = Command::new("reg").args(&["query", RUN_KEY, "/v", RUN_VALUE]).output() {
      autostart = out.status.success();
    }
    if let Ok(out) = Command::new("reg").args(&["query", WINLOGON_KEY, "/v", "Shell"]).output() {
      if out.status.success() {
        let text = String::from_utf8_lossy(&out.stdout);
        if text.to_lowercase().contains("lcars") {
          shell_is_lcars = true;
        }
      }
    }
  }
  json!({
    "autostart_enabled": autostart,
    "lcars_shell_active": shell_is_lcars
  })
}

#[cfg(windows)]
pub fn get_system_telemetry() -> Value {
  use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, GetTickCount64, MEMORYSTATUSEX};

  let hostname = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "STARSHIP-LOCAL".to_string());
  let username = std::env::var("USERNAME").unwrap_or_else(|_| "OFFICER".to_string());
  let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
  let arch = std::env::consts::ARCH;
  let os = std::env::consts::OS;

  let (total_mb, avail_mb, load_pct) = unsafe {
    let mut mem_status = MEMORYSTATUSEX {
      dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
      dwMemoryLoad: 0,
      ullTotalPhys: 0,
      ullAvailPhys: 0,
      ullTotalPageFile: 0,
      ullAvailPageFile: 0,
      ullTotalVirtual: 0,
      ullAvailVirtual: 0,
      ullAvailExtendedVirtual: 0,
    };
    if GlobalMemoryStatusEx(&mut mem_status) != 0 {
      (
        mem_status.ullTotalPhys / (1024 * 1024),
        mem_status.ullAvailPhys / (1024 * 1024),
        mem_status.dwMemoryLoad,
      )
    } else {
      (0, 0, 0)
    }
  };

  let uptime_sec = unsafe { GetTickCount64() / 1000 };
  let wallpaper = get_current_wallpaper();

  json!({
    "hostname": hostname,
    "username": username,
    "os": os,
    "arch": arch,
    "cpu_cores": cores,
    "total_memory_mb": total_mb,
    "available_memory_mb": avail_mb,
    "memory_load_percent": load_pct,
    "uptime_seconds": uptime_sec,
    "wallpaper_path": wallpaper,
    "app_version": env!("CARGO_PKG_VERSION"),
  })
}

#[cfg(not(windows))]
pub fn get_system_telemetry() -> Value {
  json!({
    "hostname": std::env::var("HOSTNAME").unwrap_or_else(|_| "STARSHIP-LOCAL".to_string()),
    "username": std::env::var("USER").unwrap_or_else(|_| "OFFICER".to_string()),
    "os": std::env::consts::OS,
    "arch": std::env::consts::ARCH,
    "cpu_cores": std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1),
    "total_memory_mb": 16384,
    "available_memory_mb": 8192,
    "memory_load_percent": 50,
    "uptime_seconds": 3600,
    "wallpaper_path": "",
    "app_version": env!("CARGO_PKG_VERSION"),
  })
}

pub fn dispatch(app: &AppHandle, cmd: &str, args: &Value) -> Result<Value, String> {
  match cmd {
    "status" => {
      let visible = main_window(app)
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false);
      Ok(json!({ "running": true, "window_visible": visible }))
    }
    "info" | "system-info" => {
      Ok(get_system_telemetry())
    }
    "desktop-items" | "desktop" => {
      list_desktop_items()
    }
    "list-dir" | "list_dir" => {
      let path = args.get("path").and_then(|v| v.as_str());
      list_directory(path)
    }
    "installed-apps" | "installed_apps" => {
      Ok(scan_installed_apps())
    }
    "quick-locations" | "quick_locations" => {
      Ok(get_quick_locations())
    }
    "shell-status" | "shell_status" => {
      Ok(get_shell_status())
    }
    "reveal" => {
      let path = str_arg(args, "path")?;
      #[cfg(windows)]
      {
        let child = Command::new("explorer")
          .args(&["/select,", path])
          .spawn()
          .map_err(|e| e.to_string())?;
        Ok(json!({ "revealed": true, "path": path, "pid": child.id() }))
      }
      #[cfg(not(windows))]
      {
        Ok(json!({ "revealed": false }))
      }
    }
    "open" => {
      let path = str_arg(args, "path")?;
      #[cfg(windows)]
      {
        let p = std::path::Path::new(path);
        let child = if p.is_dir() {
          Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?
        } else {
          use std::os::windows::process::CommandExt;
          Command::new("cmd")
            .args(&["/C", "start", "", path])
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|e| e.to_string())?
        };
        Ok(json!({ "opened": true, "path": path, "pid": child.id() }))
      }
      #[cfg(not(windows))]
      {
        let child = Command::new("xdg-open")
          .arg(path)
          .spawn()
          .map_err(|e| e.to_string())?;
        Ok(json!({ "opened": true, "path": path, "pid": child.id() }))
      }
    }
    "ping" => {
      let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
      Ok(json!({ "pong": true, "timestamp_ms": now }))
    }
    "minimize" => {
      main_window(app)?.minimize().map_err(|e| e.to_string())?;
      Ok(json!({ "minimized": true }))
    }
    "maximize" => {
      let w = main_window(app)?;
      let is_max = w.is_maximized().unwrap_or(false);
      if is_max {
        w.unmaximize().map_err(|e| e.to_string())?;
      } else {
        w.maximize().map_err(|e| e.to_string())?;
      }
      Ok(json!({ "maximized": !is_max }))
    }
    "fullscreen" => {
      let w = main_window(app)?;
      let is_fs = w.is_fullscreen().unwrap_or(false);
      w.set_fullscreen(!is_fs).map_err(|e| e.to_string())?;
      Ok(json!({ "fullscreen": !is_fs }))
    }
    "show" => {
      let w = main_window(app)?;
      let _ = w.unminimize();
      w.show().map_err(|e| e.to_string())?;
      let _ = w.set_focus();
      bring_to_foreground(&w);
      Ok(json!({ "visible": true }))
    }
    "hide" => {
      main_window(app)?.hide().map_err(|e| e.to_string())?;
      Ok(json!({ "visible": false }))
    }
    "toggle" => {
      let w = main_window(app)?;
      let visible = w.is_visible().unwrap_or(false);
      if visible {
        w.hide().map_err(|e| e.to_string())?;
      } else {
        let _ = w.unminimize();
        w.show().map_err(|e| e.to_string())?;
        let _ = w.set_focus();
        bring_to_foreground(&w);
      }
      Ok(json!({ "visible": !visible }))
    }
    "alert" => {
      let mode = str_arg(args, "mode")?;
      app.emit("lcars://alert", mode).map_err(|e| e.to_string())?;
      Ok(json!({ "mode": mode }))
    }
    "wallpaper" => {
      let path = str_arg(args, "path")?;
      app.emit("lcars://wallpaper", path).map_err(|e| e.to_string())?;
      Ok(json!({ "path": path }))
    }
    "notify" => {
      let title = str_arg(args, "title")?;
      let body = args.get("body").and_then(|v| v.as_str()).unwrap_or("");
      let payload = json!({ "title": title, "body": body });
      app.emit("lcars://notify", payload.clone())
        .map_err(|e| e.to_string())?;
      log::info!("notify {payload}");
      Ok(payload)
    }
    "reload" => {
      app.emit("lcars://reload", ()).map_err(|e| e.to_string())?;
      Ok(json!({ "reloading": true }))
    }
    "launch" => {
      let path = str_arg(args, "path")?;
      let list = str_list(args, "args");
      let detached = args
        .get("detached")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
      let mut cmd = Command::new(path);
      cmd.args(&list);
      if detached {
        cmd.stdin(std::process::Stdio::null())
          .stdout(std::process::Stdio::null())
          .stderr(std::process::Stdio::null());
      }
      let child = cmd.spawn().map_err(|e| e.to_string())?;
      Ok(json!({ "pid": child.id() }))
    }
    "auto-start" => {
      let enable = args
        .get("enable")
        .and_then(|v| v.as_bool())
        .ok_or("missing 'enable' argument")?;
      if enable {
        reg(&[
          "add",
          RUN_KEY,
          "/v",
          RUN_VALUE,
          "/t",
          "REG_SZ",
          "/d",
          &exe_path()?,
          "/f",
        ])?;
      } else {
        reg(&["delete", RUN_KEY, "/v", RUN_VALUE, "/f"])?;
      }
      Ok(json!({ "enable": enable }))
    }
    "shell" => {
      let set = str_arg(args, "set")?;
      match set {
        "lcars" => {
          reg(&[
            "add",
            WINLOGON_KEY,
            "/v",
            "Shell",
            "/t",
            "REG_SZ",
            "/d",
            &exe_path()?,
            "/f",
          ])?;
        }
        "explorer" => {
          reg(&[
            "add",
            WINLOGON_KEY,
            "/v",
            "Shell",
            "/t",
            "REG_SZ",
            "/d",
            "explorer.exe",
            "/f",
          ])?;
        }
        _ => return Err(format!("unknown shell target '{set}'")),
      }
      Ok(json!({ "set": set }))
    }
    "shutdown" => {
      app.exit(0);
      Ok(json!({ "exiting": true }))
    }
    "screenshot" => {
      let path = str_arg(args, "path")?;
      let w = main_window(app)?;
      let hwnd = w.hwnd().map_err(|e| e.to_string())?.0;
      capture_window(hwnd, path)?;
      Ok(json!({ "path": path }))
    }
    _ => Err(format!("unknown command '{cmd}'")),
  }
}

#[cfg(windows)]
fn capture_window(hwnd: *mut core::ffi::c_void, path: &str) -> Result<(), String> {
  use std::io::BufWriter;

  use windows_sys::Win32::Foundation::RECT;
  use windows_sys::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits,
    GetWindowDC, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    RGBQUAD, SRCCOPY,
  };
  use windows_sys::Win32::Storage::Xps::PrintWindow;
  use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect;

  unsafe {
    let mut rect = RECT {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    };
    if GetWindowRect(hwnd, &mut rect) == 0 {
      return Err("GetWindowRect failed".to_string());
    }
    let width = rect.right - rect.left;
    let height = rect.bottom - rect.top;
    if width <= 0 || height <= 0 {
      return Err("window rect is empty (is the window shown?)".to_string());
    }

    let hdc = GetWindowDC(hwnd);
    let mem = CreateCompatibleDC(hdc);
    let bmp = CreateCompatibleBitmap(hdc, width, height);
    let old = SelectObject(mem, bmp);
    // PW_RENDERFULLCONTENT captures DWM/WebView2 content even when occluded.
    if PrintWindow(hwnd, mem, 2) == 0 {
      BitBlt(mem, 0, 0, width, height, hdc, 0, 0, SRCCOPY);
    }

    let mut bi = BITMAPINFO {
      bmiHeader: BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: width,
        biHeight: -height,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB,
        biSizeImage: 0,
        biXPelsPerMeter: 0,
        biYPelsPerMeter: 0,
        biClrUsed: 0,
        biClrImportant: 0,
      },
      bmiColors: [RGBQUAD {
        rgbBlue: 0,
        rgbGreen: 0,
        rgbRed: 0,
        rgbReserved: 0,
      }],
    };
    let mut buf = vec![0u8; width as usize * height as usize * 4];
    let got = GetDIBits(
      hdc,
      bmp,
      0,
      height as u32,
      buf.as_mut_ptr().cast(),
      &mut bi,
      DIB_RGB_COLORS,
    );

    SelectObject(mem, old);
    DeleteObject(bmp);
    DeleteDC(mem);
    ReleaseDC(hwnd, hdc);

    if got == 0 {
      return Err("GetDIBits failed".to_string());
    }

    for px in buf.chunks_exact_mut(4) {
      px.swap(0, 2);
    }

    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut encoder = png::Encoder::new(BufWriter::new(file), width as u32, height as u32);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&buf).map_err(|e| e.to_string())?;
    Ok(())
  }
}

#[cfg(not(windows))]
fn capture_window(_hwnd: isize, _path: &str) -> Result<(), String> {
  Err("screenshots are only implemented on Windows".to_string())
}

pub fn bring_to_foreground(w: &tauri::WebviewWindow) {
  #[cfg(windows)]
  {
    if let Ok(hwnd) = w.hwnd() {
      use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, SetForegroundWindow, SetWindowPos, ShowWindow,
        HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_RESTORE, SW_SHOW,
      };
      let hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;
      unsafe {
        ShowWindow(hwnd, SW_RESTORE);
        ShowWindow(hwnd, SW_SHOW);
        BringWindowToTop(hwnd);
        SetForegroundWindow(hwnd);
        SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
        SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
      }
    }
  }
  #[cfg(not(windows))]
  {
    let _ = w.set_focus();
  }
}