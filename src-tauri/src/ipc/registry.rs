use std::time::Instant;

use serde::Serialize;
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ArgKind {
  String,
  Bool,
  Number,
  List,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct ArgSpec {
  pub name: &'static str,
  pub kind: ArgKind,
  pub required: bool,
  pub help: &'static str,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct CommandSpec {
  pub name: &'static str,
  pub plugin: &'static str,
  pub aliases: &'static [&'static str],
  pub summary: &'static str,
  pub args: &'static [ArgSpec],
}

const fn arg(name: &'static str, kind: ArgKind, required: bool, help: &'static str) -> ArgSpec {
  ArgSpec { name, kind, required, help }
}

const fn spec(
  plugin: &'static str,
  name: &'static str,
  aliases: &'static [&'static str],
  summary: &'static str,
  args: &'static [ArgSpec],
) -> CommandSpec {
  CommandSpec { name, plugin, aliases, summary, args }
}

use ArgKind::{Bool, List, Number, String as Str};

pub const REGISTRY: &[CommandSpec] = &[
  spec("core", "status", &[], "Daemon and window status", &[]),
  spec("core", "ping", &[], "Round-trip check", &[]),
  spec("core", "help", &["commands"], "List every available command", &[]),
  spec("core", "wait", &["sleep"], "Pause between steps", &[
    arg("ms", Number, true, "Milliseconds to wait (max 60000)"),
  ]),
  spec("core", "batch", &["run"], "Run several steps in order", &[
    arg("steps", List, true, "Array of { cmd, args } objects"),
    arg("continue", Bool, false, "Keep going after a failed step"),
  ]),
  spec("window", "show", &[], "Show and focus the shell window", &[]),
  spec("window", "hide", &[], "Hide the shell window", &[]),
  spec("window", "toggle", &[], "Toggle shell window visibility", &[]),
  spec("window", "minimize", &[], "Minimize the shell window", &[]),
  spec("window", "maximize", &[], "Maximize or restore the shell window", &[]),
  spec("window", "fullscreen", &[], "Toggle fullscreen", &[]),
  spec("window", "screenshot", &[], "Save a PNG of the shell window", &[
    arg("path", Str, true, "Destination .png path"),
  ]),
  spec("window", "reload", &[], "Reload the interface", &[]),
  spec("window", "shutdown", &["exit", "quit"], "Exit the shell", &[]),
  spec("system", "info", &["system-info"], "Host, memory and uptime telemetry", &[]),
  spec("system", "alert", &[], "Set the alert condition", &[
    arg("mode", Str, true, "red | yellow | blue | none"),
  ]),
  spec("system", "notify", &[], "Post a notification to the shell", &[
    arg("title", Str, true, "Notification title"),
    arg("body", Str, false, "Notification body"),
  ]),
  spec("system", "wallpaper", &[], "Change the shell wallpaper", &[
    arg("path", Str, true, "Image path"),
  ]),
  spec("files", "list-dir", &["list_dir", "ls", "desktop", "desktop-items"], "List a folder (Desktop when no path)", &[
    arg("path", Str, false, "Folder path"),
  ]),
  spec("files", "quick-locations", &["quick_locations"], "Well-known user folders", &[]),
  spec("files", "open", &[], "Open a file, folder or URL with its default handler", &[
    arg("path", Str, true, "Path or URL"),
  ]),
  spec("files", "reveal", &[], "Reveal a file in Explorer", &[
    arg("path", Str, true, "File path"),
  ]),
  spec("apps", "installed-apps", &["installed_apps", "apps"], "Catalog of installed applications", &[]),
  spec("apps", "find-app", &["find_app"], "Find installed applications by name", &[
    arg("name", Str, true, "Part of the application name"),
  ]),
  spec("apps", "start-app", &["start_app"], "Launch the best-matching installed application", &[
    arg("name", Str, true, "Application name"),
  ]),
  spec("apps", "launch", &["exec"], "Start an executable", &[
    arg("path", Str, true, "Executable path or name"),
    arg("args", List, false, "Arguments"),
    arg("detached", Bool, false, "Detach stdio"),
  ]),
  spec("shell", "shell-status", &["shell_status"], "Auto-start and shell registration state", &[]),
  spec("shell", "auto-start", &["auto_start"], "Enable or disable start on login", &[
    arg("enable", Bool, true, "true to enable"),
  ]),
  spec("shell", "shell", &[], "Set the Windows shell", &[
    arg("set", Str, true, "lcars | explorer"),
  ]),
];

pub fn resolve(name: &str) -> Option<&'static CommandSpec> {
  let key = name.trim().to_ascii_lowercase();
  REGISTRY
    .iter()
    .find(|c| c.name == key || c.aliases.contains(&key.as_str()))
}

fn distance(a: &str, b: &str) -> usize {
  let b: Vec<char> = b.chars().collect();
  let mut prev: Vec<usize> = (0..=b.len()).collect();
  for (i, ca) in a.chars().enumerate() {
    let mut cur = vec![i + 1; b.len() + 1];
    for (j, cb) in b.iter().enumerate() {
      let cost = usize::from(ca != *cb);
      cur[j + 1] = (prev[j] + cost).min(prev[j + 1] + 1).min(cur[j] + 1);
    }
    prev = cur;
  }
  prev[b.len()]
}

pub fn suggest(name: &str) -> Option<&'static str> {
  let key = name.trim().to_ascii_lowercase();
  REGISTRY
    .iter()
    .flat_map(|c| std::iter::once(c.name).chain(c.aliases.iter().copied()).map(move |n| (c.name, n)))
    .map(|(canonical, n)| (canonical, distance(&key, n)))
    .filter(|(_, d)| *d <= 2)
    .min_by_key(|(_, d)| *d)
    .map(|(canonical, _)| canonical)
}

