use std::io::IsTerminal;

use serde_json::{json, Map, Value};

use lcars_shell_lib::ipc::protocol::{Request, Response};
use lcars_shell_lib::ipc::registry::{self, ArgKind, CommandSpec, REGISTRY};

const EXIT_OK: i32 = 0;
const EXIT_CMD_FAILED: i32 = 1;
const EXIT_NO_DAEMON: i32 = 2;
const SEPARATORS: [&str; 4] = ["then", "+", ";", "&&"];
const LOCAL_FLAGS: [&str; 4] = ["--cli", "--json", "--continue", "--human"];

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
#[derive(Debug, Clone, PartialEq)]
pub struct Step {
  pub cmd: String,
  pub args: Map<String, Value>,
}

fn coerce(spec: Option<&CommandSpec>, key: &str, raw: &str) -> Value {
  let kind = spec.and_then(|s| s.args.iter().find(|a| a.name == key)).map(|a| a.kind);
  match kind {
    Some(ArgKind::Number) => raw.parse::<f64>().map(|n| json!(n)).unwrap_or_else(|_| json!(raw)),
    Some(ArgKind::Bool) => match raw.to_ascii_lowercase().as_str() {
      "true" | "1" | "yes" | "on" => json!(true),
      "false" | "0" | "no" | "off" => json!(false),
      _ => json!(raw),
    },
    Some(ArgKind::List) => json!(raw.split_whitespace().collect::<Vec<_>>()),
    _ => json!(raw),
  }
}

fn parse_args(tokens: &[String]) -> (String, Map<String, Value>) {
  let cmd = tokens.first().cloned().unwrap_or_else(|| "status".to_string());
  let spec = registry::resolve(&cmd);
  let mut args: Map<String, Value> = Map::new();
  let mut positional: Vec<String> = Vec::new();
  let rest: Vec<&String> = tokens.iter().skip(1).collect();
  let mut i = 0;
  while i < rest.len() {
    let token = rest[i].as_str();
    let Some(key) = token.strip_prefix("--") else {
      positional.push(token.to_string());
      i += 1;
      continue;
    };
    if let Some((key, value)) = key.split_once('=') {
      args.insert(key.to_string(), coerce(spec, key, value));
      i += 1;
      continue;
    }
    match rest.get(i + 1) {
      Some(value) if !value.starts_with("--") => {
        args.insert(key.to_string(), coerce(spec, key, value));
        i += 2;
      }
      _ => {
        args.insert(key.to_string(), Value::Bool(true));
        i += 1;
      }
    }
  }
  if let Some(spec) = spec {
    let free: Vec<_> = spec.args.iter().filter(|a| !args.contains_key(a.name)).collect();
    let mut queue = positional.into_iter().peekable();
    for (idx, a) in free.iter().enumerate() {
      if queue.peek().is_none() {
        break;
      }
      let absorb = a.kind == ArgKind::List || idx + 1 == free.len();
      let values: Vec<String> = if absorb { queue.by_ref().collect() } else { queue.next().into_iter().collect() };
      let value = if a.kind == ArgKind::List { json!(values) } else { coerce(Some(spec), a.name, &values.join(" ")) };
      args.insert(a.name.to_string(), value);
    }
    let leftovers: Vec<String> = queue.collect();
    if !leftovers.is_empty() {
      args.insert("_".to_string(), json!(leftovers));
    }
  }
  (cmd, args)
}

pub fn split_chain(tokens: &[String]) -> Vec<Vec<String>> {
  let mut groups: Vec<Vec<String>> = vec![Vec::new()];
  for token in tokens {
    if SEPARATORS.contains(&token.as_str()) {
      groups.push(Vec::new());
      continue;
    }
    if let Some(stripped) = token.strip_suffix(';').filter(|s| !s.is_empty()) {
      groups.last_mut().unwrap().push(stripped.to_string());
      groups.push(Vec::new());
      continue;
    }
    groups.last_mut().unwrap().push(token.clone());
  }
  groups.into_iter().filter(|g| !g.is_empty()).collect()
}

pub fn plan(tokens: &[String]) -> Result<Vec<Step>, String> {
  let groups = split_chain(tokens);
  if groups.is_empty() {
    return Err("no command given".to_string());
  }
  groups
    .iter()
    .map(|g| {
      let (cmd, args) = parse_args(g);
      let spec = registry::resolve(&cmd).ok_or_else(|| registry::unknown(&cmd))?;
      registry::validate(spec, &Value::Object(args.clone()))?;
      Ok(Step { cmd: spec.name.to_string(), args })
    })
    .collect()
}

