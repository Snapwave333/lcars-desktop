pub mod commands;
pub mod handlers;
pub mod protocol;
#[cfg(windows)]
pub mod server;

pub use protocol::{Request, Response, PIPE_NAME};

pub fn serve_forever(app: tauri::AppHandle) {
  #[cfg(windows)]
  if let Err(e) = server::run(app) {
    log::error!("ipc server stopped: {e}");
  }
  #[cfg(not(windows))]
  {
    let _ = app;
    log::warn!("named-pipe ipc server is only available on Windows");
  }
}
