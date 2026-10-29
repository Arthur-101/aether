use tauri::{Manager, PhysicalPosition, PhysicalSize};

mod autostart;
mod external_window;
mod overlay;
mod tray;
mod widgets;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      autostart::get_autostart,
      autostart::set_autostart,
      external_window::open_external,
      overlay::set_overlay_bounds,
      tray::set_tray_visible,
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

      // A missing tray must not stop the overlay from starting; the General
      // settings toggle can rebuild it later in the session.
      if let Err(error) = tray::install(app.handle()) {
        log::warn!("Could not create the Aether tray icon: {error}");
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