fn print_help(topic: Option<&str>) {
  if let Some(spec) = topic.and_then(registry::resolve) {
    println!("{}  {}", spec.name, spec.summary);
    if !spec.aliases.is_empty() {
      println!("  aliases: {}", spec.aliases.join(", "));
    }
    for a in spec.args {
      let req = if a.required { "required" } else { "optional" };
      println!("  --{:<10} {:<8} {}  ({req})", a.name, format!("{:?}", a.kind).to_lowercase(), a.help);
    }
    return;
  }
  println!("usage: lcars-shell <command> [value] [--key value ...] [then <command> ...]");
  println!("       lcars-shell help <command>\n");
  let mut plugin = "";
  for c in REGISTRY {
    if c.plugin != plugin {
      plugin = c.plugin;
      println!("{plugin}");
    }
    println!("  {:<16}{}", c.name, c.summary);
  }
  println!("\nflags: --json  raw JSON output   --continue  keep going after a failed step");
  println!("chain: lcars-shell alert red then notify \"Shields up\" then wait 500 then alert none");
}

fn scalar(v: &Value) -> String {
  match v {
    Value::String(s) => s.clone(),
    Value::Null => "-".to_string(),
    other => other.to_string(),
  }
}

fn render(v: &Value, indent: usize) {
  let pad = " ".repeat(indent);
  match v {
    Value::Array(items) => {
      for item in items.iter().take(50) {
        match item {
          Value::Object(o) => {
            let label = ["name", "title", "cmd"].iter().find_map(|k| o.get(*k)).map(scalar).unwrap_or_default();
            let detail = ["path", "summary", "category"].iter().find_map(|k| o.get(*k)).map(scalar).unwrap_or_default();
            println!("{pad}• {label:<28} {detail}");
          }
          other => println!("{pad}• {}", scalar(other)),
        }
      }
      if items.len() > 50 {
        println!("{pad}… {} more", items.len() - 50);
      }
    }
    Value::Object(o) => {
      for (k, val) in o {
        match val {
          Value::Object(_) | Value::Array(_) => {
            println!("{pad}{k}:");
            render(val, indent + 2);
          }
          _ => println!("{pad}{k:<20} {}", scalar(val)),
        }
      }
    }
    other => println!("{pad}{}", scalar(other)),
  }
}

fn report(response: &Response, steps: &[Step], json_out: bool) {
  if json_out {
    let cmd = if steps.len() == 1 { steps[0].cmd.clone() } else { "batch".to_string() };
    let out = json!({ "id": response.id, "cmd": cmd, "ok": response.ok, "data": response.data, "error": response.error });
    println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
    return;
  }
  if !response.ok {
    eprintln!("✗ {}", response.error.clone().unwrap_or_else(|| "failed".to_string()));
    return;
  }
  let data = response.data.clone().unwrap_or(Value::Null);
  if steps.len() > 1 {
    for s in data["steps"].as_array().cloned().unwrap_or_default() {
      let mark = if s["ok"].as_bool().unwrap_or(false) { "✓" } else { "✗" };
      let tail = s["error"].as_str().map(|e| format!("  {e}")).unwrap_or_default();
      println!("{mark} {:<14} {:>5}ms{tail}", scalar(&s["cmd"]), scalar(&s["ms"]));
    }
    return;
  }
  println!("✓ {}", steps[0].cmd);
  if !data.is_null() {
    render(&data, 2);
  }
}

#[cfg(windows)]
fn exchange(request: &Request) -> Result<Response, (i32, String)> {
  use std::io::{BufRead, BufReader, Write};
  use std::time::Duration;

  use lcars_shell_lib::ipc::protocol::PIPE_NAME;
  use named_pipe::PipeClient;

  let mut client = PipeClient::connect_ms(PIPE_NAME, 3000).map_err(|e| {
    (EXIT_NO_DAEMON, format!("cannot reach LCARS daemon on {PIPE_NAME}: {e} (is lcars-shell running?)"))
  })?;
  client.set_write_timeout(Some(Duration::from_secs(5)));
  client.set_read_timeout(Some(Duration::from_secs(120)));
  let mut payload = serde_json::to_string(request).map_err(|e| (EXIT_CMD_FAILED, e.to_string()))?;
  payload.push('\n');
  client
    .write_all(payload.as_bytes())
    .and_then(|_| client.flush())
    .map_err(|e| (EXIT_NO_DAEMON, format!("cannot write request: {e}")))?;
  let mut line = String::new();
  let n = BufReader::new(&mut client)
    .read_line(&mut line)
    .map_err(|e| (EXIT_NO_DAEMON, format!("cannot read response: {e}")))?;
  if n == 0 {
    return Err((EXIT_NO_DAEMON, "daemon closed connection".to_string()));
  }
  serde_json::from_str(line.trim()).map_err(|e| (EXIT_NO_DAEMON, format!("cannot decode response ({e}): {line}")))
}

#[cfg(not(windows))]
fn exchange(_request: &Request) -> Result<Response, (i32, String)> {
  Err((EXIT_NO_DAEMON, "the LCARS daemon pipe is only available on Windows".to_string()))
}

pub fn wants(tokens: &[String]) -> bool {
  tokens
    .first()
    .map(|t| !t.starts_with("--") || tokens.iter().any(|a| a == "--cli" || a == "--help"))
    .unwrap_or(false)
}

