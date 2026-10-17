use std::sync::Mutex;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Telemetry {
  pub hostname: String,
  pub username: String,
  pub os: String,
  pub arch: &'static str,
  pub cpu_cores: usize,
  pub cpu_load_percent: f32,
  pub total_memory_mb: u64,
  pub available_memory_mb: u64,
  pub memory_load_percent: u32,
  pub disk_total_gb: f64,
  pub disk_free_gb: f64,
  pub uptime_seconds: u64,
  pub wallpaper_path: String,
  pub app_version: &'static str,
}

#[derive(Default, Clone, Copy)]
struct CpuSample {
  idle: u64,
  total: u64,
}

static LAST_CPU: Mutex<Option<CpuSample>> = Mutex::new(None);

fn cpu_load(current: Option<CpuSample>) -> f32 {
  let Some(now) = current else { return 0.0 };
  let mut last = LAST_CPU.lock().unwrap_or_else(|e| e.into_inner());
  let load = match *last {
    Some(prev) if now.total > prev.total => {
      let total = (now.total - prev.total) as f64;
      let idle = now.idle.saturating_sub(prev.idle) as f64;
      ((1.0 - idle / total) * 100.0).clamp(0.0, 100.0) as f32
    }
    _ => 0.0,
  };
  *last = Some(now);
  (load * 10.0).round() / 10.0
}

fn env_or(keys: &[&str], fallback: &str) -> String {
  keys
    .iter()
    .find_map(|k| std::env::var(k).ok().filter(|v| !v.is_empty()))
    .unwrap_or_else(|| fallback.to_string())
}

#[cfg(windows)]
mod imp {
  use super::CpuSample;
  use crate::platform::wide;
  use windows_sys::Win32::Foundation::FILETIME;
  use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
  use windows_sys::Win32::System::SystemInformation::{GetTickCount64, GlobalMemoryStatusEx, MEMORYSTATUSEX};
  use windows_sys::Win32::System::Threading::GetSystemTimes;
  use windows_sys::Win32::UI::WindowsAndMessaging::{SystemParametersInfoW, SPI_GETDESKWALLPAPER};

  fn ft(f: FILETIME) -> u64 {
    ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64
  }

  pub fn cpu_sample() -> Option<CpuSample> {
    let mut idle: FILETIME = unsafe { std::mem::zeroed() };
    let mut kernel: FILETIME = unsafe { std::mem::zeroed() };
    let mut user: FILETIME = unsafe { std::mem::zeroed() };
    if unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) } == 0 {
      return None;
    }
    Some(CpuSample { idle: ft(idle), total: ft(kernel) + ft(user) })
  }

  pub fn memory() -> (u64, u64, u32) {
    let mut m: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
    m.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
    if unsafe { GlobalMemoryStatusEx(&mut m) } == 0 {
      return (0, 0, 0);
    }
    (m.ullTotalPhys / 1_048_576, m.ullAvailPhys / 1_048_576, m.dwMemoryLoad)
  }

  pub fn disk() -> (u64, u64) {
    let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
    let root = wide(&format!("{drive}\\"));
    let (mut avail, mut total, mut free) = (0u64, 0u64, 0u64);
    if unsafe { GetDiskFreeSpaceExW(root.as_ptr(), &mut avail, &mut total, &mut free) } == 0 {
      return (0, 0);
    }
    (total, avail)
  }

  pub fn uptime() -> u64 {
    unsafe { GetTickCount64() / 1000 }
  }

  pub fn wallpaper() -> String {
    let mut buf = [0u16; 520];
    let ok = unsafe { SystemParametersInfoW(SPI_GETDESKWALLPAPER, buf.len() as u32, buf.as_mut_ptr().cast(), 0) };
    if ok == 0 {
      return String::new();
    }
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len])
  }

  pub fn os_name() -> String {
    use crate::platform::registry::{read_string, Hive};
    const KEY: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion";
    let build: u32 = read_string(Hive::LocalMachine, KEY, "CurrentBuild")
      .and_then(|b| b.parse().ok())
      .unwrap_or(0);
    let family = if build >= 22000 { "Windows 11" } else { "Windows 10" };
    match read_string(Hive::LocalMachine, KEY, "DisplayVersion") {
      Some(v) => format!("{family} {v} (build {build})"),
      None => family.into(),
    }
  }
}

