use tauri::{Manager, PhysicalPosition, PhysicalSize};

mod external_window;
mod widgets;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      external_window::open_external,
      widgets::sync_widgets,
      widgets::ensure_on_top
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      if let Some(window) = app.get_webview_window("main") {
        // Windows 11 draws a 1px DWM frame along the top of transparent,
        // borderless windows when they lose focus. Cover the full monitor
        // bounds, then shift the window one pixel upward so that frame is
        // rendered off-screen instead of flashing across the desktop.
        if let Some(monitor) = window.primary_monitor()? {
          let origin = monitor.position();
          let size = monitor.size();
          window.set_position(PhysicalPosition::new(origin.x, origin.y - 1))?;
          window.set_size(PhysicalSize::new(size.width, size.height + 1))?;
        }
        window.set_always_on_top(true)?;
        window.show()?;
      }

      // Composition changes (Win+D and friends) can leave stale opaque pixels
      // at the widgets' rounded corners; repaint them whenever the foreground
      // window changes.
      widgets::install_repaint_hook();

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
