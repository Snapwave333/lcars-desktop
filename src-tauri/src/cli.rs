#[cfg(windows)]
use std::io::{BufRead, BufReader, Write};
#[cfg(windows)]
use std::time::Duration;

#[cfg(windows)]
use named_pipe::PipeClient;
#[cfg(windows)]
use serde_json::json;
use serde_json::{Map, Value};

use lcars_shell_lib::ipc::handlers::COMMANDS;
#[cfg(windows)]
use lcars_shell_lib::ipc::protocol::{Request, Response};
use lcars_shell_lib::ipc::protocol::PIPE_NAME;

const EXIT_OK: i32 = 0;
const EXIT_CMD_FAILED: i32 = 1;
const EXIT_NO_DAEMON: i32 = 2;

#[cfg(windows)]
fn ensure_console() {
  use windows_sys::Win32::Foundation::{GENERIC_READ, GENERIC_WRITE, INVALID_HANDLE_VALUE};
  use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
  };
  use windows_sys::Win32::System::Console::{
    AttachConsole, GetStdHandle, SetStdHandle, ATTACH_PARENT_PROCESS, STD_ERROR_HANDLE,
    STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
  };

  unsafe fn reopen_std(name: &str, std_handle: u32, access: u32) {
    let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
    let handle = CreateFileW(
      wide.as_ptr(),
      access,
      FILE_SHARE_READ | FILE_SHARE_WRITE,
      std::ptr::null(),
      OPEN_EXISTING,
      0,
      std::ptr::null_mut(),
    );
    if handle != INVALID_HANDLE_VALUE {
      SetStdHandle(std_handle, handle);
    }
  }

  unsafe {
    let out = GetStdHandle(STD_OUTPUT_HANDLE);
    if !out.is_null() && out != INVALID_HANDLE_VALUE {
      return;
    }
    if AttachConsole(ATTACH_PARENT_PROCESS) == 0 {
      return;
    }
    reopen_std("CONOUT$", STD_OUTPUT_HANDLE, GENERIC_WRITE);
    reopen_std("CONOUT$", STD_ERROR_HANDLE, GENERIC_WRITE);
    reopen_std("CONIN$", STD_INPUT_HANDLE, GENERIC_READ);
  }
}

#[cfg(not(windows))]
fn ensure_console() {}

fn parse_args(tokens: &[String]) -> (String, Map<String, Value>) {
  let cmd = tokens
    .first()
    .cloned()
    .unwrap_or_else(|| "status".to_string());
  let mut args: Map<String, Value> = Map::new();
  let rest = tokens.iter().skip(1).collect::<Vec<_>>();
  let mut i = 0;
  while i < rest.len() {
    let token = rest[i].as_str();
    let Some(key) = token.strip_prefix("--") else {
      i += 1;
      continue;
    };
    if let Some((key, value)) = key.split_once('=') {
      args.insert(key.to_string(), Value::String(value.to_string()));
      i += 1;
      continue;
    }
    match rest.get(i + 1) {
      Some(value) if !value.starts_with("--") => {
        args.insert(key.to_string(), Value::String((*value).clone()));
        i += 2;
      }
      _ => {
        args.insert(key.to_string(), Value::Bool(true));
        i += 1;
      }
    }
  }
  (cmd, args)
}

#[cfg(windows)]
fn connect() -> Result<PipeClient, i32> {
  PipeClient::connect(PIPE_NAME).map_err(|e| {
    eprintln!("cannot reach LCARS daemon on {}: {e}", PIPE_NAME);
    EXIT_NO_DAEMON
  })
}

#[cfg(windows)]
fn read_line(client: &mut PipeClient) -> Result<String, String> {
  let mut line = String::new();
  let mut reader = BufReader::new(client);
  let n = reader.read_line(&mut line).map_err(|e| e.to_string())?;
  if n == 0 {
    return Err("daemon closed connection".to_string());
  }
  Ok(line)
}

pub fn wants(tokens: &[String]) -> bool {
  tokens
    .first()
    .map(|t| !t.starts_with("--") || tokens.iter().any(|a| a == "--cli"))
    .unwrap_or(false)
}

