//! Dynamic bounds for the main overlay window.
//!
//! The main window is normally a small strip at the top of the primary
//! monitor. A fullscreen transparent layered window makes DWM composite the
//! whole screen every frame even when the island is idle, which steals GPU
//! time from games. The strip only covers the pill (plus room for its shadow),
//! so an idle Aether costs almost nothing to composite.
//!
//! Panels that genuinely need the whole screen (expanded island, Settings,
//! radial wheel, region capture, modals) grow the window back to the monitor
//! before they open, and it shrinks again when they close.
//!
//! The rectangle is applied with `SetWindowPos` in **physical** pixels. Tauri
//! reports a scale factor of `1.0` on displays where WebView2 paints at a
//! device pixel ratio of `1.12`, so Tauri's logical `set_size`/`set_position`
//! would land about 11% short. The frontend multiplies its CSS layout by the
//! real device pixel ratio and sends physical values, which `SetWindowPos`
//! takes unambiguously.

use tauri::{AppHandle, Manager};

#[cfg(windows)]
mod native {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
    };

    /// Moves and resizes the window without changing its Z-order or stealing
    /// focus. `SWP_NOZORDER` matters: the overlay must stay in the topmost
    /// band, and `SWP_NOACTIVATE` keeps a resize from interrupting the game or
    /// the document the user is working in.
    pub fn apply(hwnd: isize, x: i32, y: i32, width: i32, height: i32) {
        unsafe {
            SetWindowPos(
                hwnd as HWND,
                std::ptr::null_mut(),
                x,
                y,
                width,
                height,
                SWP_NOACTIVATE | SWP_NOZORDER,
            );
        }
    }
}

#[cfg(not(windows))]
mod native {
    pub fn apply(_hwnd: isize, _x: i32, _y: i32, _width: i32, _height: i32) {}
}

/// Places the main overlay window at a physical-pixel rectangle.
#[tauri::command]
pub async fn set_overlay_bounds(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "The main window is not available".to_string())?;
    let hwnd = crate::widgets::raw_hwnd(&window)
        .ok_or_else(|| "The main window has no native handle".to_string())?;

    let x = x.round() as i32;
    let y = y.round() as i32;
    let width = width.round().max(1.0) as i32;
    let height = height.round().max(1.0) as i32;

    // Window geometry belongs to the thread that created the window.
    app.run_on_main_thread(move || native::apply(hwnd, x, y, width, height))
        .map_err(|error| error.to_string())
}
