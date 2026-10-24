//! Native windows for the desktop widgets.
//!
//! Aether's main window is one fullscreen, always-on-top, click-through
//! overlay, so anything painted inside it can never be covered by another app.
//! A desktop widget needs exactly the opposite behaviour, so every popped-out
//! widget gets its own small native window created and styled here.
//!
//! tao, Tauri's windowing layer, rewrites the *whole* extended window style
//! whenever one of its own flags changes: showing a window, making it
//! non-focusable or toggling always-on-top each recompute `GWL_EXSTYLE` from
//! tao's internal flags and silently erase any style bits set by anyone else.
//! So this module never asks tao to change anything after creation. The window
//! is built hidden, and one pass on the main thread applies every passive
//! style, the exact rectangle, the visibility and the Z-order band natively,
//! with `SetWindowLongPtrW` and `SetWindowPos`. That pass is the last word.
//!
//! The windows are deliberately passive:
//!
//! * `WS_EX_NOACTIVATE` stops a click on a widget from stealing focus or
//!   raising it above the window the user is actually working in.
//! * `WS_EX_TOOLWINDOW` keeps the window out of Alt-Tab and the taskbar.
//! * The two placements are structurally different. An on-top widget is a
//!   top-level window raised into the topmost band with `HWND_TOPMOST`. A
//!   desktop-pinned widget becomes a **child of Progman**, the shell's desktop
//!   window, so it lives *in* the desktop: Win+D ("show desktop") raises the
//!   whole Progman tree and the widget rises with it instead of disappearing
//!   behind the wallpaper, while any normal window the user opens still
//!   covers it.
//!
//! Rust is only a window host. The main window owns the widget list, and the
//! widget windows are pure renderers, so there is a single source of truth.

use std::collections::HashSet;
use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Label prefix that identifies a widget window, for example
/// `widget-clock-w1a2b3`. The widget window parses its own kind and id from it,
/// and it doubles as the window title.
pub const WIDGET_LABEL_PREFIX: &str = "widget-";

/// Title prefix used by builds before the label became the title. Any window
/// of this process still carrying it is a leftover from that era.
#[cfg(windows)]
const LEGACY_TITLE_PREFIX: &str = "aether-widget-";

/// Serialises the reconciliation.
///
/// The frontend asks for a sync whenever the widget list changes, and React
/// runs an effect twice on mount in development. Without this lock two
/// overlapping syncs could each find a window missing and each create one,
/// leaving two native windows for one widget — the second invisible to Tauri's
/// label-keyed map, never updated and never closed.
static SYNC_LOCK: Mutex<()> = Mutex::new(());

