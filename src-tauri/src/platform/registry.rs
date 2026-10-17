use windows_sys::Win32::Foundation::ERROR_SUCCESS;
use windows_sys::Win32::System::Registry::{
  RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, REG_SZ, RRF_RT_REG_SZ,
};

use super::wide;

#[derive(Clone, Copy)]
pub enum Hive {
  CurrentUser,
  LocalMachine,
}

impl Hive {
  fn handle(self) -> HKEY {
    match self {
      Hive::CurrentUser => HKEY_CURRENT_USER,
      Hive::LocalMachine => HKEY_LOCAL_MACHINE,
    }
  }
}

fn win32_err(code: u32, what: &str) -> String {
  format!("{what} failed: {}", std::io::Error::from_raw_os_error(code as i32))
}

pub fn read_string(hive: Hive, key: &str, value: &str) -> Option<String> {
  let (k, v) = (wide(key), wide(value));
  let mut size: u32 = 0;
  let rc = unsafe {
    RegGetValueW(hive.handle(), k.as_ptr(), v.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), std::ptr::null_mut(), &mut size)
  };
  if rc != ERROR_SUCCESS || size == 0 {
    return None;
  }
  let mut buf = vec![0u16; (size as usize).div_ceil(2)];
  let rc = unsafe {
    RegGetValueW(hive.handle(), k.as_ptr(), v.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), buf.as_mut_ptr().cast(), &mut size)
  };
  if rc != ERROR_SUCCESS {
    return None;
  }
  let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
  Some(String::from_utf16_lossy(&buf[..len]))
}

pub fn write_string(hive: Hive, key: &str, value: &str, data: &str) -> Result<(), String> {
  let (k, v, d) = (wide(key), wide(value), wide(data));
  let rc = unsafe {
    RegSetKeyValueW(hive.handle(), k.as_ptr(), v.as_ptr(), REG_SZ, d.as_ptr().cast(), (d.len() * 2) as u32)
  };
  if rc == ERROR_SUCCESS {
    Ok(())
  } else {
    Err(win32_err(rc, "registry write"))
  }
}

pub fn delete_value(hive: Hive, key: &str, value: &str) -> Result<(), String> {
  let (k, v) = (wide(key), wide(value));
  let rc = unsafe { RegDeleteKeyValueW(hive.handle(), k.as_ptr(), v.as_ptr()) };
  const ERROR_FILE_NOT_FOUND: u32 = 2;
  if rc == ERROR_SUCCESS || rc == ERROR_FILE_NOT_FOUND {
    Ok(())
  } else {
    Err(win32_err(rc, "registry delete"))
  }
}
