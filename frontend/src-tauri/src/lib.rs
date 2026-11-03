use std::path::PathBuf;

use tauri::{Manager, PhysicalPosition, PhysicalSize};

mod autostart;
mod backend;
mod external_window;
mod overlay;
mod tray;
mod widgets;

/// Rotating overlay logs live beside the daemon's, under `%LOCALAPPDATA%\Aether\Logs`.
/// A windowed release build discards stderr, so this is the only place quit-time and
/// crash-adjacent messages survive.
fn overlay_log_dir() -> PathBuf {
  std::env::var_os("LOCALAPPDATA")
    .map(PathBuf::from)
    .unwrap_or_else(std::env::temp_dir)
    .join("Aether")
    .join("Logs")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Must be the first plugin: a second launch should hand its argv to the
    // running overlay and exit instead of stacking another always-on-top window.
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
      }
    }))
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
      app.manage(backend::BackendProcess::new());

      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log::LevelFilter::Info)
          .max_file_size(2 * 1024 * 1024)
          .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(3))
          .targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
              path: overlay_log_dir(),
              file_name: Some("aether-overlay".into()),
            }),
          ])
          .build(),
      )?;

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
        // Stay hidden until React mounts and asks to be shown. If the webview
        // cannot load (for example a dev build started without the Vite
        // server), showing here would paint WebView2's error page fullscreen
        // over the desktop.
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

      // Release installers carry the daemon, so start it before the webview
      // connects. Debug builds expect start_aether.bat to have done it.
      backend::start(app.handle());

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      // Safety net for a quit that did not go through the tray's KILL_APP
      // flow (for example, the webview crashed): never leave the daemon
      // listening after the overlay is gone.
      if matches!(event, tauri::RunEvent::Exit) {
        backend::stop(app);
      }
    });
}
