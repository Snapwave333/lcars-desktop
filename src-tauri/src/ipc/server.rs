use std::io::{BufRead, BufReader, Write};

use named_pipe::PipeOptions;
use tauri::AppHandle;

use super::handlers::dispatch;
use super::protocol::{Request, Response, PIPE_NAME};

fn handle_client(app: &AppHandle, server: &mut named_pipe::PipeServer) -> Result<(), String> {
  let mut reader = BufReader::new(server);
  let mut line = String::new();
  loop {
    line.clear();
    let n = reader.read_line(&mut line).map_err(|e| e.to_string())?;
    if n == 0 {
      return Ok(());
    }
    let response = match serde_json::from_str::<Request>(line.trim()) {
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
      Err(e) => Response::err(uuid::Uuid::new_v4().to_string(), e.to_string()),
    };
    let payload = serde_json::to_string(&response).map_err(|e| e.to_string())?;
    let out = reader.get_mut();
    out.write_all(payload.as_bytes())
      .map_err(|e| e.to_string())?;
    out.write_all(b"\n").map_err(|e| e.to_string())?;
    out.flush().map_err(|e| e.to_string())?;
  }
}

pub fn run(app: AppHandle) -> Result<(), String> {
  let connecting = PipeOptions::new(PIPE_NAME)
    .single()
    .map_err(|e| e.to_string())?;
  log::info!("ipc server listening on {PIPE_NAME}");
  let mut next = connecting;
  loop {
    let mut server = next.wait().map_err(|e| e.to_string())?;
    log::debug!("ipc client connected");
    if let Err(e) = handle_client(&app, &mut server) {
      log::warn!("ipc client error: {e}");
    }
    next = server.disconnect().map_err(|e| e.to_string())?;
  }
}