pub fn run(tokens: &[String]) -> i32 {
  ensure_console();
  let tokens: Vec<String> = tokens
    .iter()
    .filter(|t| *t != "--cli")
    .cloned()
    .collect();
  if tokens.is_empty() {
    eprintln!("usage: lcars-shell <command> [--key value ...]");
    eprintln!("commands: {}", COMMANDS.join(" "));
    return EXIT_CMD_FAILED;
  }

  if matches!(tokens[0].as_str(), "help" | "-h" | "--help") {
    println!("usage: lcars-shell <command> [--key value ...]");
    println!("commands: {}", COMMANDS.join(" "));
    return EXIT_OK;
  }

  let (cmd, args) = parse_args(&tokens);
  send(cmd, Value::Object(args))
}

#[cfg(not(windows))]
fn send(_cmd: String, _args: Value) -> i32 {
  eprintln!("the LCARS CLI talks to the daemon over {PIPE_NAME}, which is only available on Windows");
  EXIT_NO_DAEMON
}

#[cfg(windows)]
fn send(cmd: String, args: Value) -> i32 {
  let request = Request {
    id: uuid::Uuid::new_v4().to_string(),
    cmd: cmd.clone(),
    args,
  };

  let mut client = match connect() {
    Ok(c) => c,
    Err(code) => return code,
  };
  client.set_write_timeout(Some(Duration::from_secs(5)));
  client.set_read_timeout(Some(Duration::from_secs(30)));

  let payload = match serde_json::to_string(&request) {
    Ok(p) => p,
    Err(e) => {
      eprintln!("cannot encode request: {e}");
      return EXIT_CMD_FAILED;
    }
  };
  if let Err(e) = client.write_all(payload.as_bytes()) {
    eprintln!("cannot write request: {e}");
    return EXIT_NO_DAEMON;
  }
  if let Err(e) = client.write_all(b"\n") {
    eprintln!("cannot write request: {e}");
    return EXIT_NO_DAEMON;
  }
  if let Err(e) = client.flush() {
    eprintln!("cannot flush request: {e}");
    return EXIT_NO_DAEMON;
  }

  let line = match read_line(&mut client) {
    Ok(l) => l,
    Err(e) => {
      eprintln!("cannot read response: {e}");
      return EXIT_NO_DAEMON;
    }
  };
  let response: Response = match serde_json::from_str(line.trim()) {
    Ok(r) => r,
    Err(e) => {
      eprintln!("cannot decode response ({e}): {line}");
      return EXIT_NO_DAEMON;
    }
  };

  let out = json!({
    "id": response.id,
    "cmd": cmd,
    "ok": response.ok,
    "data": response.data,
    "error": response.error,
  });
  println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());

  if response.ok {
    EXIT_OK
  } else {
    EXIT_CMD_FAILED
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_wants_cli() {
    assert!(wants(&["status".to_string()]));
    assert!(wants(&["alert".to_string(), "--mode".to_string(), "red".to_string()]));
    assert!(wants(&["--cli".to_string(), "--verbose".to_string()]));
    assert!(!wants(&["--verbose".to_string()]));
    assert!(!wants(&[]));
  }

  #[test]
  fn test_parse_args_with_flags_and_values() {
    let tokens = vec![
      "alert".to_string(),
      "--mode".to_string(),
      "red".to_string(),
      "--active".to_string(),
      "--channel=tactical".to_string(),
    ];
    let (cmd, args) = parse_args(&tokens);
    assert_eq!(cmd, "alert");
    assert_eq!(args.get("mode").and_then(|v| v.as_str()), Some("red"));
    assert_eq!(args.get("active").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(args.get("channel").and_then(|v| v.as_str()), Some("tactical"));
  }

  #[test]
  fn test_parse_args_default_status() {
    let tokens: Vec<String> = vec![];
    let (cmd, args) = parse_args(&tokens);
    assert_eq!(cmd, "status");
    assert!(args.is_empty());
  }
}

