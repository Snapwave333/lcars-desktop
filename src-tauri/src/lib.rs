pub mod ipc;

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(verbose: bool) {
  let level = if verbose {
    log::LevelFilter::Debug
  } else {
    log::LevelFilter::Info
  };
  let log_builder = tauri_plugin_log::Builder::default()
    .level(level)
    .targets([
      Target::new(TargetKind::Stdout),
      Target::new(TargetKind::LogDir {
        file_name: Some("lcars-shell".to_string()),
      }),
    ]);
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      ipc::commands::run_command,
      ipc::commands::run_batch,
      ipc::commands::list_commands,
    ])
    .setup(move |app| {
      app.handle().plugin(log_builder.build())?;
      log::info!("lcars-shell starting (verbose: {verbose})");
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        ipc::handlers::bring_to_foreground(&w);
      }
      let handle = app.handle().clone();
      std::thread::spawn(move || ipc::serve_forever(handle));
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
