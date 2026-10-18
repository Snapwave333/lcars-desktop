pub mod commands;
pub mod handlers;
pub mod protocol;
pub mod registry;
pub mod server;

pub use protocol::{PIPE_NAME, Request, Response};

pub fn serve_forever(app: tauri::AppHandle) {
  if let Err(e) = server::run(app) {
    log::error!("ipc server stopped: {e}");
  }
}
