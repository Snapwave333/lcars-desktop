use std::io::{BufRead, BufReader, Write};

use tauri::AppHandle;

use super::handlers::dispatch;
use super::protocol::{Request, Response};

pub fn respond(app: &AppHandle, line: &str) -> Response {
  match serde_json::from_str::<Request>(line.trim()) {
    Ok(req) => {
      log::info!("ipc request '{}' (id {})", req.cmd, req.id);
      match dispatch(app, &req.cmd, &req.args) {
        Ok(data) => Response::ok(req.id, data),
        Err(error) => {
          log::warn!("ipc request '{}' failed: {error}", req.cmd);
          Response::err(req.id, error)
        }
      }
    }
    Err(e) => Response::err(uuid::Uuid::new_v4().to_string(), format!("bad request: {e}")),
  }
}

pub fn serve_stream<S: std::io::Read + Write>(app: &AppHandle, stream: S) -> Result<(), String> {
  let mut reader = BufReader::new(stream);
  let mut line = String::new();
  loop {
    line.clear();
    let n = reader.read_line(&mut line).map_err(|e| e.to_string())?;
    if n == 0 {
      return Ok(());
    }
    if line.trim().is_empty() {
      continue;
    }
    let response = respond(app, &line);
    let mut payload = serde_json::to_string(&response).map_err(|e| e.to_string())?;
    payload.push('\n');
    let out = reader.get_mut();
    out.write_all(payload.as_bytes()).map_err(|e| e.to_string())?;
    out.flush().map_err(|e| e.to_string())?;
  }
}

#[cfg(windows)]
pub fn run(app: AppHandle) -> Result<(), String> {
  use named_pipe::PipeOptions;

  use super::protocol::PIPE_NAME;

  let mut next = PipeOptions::new(PIPE_NAME).single().map_err(|e| e.to_string())?;
  log::info!("ipc server listening on {PIPE_NAME}");
  loop {
    let server = next.wait().map_err(|e| e.to_string())?;
    next = PipeOptions::new(PIPE_NAME)
      .first(false)
      .single()
      .map_err(|e| e.to_string())?;
    let app = app.clone();
    std::thread::spawn(move || {
      log::debug!("ipc client connected");
      let mut server = server;
      if let Err(e) = serve_stream(&app, &mut server) {
        log::warn!("ipc client error: {e}");
      }
      let _ = server.disconnect();
    });
  }
}

#[cfg(not(windows))]
pub fn run(_app: AppHandle) -> Result<(), String> {
  log::info!("named-pipe ipc is only available on Windows; CLI control disabled");
  Ok(())
}
