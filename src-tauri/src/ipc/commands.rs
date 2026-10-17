use serde_json::{json, Value};
use tauri::AppHandle;

use super::handlers;

async fn run(app: AppHandle, cmd: &'static str, args: Value) -> Result<Value, String> {
  tauri::async_runtime::spawn_blocking(move || handlers::dispatch(&app, cmd, &args))
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn alert(app: AppHandle, mode: String) -> Result<Value, String> {
  run(app, "alert", json!({ "mode": mode })).await
}

#[tauri::command]
pub async fn get_system_info(app: AppHandle) -> Result<Value, String> {
  run(app, "info", json!({})).await
}

#[tauri::command]
pub async fn launch_app(app: AppHandle, path: String, args: Option<Vec<String>>, cwd: Option<String>) -> Result<Value, String> {
  run(app, "launch", json!({ "path": path, "args": args.unwrap_or_default(), "cwd": cwd })).await
}

#[tauri::command]
pub async fn screenshot(app: AppHandle, path: String) -> Result<Value, String> {
  run(app, "screenshot", json!({ "path": path })).await
}

#[tauri::command]
pub async fn send_notification(app: AppHandle, title: String, body: Option<String>) -> Result<Value, String> {
  run(app, "notify", json!({ "title": title, "body": body.unwrap_or_default() })).await
}

#[tauri::command]
pub async fn window_action(app: AppHandle, action: String) -> Result<Value, String> {
  let cmd = match action.as_str() {
    "toggle" => "toggle",
    "minimize" => "minimize",
    "maximize" => "maximize",
    "fullscreen" => "fullscreen",
    "close" => "shutdown",
    other => return Err(format!("unknown window action '{other}'")),
  };
  run(app, cmd, json!({})).await
}

#[tauri::command]
pub async fn list_directory(app: AppHandle, path: Option<String>) -> Result<Value, String> {
  run(app, "list-dir", json!({ "path": path })).await
}

#[tauri::command]
pub async fn open_item(app: AppHandle, path: String) -> Result<Value, String> {
  run(app, "open", json!({ "path": path })).await
}

#[tauri::command]
pub async fn reveal_item(app: AppHandle, path: String) -> Result<Value, String> {
  run(app, "reveal", json!({ "path": path })).await
}

#[tauri::command]
pub async fn get_quick_locations(app: AppHandle) -> Result<Value, String> {
  run(app, "quick-locations", json!({})).await
}

#[tauri::command]
pub async fn get_shell_status(app: AppHandle) -> Result<Value, String> {
  run(app, "shell-status", json!({})).await
}

#[tauri::command]
pub async fn set_auto_start(app: AppHandle, enable: bool) -> Result<Value, String> {
  run(app, "auto-start", json!({ "enable": enable })).await
}

#[tauri::command]
pub async fn set_windows_shell(app: AppHandle, target: String) -> Result<Value, String> {
  run(app, "shell", json!({ "set": target })).await
}

#[tauri::command]
pub async fn get_installed_apps(app: AppHandle, rescan: Option<bool>) -> Result<Value, String> {
  run(app, "installed-apps", json!({ "rescan": rescan.unwrap_or(false) })).await
}
