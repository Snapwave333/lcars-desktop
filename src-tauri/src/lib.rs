pub mod ipc;
pub mod platform;

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(verbose: bool) {
  let level = if verbose { log::LevelFilter::Debug } else { log::LevelFilter::Info };
  let log_plugin = tauri_plugin_log::Builder::default()
    .level(level)
    .targets([
      Target::new(TargetKind::Stdout),
      Target::new(TargetKind::LogDir { file_name: Some("lcars-shell".to_string()) }),
    ])
    .build();

  tauri::Builder::default()
    .plugin(log_plugin)
    .invoke_handler(tauri::generate_handler![
      ipc::commands::alert,
      ipc::commands::get_system_info,
      ipc::commands::launch_app,
      ipc::commands::screenshot,
      ipc::commands::send_notification,
      ipc::commands::window_action,
      ipc::commands::list_directory,
      ipc::commands::open_item,
      ipc::commands::reveal_item,
      ipc::commands::get_quick_locations,
      ipc::commands::get_shell_status,
      ipc::commands::set_auto_start,
      ipc::commands::set_windows_shell,
      ipc::commands::get_installed_apps,
    ])
    .setup(move |app| {
      log::info!("lcars-shell {} starting (verbose: {verbose})", env!("CARGO_PKG_VERSION"));
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
        platform::window::bring_to_foreground(&w);
      }
      let handle = app.handle().clone();
      std::thread::Builder::new()
        .name("lcars-ipc".into())
        .spawn(move || ipc::serve_forever(handle))?;
      std::thread::spawn(|| {
        let _ = platform::apps::installed(false);
      });
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