pub fn validate(spec: &CommandSpec, args: &Value) -> Result<(), String> {
  for a in spec.args.iter().filter(|a| a.required) {
    let present = args.get(a.name).map(|v| !v.is_null()).unwrap_or(false);
    if !present {
      return Err(format!("'{}' needs --{} ({})", spec.name, a.name, a.help));
    }
  }
  Ok(())
}

pub fn unknown(name: &str) -> String {
  match suggest(name) {
    Some(s) => format!("unknown command '{name}' (did you mean '{s}'?)"),
    None => format!("unknown command '{name}' (try 'help')"),
  }
}

pub fn catalog() -> Value {
  json!(REGISTRY)
}

pub fn run_batch<F>(args: &Value, mut exec: F) -> Result<Value, String>
where
  F: FnMut(&str, &Value) -> Result<Value, String>,
{
  let steps = args
    .get("steps")
    .and_then(|v| v.as_array())
    .ok_or("missing 'steps' argument")?;
  if steps.is_empty() {
    return Err("batch has no steps".to_string());
  }
  let keep_going = args.get("continue").and_then(|v| v.as_bool()).unwrap_or(false);
  let mut results = Vec::with_capacity(steps.len());
  let mut failed = 0usize;
  for (index, step) in steps.iter().enumerate() {
    let cmd = step.get("cmd").and_then(|v| v.as_str()).unwrap_or("");
    let step_args = step.get("args").cloned().unwrap_or_else(|| json!({}));
    let started = Instant::now();
    let outcome = if cmd.is_empty() {
      Err("step has no 'cmd'".to_string())
    } else if resolve(cmd).map(|s| s.name == "batch").unwrap_or(false) {
      Err("batches cannot be nested".to_string())
    } else {
      exec(cmd, &step_args)
    };
    let ms = started.elapsed().as_millis() as u64;
    match outcome {
      Ok(data) => results.push(json!({ "index": index, "cmd": cmd, "ok": true, "data": data, "ms": ms })),
      Err(error) => {
        failed += 1;
        results.push(json!({ "index": index, "cmd": cmd, "ok": false, "error": error, "ms": ms }));
        if !keep_going {
          break;
        }
      }
    }
  }
  let completed = results.len();
  let body = json!({
    "steps": results,
    "completed": completed,
    "total": steps.len(),
    "failed": failed,
  });
  if failed > 0 && !keep_going {
    let last = body["steps"][completed - 1]["error"].as_str().unwrap_or("failed").to_string();
    return Err(format!("step {} ({}) failed: {last}", completed, body["steps"][completed - 1]["cmd"].as_str().unwrap_or("?")));
  }
  Ok(body)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn names_and_aliases_are_unique() {
    let mut seen = std::collections::HashSet::new();
    for c in REGISTRY {
      assert!(seen.insert(c.name), "duplicate {}", c.name);
      for a in c.aliases {
        assert!(seen.insert(a), "duplicate alias {a}");
      }
    }
  }

  #[test]
  fn resolves_aliases_case_insensitively() {
    assert_eq!(resolve("LS").map(|c| c.name), Some("list-dir"));
    assert_eq!(resolve("desktop").map(|c| c.name), Some("list-dir"));
    assert_eq!(resolve("quit").map(|c| c.name), Some("shutdown"));
    assert!(resolve("nope").is_none());
  }

  #[test]
  fn suggests_close_matches() {
    assert_eq!(suggest("notfy"), Some("notify"));
    assert_eq!(suggest("alrt"), Some("alert"));
    assert_eq!(suggest("zzzzzzzz"), None);
    assert!(unknown("pnig").contains("ping"));
  }

  #[test]
  fn validates_required_args() {
    let notify = resolve("notify").unwrap();
    assert!(validate(notify, &json!({})).is_err());
    assert!(validate(notify, &json!({ "title": "x" })).is_ok());
  }

  #[test]
  fn batch_runs_in_order_and_stops_on_error() {
    let mut calls = Vec::new();
    let args = json!({ "steps": [
      { "cmd": "ping" },
      { "cmd": "bogus" },
      { "cmd": "status" },
    ]});
    let res = run_batch(&args, |cmd, _| {
      calls.push(cmd.to_string());
      if cmd == "bogus" { Err("nope".into()) } else { Ok(json!(true)) }
    });
    assert!(res.unwrap_err().contains("step 2 (bogus)"));
    assert_eq!(calls, vec!["ping", "bogus"]);
  }

  #[test]
  fn batch_can_continue_past_errors() {
    let args = json!({ "continue": true, "steps": [
      { "cmd": "bogus" },
      { "cmd": "ping" },
    ]});
    let res = run_batch(&args, |cmd, _| if cmd == "bogus" { Err("x".into()) } else { Ok(json!(1)) }).unwrap();
    assert_eq!(res["completed"], 2);
    assert_eq!(res["failed"], 1);
    assert_eq!(res["steps"][1]["ok"], true);
  }

  #[test]
  fn batch_rejects_nesting_and_empty() {
    assert!(run_batch(&json!({ "steps": [] }), |_, _| Ok(json!(1))).is_err());
    let nested = json!({ "steps": [{ "cmd": "run" }] });
    assert!(run_batch(&nested, |_, _| Ok(json!(1))).is_err());
  }

  #[test]
  fn catalog_serializes_every_command() {
    assert_eq!(catalog().as_array().unwrap().len(), REGISTRY.len());
  }
}
