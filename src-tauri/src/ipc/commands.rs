use serde_json::json;
use tauri::AppHandle;

use super::handlers;

#[tauri::command]
pub fn alert(app: AppHandle, mode: String) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "alert", &json!({ "mode": mode }))
}

#[tauri::command]
pub fn get_system_info(app: AppHandle) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "info", &json!({}))
}

#[tauri::command]
pub fn launch_app(
  app: AppHandle,
  path: String,
  args: Option<Vec<String>>,
  detached: Option<bool>,
) -> Result<serde_json::Value, String> {
  handlers::dispatch(
    &app,
    "launch",
    &json!({
      "path": path,
      "args": args.unwrap_or_default(),
      "detached": detached.unwrap_or(true),
    }),
  )
}

#[tauri::command]
pub fn screenshot(app: AppHandle, path: String) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "screenshot", &json!({ "path": path }))
}

#[tauri::command]
pub fn send_notification(
  app: AppHandle,
  title: String,
  body: Option<String>,
) -> Result<serde_json::Value, String> {
  handlers::dispatch(
    &app,
    "notify",
    &json!({
      "title": title,
      "body": body.unwrap_or_default(),
    }),
  )
}

#[tauri::command]
pub fn toggle_window(app: AppHandle) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "toggle", &json!({}))
}

#[tauri::command]
pub fn minimize_window(app: AppHandle) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "minimize", &json!({}))
}

#[tauri::command]
pub fn maximize_window(app: AppHandle) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "maximize", &json!({}))
}

#[tauri::command]
pub fn toggle_fullscreen(app: AppHandle) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "fullscreen", &json!({}))
}

#[tauri::command]
pub fn close_window(app: AppHandle) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "shutdown", &json!({}))
}

#[tauri::command]
pub fn get_desktop_items(app: AppHandle) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "desktop-items", &json!({}))
}

#[tauri::command]
pub fn open_item(app: AppHandle, path: String) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "open", &json!({ "path": path }))
}

#[tauri::command]
pub fn list_directory(app: AppHandle, path: Option<String>) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "list-dir", &json!({ "path": path }))
}

#[tauri::command]
pub fn reveal_item(app: AppHandle, path: String) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "reveal", &json!({ "path": path }))
}

#[tauri::command]
pub fn get_quick_locations(app: AppHandle) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "quick-locations", &json!({}))
}

#[tauri::command]
pub fn get_shell_status(app: AppHandle) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "shell-status", &json!({}))
}

#[tauri::command]
pub fn set_auto_start(app: AppHandle, enable: bool) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "auto-start", &json!({ "enable": enable }))
}

#[tauri::command]
pub fn set_windows_shell(app: AppHandle, target: String) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "shell", &json!({ "set": target }))
}

#[tauri::command]
pub fn get_installed_apps(app: AppHandle) -> Result<serde_json::Value, String> {
  handlers::dispatch(&app, "installed-apps", &json!({}))
}