#[cfg(windows)]
mod native {
    use std::collections::HashSet;

    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, TRUE};
    use windows_sys::Win32::System::Threading::GetCurrentProcessId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DestroyWindow, EnumWindows, FindWindowExW, FindWindowW, GetParent, GetWindowLongPtrW,
        GetWindowTextW, GetWindowThreadProcessId, SetParent, SetWindowLongPtrW, SetWindowPos,
        GWL_EXSTYLE, GWL_STYLE, HWND_BOTTOM, HWND_NOTOPMOST, HWND_TOPMOST, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, SWP_SHOWWINDOW, WS_CAPTION, WS_CHILD, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
        WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_POPUP, WS_SIZEBOX, WS_SYSMENU,
    };
    use windows_sys::Win32::Graphics::Dwm::{DwmExtendFrameIntoClientArea};
    use windows_sys::Win32::UI::Controls::MARGINS;

    use super::{LEGACY_TITLE_PREFIX, WIDGET_LABEL_PREFIX};

    /// A window handle as a plain integer, so it can cross into the
    /// main-thread closure (`run_on_main_thread` requires `Send`).
    pub type Hwnd = isize;

    /// One native styling pass for one widget window.
    pub struct Job {
        pub hwnd: Hwnd,
        pub always_on_top: bool,
        pub rect: (i32, i32, i32, i32),
    }

    /// Converts Tauri's window handle into a plain integer handle.
    ///
    /// Tauri re-exports the `windows` crate newtype while this crate depends
    /// on `windows-sys`, so the raw pointer is unwrapped rather than pulling
    /// the `windows` crate in as a second dependency.
    pub fn raw_hwnd(window: &tauri::WebviewWindow) -> Option<Hwnd> {
        window.hwnd().ok().map(|handle| handle.0 as Hwnd)
    }

    /// Applies the passive styles, the exact rectangle and the Z-order band,
    /// and shows the window, all in one call.
    ///
    /// The geometry is applied here, with `SetWindowPos`, instead of relying on
    /// the builder's `position`/`inner_size`: on this display Tauri reports a
    /// scale factor of `1.0` while WebView2 paints at a device pixel ratio of
    /// `1.12`, so builder values land ~11% short of the widget's real size.
    /// `SetWindowPos` takes physical pixels unambiguously, and the frontend
    /// sends physical values, so the rectangle is exact.
    ///
    /// `SWP_SHOWWINDOW` makes this call the one that reveals the window, so no
    /// tao flag is ever flipped after creation and the styles set here are
    /// never recomputed by anyone else.
    ///
    /// The two placements differ in more than the Z-order band:
    ///
    /// * On top: the window stays a top-level window and is raised into the
    ///   topmost band, above every other window.
    /// * Pinned to the desktop: the window is made a **child of Progman**, the
    ///   window that hosts the desktop. That is what Rainmeter-class widgets
    ///   do, and it is not optional: pressing Win+D ("show desktop") raises
    ///   Progman to the top of the normal band, and a window that merely sat
    ///   at the bottom of the Z order is suddenly *below the wallpaper* — the
    ///   widget vanishes exactly when the user asks to see the desktop. A
    ///   child of Progman travels with the desktop instead, so it stays
    ///   visible, and any normal window opened later covers it again.
    unsafe fn apply_one(job: &Job) {
        let (x, y, width, height) = job.rect;
        let hwnd = job.hwnd as HWND;
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(
                hwnd,
                GWL_EXSTYLE,
                style | WS_EX_NOACTIVATE as isize | WS_EX_TOOLWINDOW as isize,
            );

            // Frame chrome that must never come back on a widget window. tao
            // leaves `WS_CAPTION` and the system-menu bits in the style of an
            // undecorated window and relies on its `WM_NCCALCSIZE` handler to
            // keep them invisible, but on these windows the frame still got
            // drawn — a white title bar with the window label appeared above
            // the widget. Stripping the bits makes the frame impossible for
            // any code path to draw, and `SWP_FRAMECHANGED` below makes the
            // stripped style take effect on the spot.
            const CHROME: isize = (WS_CAPTION | WS_SYSMENU | WS_MAXIMIZEBOX | WS_MINIMIZEBOX
                | WS_SIZEBOX) as isize;

            if job.always_on_top {
                // Leave the desktop layer if the widget was pinned to it.
                if !GetParent(hwnd).is_null() {
                    let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
                    SetWindowLongPtrW(
                        hwnd,
                        GWL_STYLE,
                        (style & !(WS_CHILD as isize)) | WS_POPUP as isize,
                    );
                    SetParent(hwnd, std::ptr::null_mut());
                }
                let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
                SetWindowLongPtrW(hwnd, GWL_STYLE, style & !CHROME);
                SetWindowPos(
                    hwnd,
                    HWND_TOPMOST,
                    x,
                    y,
                    width,
                    height,
                    SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                );
                // Force DWM to treat the whole window as client area so no
                // non-client frame can ever appear, even during transitions.
                let margins = RECT {
                    left: -1,
                    top: -1,
                    right: -1,
                    bottom: -1,
                };
                let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);
            } else if let Some((progman, defview)) = desktop_layer() {
                // Adopt the desktop layer as the parent. Coordinates become
                // Progman-relative, and Progman fills the screen from (0, 0),
                // so the physical rectangle needs no shift.
                if GetParent(hwnd) != progman {
                    let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
                    SetWindowLongPtrW(
                        hwnd,
                        GWL_STYLE,
                        (style & !(WS_POPUP as isize)) | WS_CHILD as isize,
                    );
                    SetParent(hwnd, progman);
                }
                let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
                SetWindowLongPtrW(hwnd, GWL_STYLE, style & !CHROME);
                // Sit directly below the icon view: the widget never covers
                // the desktop icons, and clicks over empty desktop still
                // reach it, because the icon view passes non-icon areas
                // through.
                let insert_after = if defview.is_null() { HWND_BOTTOM } else { defview };
                SetWindowPos(
                    hwnd,
                    insert_after,
                    x,
                    y,
                    width,
                    height,
                    SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                );
            } else {
                // No desktop layer to attach to: settle for the bottom of the
                // Z order, below every application window.
                let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
                SetWindowLongPtrW(hwnd, GWL_STYLE, style & !CHROME);
                SetWindowPos(
                    hwnd,
                    HWND_NOTOPMOST,
                    x,
                    y,
                    width,
                    height,
                    SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                );
                SetWindowPos(
                    hwnd,
                    HWND_BOTTOM,
                    x,
                    y,
                    width,
                    height,
                    SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                );
            }
        }
    }

    /// Builds a NUL-terminated UTF-16 string for the Find* functions.
    fn wide(name: &str) -> Vec<u16> {
        name.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// The desktop layer: Progman, and the icon view inside it. `None` when
    /// the shell desktop is not available.
    fn desktop_layer() -> Option<(HWND, HWND)> {
        let progman_name = wide("Progman");
        let defview_name = wide("SHELLDLL_DefView");
        unsafe {
            let progman = FindWindowW(progman_name.as_ptr(), std::ptr::null());
            if progman.is_null() {
                return None;
            }
            let defview = FindWindowExW(
                progman,
                std::ptr::null_mut(),
                defview_name.as_ptr(),
                std::ptr::null(),
            );
            Some((progman, defview))
        }
    }

    /// Bookkeeping for the ghost sweep: the handles Tauri currently manages.
    struct Sweep {
        managed: HashSet<Hwnd>,
        ghost: Vec<Hwnd>,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = unsafe { &mut *(lparam as *mut Sweep) };
        // Only ever touch windows this process created.
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid as *mut u32) };
        if pid != unsafe { GetCurrentProcessId() } {
            return TRUE;
        }

        let mut buffer = [0u16; 128];
        let len = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), 128) };
        let title = String::from_utf16_lossy(&buffer[..(len.max(0) as usize).min(128)]);

        let stale = if title.starts_with(LEGACY_TITLE_PREFIX) {
            // Titles from before the label became the title: always stale.
            true
        } else if title.starts_with(WIDGET_LABEL_PREFIX) {
            // The title is the label. Every widget window Tauri manages is in
            // `managed`; anything else with a widget title is a twin created by
            // a past duplicate sync and unreachable through Tauri's map.
            !state.managed.contains(&(hwnd as Hwnd))
        } else {
            // Not a widget window: the main window, and anything else.
            false
        };

        if stale {
            state.ghost.push(hwnd as Hwnd);
        }
        TRUE
    }

    /// Destroys widget windows of this process that Tauri does not manage.
    ///
    /// Tauri's window map is keyed by label, so when a window was somehow
    /// created twice for one label the map kept only the second one, and the
    /// first went on living on the desktop with no way to reach it: never
    /// updated, never closed, drawn at the old rectangle. Enumerating the OS
    /// windows by title finds those ghosts too, and the sweep runs on the main
    /// thread, which owns every window, so `DestroyWindow` is legal.
    unsafe fn sweep(managed: &HashSet<Hwnd>) {
        let mut state = Sweep {
            managed: managed.clone(),
            ghost: Vec::new(),
        };
        unsafe { EnumWindows(Some(enum_proc), &mut state as *mut Sweep as LPARAM) };
        for hwnd in &state.ghost {
            unsafe { DestroyWindow(*hwnd as HWND) };
        }
    }

    /// Styles every widget window, then sweeps the ghosts. Called once per
    /// sync on the main thread, so it is the last word on every window.
    pub fn run_pass(jobs: Vec<Job>) {
        let managed: HashSet<Hwnd> = jobs.iter().map(|job| job.hwnd).collect();
        for job in &jobs {
            unsafe { apply_one(job) };
        }
        unsafe { sweep(&managed) };
    }
}

