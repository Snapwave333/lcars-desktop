use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::platform::{apps, fs, shell, telemetry, window};

fn main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
  app.get_webview_window("main").ok_or_else(|| "no main window".to_string())
}

fn str_arg<'a>(args: &'a Value, key: &str) -> Result<&'a str, String> {
  args
    .get(key)
    .and_then(Value::as_str)
    .filter(|s| !s.trim().is_empty())
    .ok_or_else(|| format!("missing '{key}' argument"))
}

fn bool_arg(args: &Value, key: &str) -> Option<bool> {
  match args.get(key)? {
    Value::Bool(b) => Some(*b),
    Value::String(s) => match s.to_ascii_lowercase().as_str() {
      "true" | "on" | "yes" | "1" => Some(true),
      "false" | "off" | "no" | "0" => Some(false),
      _ => None,
    },
    _ => None,
  }
}

fn str_list(args: &Value, key: &str) -> Vec<String> {
  match args.get(key) {
    Some(Value::Array(a)) => a.iter().filter_map(|v| v.as_str().map(String::from)).collect(),
    Some(Value::String(s)) => s.split_whitespace().map(String::from).collect(),
    _ => Vec::new(),
  }
}

fn to_value<T: Serialize>(v: T) -> Result<Value, String> {
  serde_json::to_value(v).map_err(|e| e.to_string())
}

pub fn normalize_alert(mode: &str) -> Result<&'static str, String> {
  match mode.to_ascii_lowercase().as_str() {
    "red" => Ok("red"),
    "yellow" => Ok("yellow"),
    "blue" => Ok("blue"),
    "none" | "normal" | "green" | "off" | "clear" => Ok("none"),
    other => Err(format!("unknown alert mode '{other}' (use red, yellow, blue or normal)")),
  }
}

fn show(w: &tauri::WebviewWindow) -> Result<(), String> {
  let _ = w.unminimize();
  w.show().map_err(|e| e.to_string())?;
  let _ = w.set_focus();
  window::bring_to_foreground(w);
  Ok(())
}

pub const COMMANDS: &[&str] = &[
  "status", "ping", "info", "desktop", "list-dir", "installed-apps", "quick-locations", "shell-status", "open",
  "reveal", "launch", "show", "hide", "toggle", "minimize", "maximize", "fullscreen", "alert", "notify",
  "wallpaper", "reload", "auto-start", "shell", "screenshot", "shutdown",
];

pub fn dispatch(app: &AppHandle, cmd: &str, args: &Value) -> Result<Value, String> {
  match cmd {
    "status" => {
      let visible = main_window(app).ok().and_then(|w| w.is_visible().ok()).unwrap_or(false);
      Ok(json!({ "running": true, "window_visible": visible, "version": env!("CARGO_PKG_VERSION") }))
    }
    "ping" => {
      let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
      Ok(json!({ "pong": true, "timestamp_ms": now }))
    }
    "info" | "system-info" => to_value(telemetry::snapshot()),
    "desktop" | "desktop-items" => to_value(fs::list_desktop()?),
    "list-dir" | "list_dir" | "ls" => to_value(fs::list_directory(args.get("path").and_then(Value::as_str))?),
    "installed-apps" | "installed_apps" | "apps" => {
      to_value(apps::installed(bool_arg(args, "rescan").unwrap_or(false)))
    }
    "quick-locations" | "quick_locations" => to_value(fs::quick_locations()),
    "shell-status" | "shell_status" => to_value(shell::status()),
    "open" => {
      let path = str_arg(args, "path")?;
      let pid = shell::open(path)?;
      Ok(json!({ "opened": true, "path": path, "pid": pid }))
    }
    "reveal" => {
      let path = str_arg(args, "path")?;
      shell::reveal(path)?;
      Ok(json!({ "revealed": true, "path": path }))
    }
    "launch" => {
      let path = str_arg(args, "path")?;
      let pid = shell::launch(path, &str_list(args, "args"), args.get("cwd").and_then(Value::as_str))?;
      Ok(json!({ "launched": true, "path": path, "pid": pid }))
    }
    "show" => {
      show(&main_window(app)?)?;
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
        show(&w)?;
      }
      Ok(json!({ "visible": !visible }))
    }
    "minimize" => {
      main_window(app)?.minimize().map_err(|e| e.to_string())?;
      Ok(json!({ "minimized": true }))
    }
    "maximize" => {
      let w = main_window(app)?;
      let maximized = w.is_maximized().unwrap_or(false);
      if maximized { w.unmaximize() } else { w.maximize() }.map_err(|e| e.to_string())?;
      Ok(json!({ "maximized": !maximized }))
    }
    "fullscreen" => {
      let w = main_window(app)?;
      let fs_on = w.is_fullscreen().unwrap_or(false);
      w.set_fullscreen(!fs_on).map_err(|e| e.to_string())?;
      Ok(json!({ "fullscreen": !fs_on }))
    }
    "alert" => {
      let mode = normalize_alert(str_arg(args, "mode")?)?;
      app.emit("lcars://alert", mode).map_err(|e| e.to_string())?;
      Ok(json!({ "mode": mode }))
    }
    "notify" => {
      let payload = json!({
        "title": str_arg(args, "title")?,
        "body": args.get("body").and_then(Value::as_str).unwrap_or(""),
      });
      app.emit("lcars://notify", &payload).map_err(|e| e.to_string())?;
      log::info!("notify {payload}");
      Ok(payload)
    }
    "wallpaper" => {
      let path = match args.get("path").and_then(Value::as_str) {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => telemetry::wallpaper(true),
      };
      app.emit("lcars://wallpaper", &path).map_err(|e| e.to_string())?;
      Ok(json!({ "path": path }))
    }
    "reload" => {
      app.emit("lcars://reload", ()).map_err(|e| e.to_string())?;
      Ok(json!({ "reloading": true }))
    }
    "auto-start" | "autostart" => {
      let enable = bool_arg(args, "enable").ok_or("missing 'enable' argument (true/false)")?;
      shell::set_autostart(enable)?;
      Ok(json!({ "enable": enable, "status": shell::status() }))
    }
    "shell" => {
      let target = str_arg(args, "set")?;
      match target {
        "lcars" => shell::set_shell(true)?,
        "explorer" => shell::set_shell(false)?,
        _ => return Err(format!("unknown shell target '{target}' (use lcars or explorer)")),
      }
      Ok(json!({ "set": target, "status": shell::status() }))
    }
    "screenshot" => {
      let path = str_arg(args, "path")?;
      window::capture(&main_window(app)?, path)?;
      Ok(json!({ "path": path }))
    }
    "shutdown" | "exit" => {
      app.exit(0);
      Ok(json!({ "exiting": true }))
    }
    _ => Err(format!("unknown command '{cmd}' (available: {})", COMMANDS.join(", "))),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn normalizes_alert_aliases() {
    assert_eq!(normalize_alert("RED").unwrap(), "red");
    assert_eq!(normalize_alert("normal").unwrap(), "none");
    assert_eq!(normalize_alert("green").unwrap(), "none");
    assert!(normalize_alert("purple").is_err());
  }

  #[test]
  fn parses_loose_arguments() {
    let args = json!({ "enable": "on", "args": "-a -b", "list": ["x", 1, "y"], "path": "  " });
    assert_eq!(bool_arg(&args, "enable"), Some(true));
    assert_eq!(str_list(&args, "args"), vec!["-a", "-b"]);
    assert_eq!(str_list(&args, "list"), vec!["x", "y"]);
    assert!(str_arg(&args, "path").is_err());
  }
}
