pub mod apps;
pub mod fs;
#[cfg(windows)]
pub mod registry;
pub mod shell;
pub mod telemetry;
pub mod window;

#[cfg(windows)]
pub fn wide(s: &str) -> Vec<u16> {
  s.encode_utf16().chain(std::iter::once(0)).collect()
}
