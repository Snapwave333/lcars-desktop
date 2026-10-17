use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ShellStatus {
  pub autostart_enabled: bool,
  pub lcars_shell_active: bool,
  pub current_shell: String,
}

pub fn quote_arg(arg: &str) -> String {
  if !arg.is_empty() && !arg.contains([' ', '\t', '"']) {
    return arg.to_string();
  }
  let mut out = String::from('"');
  let mut backslashes = 0;
  for c in arg.chars() {
    match c {
      '\\' => backslashes += 1,
      '"' => {
        out.extend(std::iter::repeat_n('\\', backslashes * 2 + 1));
        out.push('"');
        backslashes = 0;
      }
      _ => {
        out.extend(std::iter::repeat_n('\\', backslashes));
        out.push(c);
        backslashes = 0;
      }
    }
  }
  out.extend(std::iter::repeat_n('\\', backslashes * 2));
  out.push('"');
  out
}

pub fn join_args(args: &[String]) -> String {
  args.iter().map(|a| quote_arg(a)).collect::<Vec<_>>().join(" ")
}

fn exe_command() -> Result<String, String> {
  let exe = std::env::current_exe().map_err(|e| e.to_string())?;
  Ok(quote_arg(&exe.to_string_lossy()))
}

#[cfg(windows)]
mod imp {
  use super::*;
  use crate::platform::registry::{delete_value, read_string, write_string, Hive};
  use crate::platform::wide;
  use windows_sys::Win32::Foundation::CloseHandle;
  use windows_sys::Win32::System::Threading::GetProcessId;
  use windows_sys::Win32::UI::Shell::{
    ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
  };
  use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

  const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
  const RUN_VALUE: &str = "LCARSShell";
  const WINLOGON_KEY: &str = r"Software\Microsoft\Windows NT\CurrentVersion\Winlogon";

  pub fn execute(file: &str, args: &[String], dir: Option<&str>) -> Result<Option<u32>, String> {
    let params = join_args(args);
    let verb = wide("open");
    let file_w = wide(file);
    let params_w = wide(&params);
    let dir_w = dir.map(wide);
    let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI | SEE_MASK_NOASYNC;
    info.lpVerb = verb.as_ptr();
    info.lpFile = file_w.as_ptr();
    info.lpParameters = if params.is_empty() { std::ptr::null() } else { params_w.as_ptr() };
    info.lpDirectory = dir_w.as_ref().map_or(std::ptr::null(), |d| d.as_ptr());
    info.nShow = SW_SHOWNORMAL;
    if unsafe { ShellExecuteExW(&mut info) } == 0 {
      return Err(format!("cannot open '{file}': {}", std::io::Error::last_os_error()));
    }
    if info.hProcess.is_null() {
      return Ok(None);
    }
    let pid = unsafe { GetProcessId(info.hProcess) };
    unsafe { CloseHandle(info.hProcess) };
    Ok((pid != 0).then_some(pid))
  }

  pub fn reveal(path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("explorer.exe")
      .raw_arg(format!("/select,\"{path}\""))
      .spawn()
      .map(|_| ())
      .map_err(|e| e.to_string())
  }

  pub fn status() -> ShellStatus {
    let current = read_string(Hive::CurrentUser, WINLOGON_KEY, "Shell").unwrap_or_else(|| "explorer.exe".into());
    ShellStatus {
      autostart_enabled: read_string(Hive::CurrentUser, RUN_KEY, RUN_VALUE).is_some(),
      lcars_shell_active: current.to_lowercase().contains("lcars"),
      current_shell: current,
    }
  }

  pub fn set_autostart(enable: bool) -> Result<(), String> {
    if enable {
      write_string(Hive::CurrentUser, RUN_KEY, RUN_VALUE, &exe_command()?)
    } else {
      delete_value(Hive::CurrentUser, RUN_KEY, RUN_VALUE)
    }
  }

  pub fn set_shell(lcars: bool) -> Result<(), String> {
    if lcars {
      write_string(Hive::CurrentUser, WINLOGON_KEY, "Shell", &exe_command()?)
    } else {
      delete_value(Hive::CurrentUser, WINLOGON_KEY, "Shell")
    }
  }
}

#[cfg(not(windows))]
mod imp {
  use super::*;
  use std::process::{Command, Stdio};

  pub fn execute(file: &str, args: &[String], dir: Option<&str>) -> Result<Option<u32>, String> {
    let mut cmd = if args.is_empty() && std::path::Path::new(file).exists() {
      let mut c = Command::new("xdg-open");
      c.arg(file);
      c
    } else {
      let mut c = Command::new(file);
      c.args(args);
      c
    };
    if let Some(d) = dir {
      cmd.current_dir(d);
    }
    cmd
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .map(|c| Some(c.id()))
      .map_err(|e| format!("cannot open '{file}': {e}"))
  }

  pub fn reveal(path: &str) -> Result<(), String> {
    let parent = std::path::Path::new(path).parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    execute(&parent, &[], None).map(|_| ())
  }

  pub fn status() -> ShellStatus {
    ShellStatus { autostart_enabled: false, lcars_shell_active: false, current_shell: "n/a".into() }
  }

  pub fn set_autostart(_enable: bool) -> Result<(), String> {
    let _ = exe_command;
    Err("auto-start is only supported on Windows".into())
  }

  pub fn set_shell(_lcars: bool) -> Result<(), String> {
    Err("shell replacement is only supported on Windows".into())
  }
}

pub fn open(path: &str) -> Result<Option<u32>, String> {
  if path.trim().is_empty() {
    return Err("empty path".into());
  }
  imp::execute(path, &[], None)
}

pub fn launch(path: &str, args: &[String], cwd: Option<&str>) -> Result<Option<u32>, String> {
  if path.trim().is_empty() {
    return Err("empty path".into());
  }
  imp::execute(path, args, cwd)
}

pub use imp::{reveal, set_autostart, set_shell, status};

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn quotes_windows_arguments() {
    assert_eq!(quote_arg("plain"), "plain");
    assert_eq!(quote_arg(""), "\"\"");
    assert_eq!(quote_arg("with space"), "\"with space\"");
    assert_eq!(quote_arg(r"C:\dir with\"), r#""C:\dir with\\""#);
    assert_eq!(quote_arg(r#"say "hi""#), r#""say \"hi\"""#);
    assert_eq!(join_args(&["-a".into(), "b c".into()]), "-a \"b c\"");
  }
}