#[cfg(not(windows))]
mod imp {
  use super::CpuSample;

  pub fn cpu_sample() -> Option<CpuSample> {
    let stat = std::fs::read_to_string("/proc/stat").ok()?;
    let nums: Vec<u64> = stat.lines().next()?.split_whitespace().skip(1).filter_map(|n| n.parse().ok()).collect();
    let idle = nums.get(3)? + nums.get(4).copied().unwrap_or(0);
    Some(CpuSample { idle, total: nums.iter().sum() })
  }

  fn meminfo(key: &str) -> Option<u64> {
    let text = std::fs::read_to_string("/proc/meminfo").ok()?;
    let line = text.lines().find(|l| l.starts_with(key))?;
    line.split_whitespace().nth(1)?.parse().ok()
  }

  pub fn memory() -> (u64, u64, u32) {
    let total = meminfo("MemTotal:").unwrap_or(0) / 1024;
    let avail = meminfo("MemAvailable:").unwrap_or(0) / 1024;
    let load = if total > 0 { ((total - avail) * 100 / total) as u32 } else { 0 };
    (total, avail, load)
  }

  pub fn disk() -> (u64, u64) {
    (0, 0)
  }

  pub fn uptime() -> u64 {
    std::fs::read_to_string("/proc/uptime")
      .ok()
      .and_then(|s| s.split_whitespace().next()?.parse::<f64>().ok())
      .map_or(0, |s| s as u64)
  }

  pub fn wallpaper() -> String {
    String::new()
  }

  pub fn os_name() -> String {
    std::env::consts::OS.into()
  }
}

static WALLPAPER: Mutex<Option<String>> = Mutex::new(None);

pub fn wallpaper(refresh: bool) -> String {
  let mut cached = WALLPAPER.lock().unwrap_or_else(|e| e.into_inner());
  if refresh || cached.is_none() {
    *cached = Some(imp::wallpaper());
  }
  cached.clone().unwrap_or_default()
}

pub fn snapshot() -> Telemetry {
  const GB: f64 = 1_073_741_824.0;
  let (total_memory_mb, available_memory_mb, memory_load_percent) = imp::memory();
  let (disk_total, disk_free) = imp::disk();
  Telemetry {
    hostname: env_or(&["COMPUTERNAME", "HOSTNAME"], "STARSHIP-LOCAL"),
    username: env_or(&["USERNAME", "USER"], "OFFICER"),
    os: imp::os_name(),
    arch: std::env::consts::ARCH,
    cpu_cores: std::thread::available_parallelism().map_or(1, |n| n.get()),
    cpu_load_percent: cpu_load(imp::cpu_sample()),
    total_memory_mb,
    available_memory_mb,
    memory_load_percent,
    disk_total_gb: (disk_total as f64 / GB * 10.0).round() / 10.0,
    disk_free_gb: (disk_free as f64 / GB * 10.0).round() / 10.0,
    uptime_seconds: imp::uptime(),
    wallpaper_path: wallpaper(false),
    app_version: env!("CARGO_PKG_VERSION"),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn cpu_load_uses_deltas() {
    *LAST_CPU.lock().unwrap() = None;
    assert_eq!(cpu_load(Some(CpuSample { idle: 100, total: 200 })), 0.0);
    assert_eq!(cpu_load(Some(CpuSample { idle: 150, total: 400 })), 75.0);
    assert_eq!(cpu_load(None), 0.0);
  }
}
