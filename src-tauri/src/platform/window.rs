pub fn capture(w: &tauri::WebviewWindow, path: &str) -> Result<(), String> {
  #[cfg(windows)]
  {
    let hwnd = w.hwnd().map_err(|e| e.to_string())?.0;
    capture_hwnd(hwnd, path)
  }
  #[cfg(not(windows))]
  {
    let _ = (w, path);
    Err("screenshots are only implemented on Windows".to_string())
  }
}

#[cfg(windows)]
fn capture_hwnd(hwnd: *mut core::ffi::c_void, path: &str) -> Result<(), String> {
  use std::io::BufWriter;

  use windows_sys::Win32::Foundation::RECT;
  use windows_sys::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits,
    GetWindowDC, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    RGBQUAD, SRCCOPY,
  };
  use windows_sys::Win32::Storage::Xps::PrintWindow;
  use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect;

  unsafe {
    let mut rect = RECT {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    };
    if GetWindowRect(hwnd, &mut rect) == 0 {
      return Err("GetWindowRect failed".to_string());
    }
    let width = rect.right - rect.left;
    let height = rect.bottom - rect.top;
    if width <= 0 || height <= 0 {
      return Err("window rect is empty (is the window shown?)".to_string());
    }

    let hdc = GetWindowDC(hwnd);
    let mem = CreateCompatibleDC(hdc);
    let bmp = CreateCompatibleBitmap(hdc, width, height);
    let old = SelectObject(mem, bmp);
    if PrintWindow(hwnd, mem, 2) == 0 {
      BitBlt(mem, 0, 0, width, height, hdc, 0, 0, SRCCOPY);
    }

    let mut bi = BITMAPINFO {
      bmiHeader: BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: width,
        biHeight: -height,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB,
        biSizeImage: 0,
        biXPelsPerMeter: 0,
        biYPelsPerMeter: 0,
        biClrUsed: 0,
        biClrImportant: 0,
      },
      bmiColors: [RGBQUAD {
        rgbBlue: 0,
        rgbGreen: 0,
        rgbRed: 0,
        rgbReserved: 0,
      }],
    };
    let mut buf = vec![0u8; width as usize * height as usize * 4];
    let got = GetDIBits(
      hdc,
      bmp,
      0,
      height as u32,
      buf.as_mut_ptr().cast(),
      &mut bi,
      DIB_RGB_COLORS,
    );

    SelectObject(mem, old);
    DeleteObject(bmp);
    DeleteDC(mem);
    ReleaseDC(hwnd, hdc);

    if got == 0 {
      return Err("GetDIBits failed".to_string());
    }

    for px in buf.chunks_exact_mut(4) {
      px.swap(0, 2);
    }

    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut encoder = png::Encoder::new(BufWriter::new(file), width as u32, height as u32);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&buf).map_err(|e| e.to_string())?;
    Ok(())
  }
}


pub fn bring_to_foreground(w: &tauri::WebviewWindow) {
  #[cfg(windows)]
  {
    if let Ok(hwnd) = w.hwnd() {
      use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, SetForegroundWindow, SetWindowPos, ShowWindow,
        HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_RESTORE, SW_SHOW,
      };
      let hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;
      unsafe {
        ShowWindow(hwnd, SW_RESTORE);
        ShowWindow(hwnd, SW_SHOW);
        BringWindowToTop(hwnd);
        SetForegroundWindow(hwnd);
        SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
        SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
      }
    }
  }
  #[cfg(not(windows))]
  {
    let _ = w.set_focus();
  }
}