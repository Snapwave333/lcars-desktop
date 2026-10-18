use serde_json::{json, Value};
use tauri::AppHandle;

use super::{handlers, registry};

#[tauri::command(async)]
pub fn run_command(app: AppHandle, cmd: String, args: Option<Value>) -> Result<Value, String> {
  handlers::dispatch(&app, &cmd, &args.unwrap_or_else(|| json!({})))
}

#[tauri::command(async)]
pub fn run_batch(app: AppHandle, steps: Value, keep_going: Option<bool>) -> Result<Value, String> {
  handlers::dispatch(
    &app,
    "batch",
    &json!({ "steps": steps, "continue": keep_going.unwrap_or(false) }),
  )
}

#[tauri::command]
pub fn list_commands() -> Value {
  registry::catalog()
}