#[cfg(not(windows))]
mod native {
    pub type Hwnd = isize;

    pub struct Job {
        pub hwnd: Hwnd,
        pub always_on_top: bool,
        pub rect: (i32, i32, i32, i32),
    }

    pub fn raw_hwnd(_window: &tauri::WebviewWindow) -> Option<Hwnd> {
        None
    }

    pub fn run_pass(_jobs: Vec<Job>) {}
}

/// One widget as the main window describes it. Every coordinate and size is a
/// **physical** pixel: the frontend converts its logical (CSS) layout with the
/// real device pixel ratio before calling in, because Tauri's own scale factor
/// does not match WebView2's on this display.
#[derive(Clone, Deserialize)]
pub struct WidgetSpec {
    pub id: String,
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub always_on_top: bool,
}

impl WidgetSpec {
    fn label(&self) -> String {
        format!("{WIDGET_LABEL_PREFIX}{}-{}", self.kind, self.id)
    }

    fn rect(&self) -> (i32, i32, i32, i32) {
        (
            self.x.round() as i32,
            self.y.round() as i32,
            self.width.round().max(1.0) as i32,
            self.height.round().max(1.0) as i32,
        )
    }
}

/// Creates one widget window, hidden. Nothing is asked of tao afterwards, so
/// the first paint happens only after the native pass has styled the window:
/// no flash of an activatable, topmost, wrongly-sized rectangle.
fn create(app: &AppHandle, spec: &WidgetSpec) -> tauri::Result<()> {
    WebviewWindowBuilder::new(
        app,
        spec.label(),
        WebviewUrl::App("index.html".into()),
    )
    .title(spec.label())
    .inner_size(spec.width, spec.height)
    .position(spec.x, spec.y)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .resizable(false)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    .build()?;
    Ok(())
}