pub fn run(tokens: &[String]) -> i32 {
  ensure_console();
  let json_flag = tokens.iter().any(|t| t == "--json");
  let human_flag = tokens.iter().any(|t| t == "--human");
  let keep_going = tokens.iter().any(|t| t == "--continue");
  let json_out = json_flag || (!human_flag && !std::io::stdout().is_terminal());
  let tokens: Vec<String> = tokens.iter().filter(|t| !LOCAL_FLAGS.contains(&t.as_str())).cloned().collect();

  let first = tokens.first().map(String::as_str).unwrap_or("");
  if tokens.is_empty() || matches!(first, "help" | "--help" | "-h" | "commands") {
    if json_out && !tokens.is_empty() {
      let data = match tokens.get(1).and_then(|t| registry::resolve(t)) {
        Some(spec) => json!(spec),
        None => registry::catalog(),
      };
      println!("{}", serde_json::to_string_pretty(&json!({ "cmd": "help", "ok": true, "data": data })).unwrap_or_default());
      return EXIT_OK;
    }
    print_help(tokens.get(1).map(String::as_str));
    return if tokens.is_empty() { EXIT_CMD_FAILED } else { EXIT_OK };
  }

  let steps = match plan(&tokens) {
    Ok(s) => s,
    Err(e) => {
      if json_out {
        println!("{}", serde_json::to_string_pretty(&json!({ "ok": false, "error": e })).unwrap_or_default());
      } else {
        eprintln!("✗ {e}");
      }
      return EXIT_CMD_FAILED;
    }
  };

  let request = if steps.len() == 1 {
    Request { id: uuid::Uuid::new_v4().to_string(), cmd: steps[0].cmd.clone(), args: Value::Object(steps[0].args.clone()) }
  } else {
    let list: Vec<Value> = steps.iter().map(|s| json!({ "cmd": s.cmd, "args": s.args })).collect();
    Request {
      id: uuid::Uuid::new_v4().to_string(),
      cmd: "batch".to_string(),
      args: json!({ "steps": list, "continue": keep_going }),
    }
  };

  match exchange(&request) {
    Ok(response) => {
      report(&response, &steps, json_out);
      if response.ok { EXIT_OK } else { EXIT_CMD_FAILED }
    }
    Err((code, message)) => {
      eprintln!("✗ {message}");
      code
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn t(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
  }

  #[test]
  fn test_wants_cli() {
    assert!(wants(&t(&["status"])));
    assert!(wants(&t(&["alert", "--mode", "red"])));
    assert!(wants(&t(&["--cli", "--verbose"])));
    assert!(wants(&t(&["--help"])));
    assert!(!wants(&t(&["--verbose"])));
    assert!(!wants(&[]));
  }

  #[test]
  fn test_parse_args_with_flags_and_values() {
    let (cmd, args) = parse_args(&t(&["alert", "--mode", "red", "--active", "--channel=tactical"]));
    assert_eq!(cmd, "alert");
    assert_eq!(args.get("mode").and_then(|v| v.as_str()), Some("red"));
    assert_eq!(args.get("active").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(args.get("channel").and_then(|v| v.as_str()), Some("tactical"));
  }

  #[test]
  fn test_parse_args_default_status() {
    let (cmd, args) = parse_args(&[]);
    assert_eq!(cmd, "status");
    assert!(args.is_empty());
  }

  #[test]
  fn positional_values_fill_declared_args() {
    let (_, args) = parse_args(&t(&["alert", "red"]));
    assert_eq!(args["mode"], "red");
    let (_, args) = parse_args(&t(&["notify", "Hello", "--body", "world"]));
    assert_eq!(args["title"], "Hello");
    let (_, args) = parse_args(&t(&["open", "C:\\Program", "Files"]));
    assert_eq!(args["path"], "C:\\Program Files");
    let (_, args) = parse_args(&t(&["wait", "250"]));
    assert_eq!(args["ms"], 250.0);
    let (_, args) = parse_args(&t(&["auto-start", "off"]));
    assert_eq!(args["enable"], false);
  }

  #[test]
  fn chains_split_on_separators() {
    let groups = split_chain(&t(&["alert", "red", "then", "wait", "100;", "notify", "x", "+", "ping"]));
    assert_eq!(groups, vec![t(&["alert", "red"]), t(&["wait", "100"]), t(&["notify", "x"]), t(&["ping"])]);
  }

  #[test]
  fn plan_validates_every_step() {
    let steps = plan(&t(&["alert", "red", "then", "notify", "Shields", "then", "ls"])).unwrap();
    assert_eq!(steps.iter().map(|s| s.cmd.as_str()).collect::<Vec<_>>(), vec!["alert", "notify", "list-dir"]);
    let err = plan(&t(&["ping", "then", "notfy", "x"])).unwrap_err();
    assert!(err.contains("did you mean 'notify'"));
    assert!(plan(&t(&["notify"])).unwrap_err().contains("--title"));
  }
}