/// Reconciles the live widget windows with the list the main window owns.
///
/// Called whenever a widget is added, removed, moved or re-pinned, so it closes
/// windows whose widget is gone, creates windows for new widgets, and re-asserts
/// the rectangle and Z-order band of the ones that stay.
#[tauri::command]
pub async fn sync_widgets(app: AppHandle, specs: Vec<WidgetSpec>) -> Result<(), String> {
    let _guard = SYNC_LOCK
        .lock()
        .map_err(|_| "The widget sync lock was poisoned".to_string())?;

    let wanted: HashSet<String> = specs.iter().map(WidgetSpec::label).collect();

    for (label, window) in app.webview_windows() {
        if label.starts_with(WIDGET_LABEL_PREFIX) && !wanted.contains(&label) {
            // `close` only asks: it emits a close request that the app can
            // intercept, and a widget window that was left behind would then
            // stay on the desktop forever, keeping a webview alive for a
            // widget the user already removed. `destroy` tears it down.
            let _ = window.destroy();
        }
    }

    for spec in &specs {
        if app.get_webview_window(&spec.label()).is_none() {
            create(&app, spec)
                .map_err(|error| format!("Could not open the {} widget: {error}", spec.kind))?;
        }
    }

    let jobs: Vec<native::Job> = specs
        .iter()
        .filter_map(|spec| {
            let hwnd = app
                .get_webview_window(&spec.label())
                .and_then(|window| native::raw_hwnd(&window))?;
            Some(native::Job {
                hwnd,
                always_on_top: spec.always_on_top,
                rect: spec.rect(),
            })
        })
        .collect();

    // One pass on the main thread, queued after the creation above, is the
    // last word on every widget window: styles, rectangle, visibility, Z order,
    // and the removal of any ghost windows left by earlier duplicate syncs.
    let _ = app.run_on_main_thread(move || native::run_pass(jobs));

    Ok(())
}
