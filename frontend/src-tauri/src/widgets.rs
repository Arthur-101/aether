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
    use windows_sys::Win32::Foundation::{FALSE, HWND, LPARAM, TRUE};
    use windows_sys::Win32::System::Threading::GetCurrentProcessId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DestroyWindow, EnumWindows, FindWindowExW, FindWindowW, GetParent, GetWindowLongPtrW,
        GetWindowTextW, GetWindowThreadProcessId, SetParent, SetWindowLongPtrW, SetWindowPos,
        GWL_EXSTYLE, GWL_STYLE, HWND_BOTTOM, HWND_NOTOPMOST, HWND_TOPMOST, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, WS_CAPTION, WS_CHILD, WS_EX_LAYERED,
        WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_POPUP, WS_SIZEBOX, WS_SYSMENU,
    };
    use windows_sys::Win32::Graphics::Dwm::{
        DwmEnableBlurBehindWindow, DwmSetWindowAttribute, DWM_BLURBEHIND, DWM_BB_BLURREGION,
        DWM_BB_ENABLE, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_WINDOW_CORNER_PREFERENCE,
        DWMWCP_DONOTROUND,
    };
    use windows_sys::Win32::Graphics::Gdi::{
        CreateRectRgn, DeleteObject, RedrawWindow, RDW_ALLCHILDREN, RDW_FRAME, RDW_INVALIDATE,
    };
    use windows_sys::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumChildWindows, GetDesktopWindow, EVENT_SYSTEM_FOREGROUND, WINEVENT_OUTOFCONTEXT,
    };

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
                // A layered window with no layered attributes paints nothing,
                // and this widget may still carry `WS_EX_LAYERED` from an
                // earlier on-top placement. The desktop placement is a plain
                // child window, so strip it or the widget vanishes.
                let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex & !(WS_EX_LAYERED as isize));
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

            // Windows 11 rounds the corners of top-level windows and draws a
            // one-pixel border around them. On these transparent cards the
            // border shows as white brackets at the corners — most visibly
            // after a reparent or Win+D, when DWM recomposes the window. Opt
            // out of both: no rounding, no border. A widget draws its own
            // corner radius in CSS.
            let corner: i32 = DWMWCP_DONOTROUND;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE as u32,
                &corner as *const i32 as *const core::ffi::c_void,
                std::mem::size_of_val(&corner) as u32,
            );
            let border: u32 = DWMWA_COLOR_NONE;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_BORDER_COLOR as u32,
                &border as *const u32 as *const core::ffi::c_void,
                std::mem::size_of_val(&border) as u32,
            );

            // tao makes a window transparent with `DwmEnableBlurBehindWindow`
            // and an empty blur region, applied once at creation. Reparenting
            // between the desktop layer and the topmost band resets the
            // window's DWM redirection surface and drops that state; the
            // webview then paints on an opaque white surface and the card's
            // rounded corners show white wedges. Re-apply it on every pass so
            // the widget stays transparent across pin/unpin and Win+D.
            let region = CreateRectRgn(0, 0, -1, -1);
            if !region.is_null() {
                let blur = DWM_BLURBEHIND {
                    dwFlags: DWM_BB_ENABLE | DWM_BB_BLURREGION,
                    fEnable: TRUE,
                    hRgnBlur: region,
                    fTransitionOnMaximized: FALSE,
                };
                let _ = DwmEnableBlurBehindWindow(hwnd, &blur);
                let _ = DeleteObject(region as *mut core::ffi::c_void);
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

    /// Collects every widget window of this process, top-level or a child of
    /// the desktop layer.
    struct Repaint {
        windows: Vec<Hwnd>,
    }

    unsafe extern "system" fn repaint_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = unsafe { &mut *(lparam as *mut Repaint) };
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid as *mut u32) };
        if pid != unsafe { GetCurrentProcessId() } {
            return TRUE;
        }
        let mut buffer = [0u16; 128];
        let len = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), 128) };
        let title = String::from_utf16_lossy(&buffer[..(len.max(0) as usize).min(128)]);
        if title.starts_with(WIDGET_LABEL_PREFIX) {
            state.windows.push(hwnd as Hwnd);
        }
        TRUE
    }

    /// Forces every widget window to repaint.
    ///
    /// Windows keeps the DWM redirection surface of a window across a
    /// reparent, but after a composition change (Win+D is the common one) it
    /// can composite that surface from stale opaque pixels: the webview's
    /// transparent corners come back as white wedges. Invalidating the window
    /// makes WebView2 present its transparent surface again and the wedges
    /// vanish. The desktop window is enumerated instead of `EnumWindows`
    /// because pinned widgets are children of Progman.
    pub fn repaint_widgets() {
        let mut state = Repaint {
            windows: Vec::new(),
        };
        unsafe {
            EnumChildWindows(
                GetDesktopWindow(),
                Some(repaint_proc),
                &mut state as *mut Repaint as LPARAM,
            );
            for hwnd in &state.windows {
                RedrawWindow(
                    *hwnd as HWND,
                    std::ptr::null(),
                    std::ptr::null_mut(),
                    RDW_INVALIDATE | RDW_FRAME | RDW_ALLCHILDREN,
                );
            }
        }
    }

    /// Repaints the widgets whenever the foreground window changes.
    ///
    /// Win+D ("show desktop") raises Progman and changes the foreground, and
    /// that composition change is exactly what leaves the white corner
    /// wedges on the widgets. Repairing on the event is immediate, and
    /// foreground changes are user-driven, so the cost is a few redraws per
    /// interaction rather than a poll.
    unsafe extern "system" fn on_foreground(
        _hook: HWINEVENTHOOK,
        _event: u32,
        _hwnd: HWND,
        _object: i32,
        _child: i32,
        _thread: u32,
        _time: u32,
    ) {
        repaint_widgets();
    }

    /// Installs the foreground repair hook for the lifetime of the process.
    /// The returned handle is deliberately dropped: the hook must live as long
    /// as the app, and the process owns it.
    pub fn install_repaint_hook() {
        unsafe {
            SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                std::ptr::null_mut(),
                Some(on_foreground),
                0,
                0,
                WINEVENT_OUTOFCONTEXT,
            );
        }
    }

    /// Styles every widget window, then sweeps the ghosts. Called once per
    /// sync on the main thread, so it is the last word on every window.
    pub fn run_pass(jobs: Vec<Job>, main_hwnd: Option<Hwnd>) {
        let managed: HashSet<Hwnd> = jobs.iter().map(|job| job.hwnd).collect();
        // Re-assert the main window at the top of the topmost band first. The
        // island is the shell floor and must cover every window the user
        // opens; Windows re-orders *within* the topmost band whenever another
        // topmost window is activated, which can bury the island between
        // syncs. Raising it before the widget jobs leaves the widgets above
        // the main window in the band, which is where they stood before.
        if let Some(hwnd) = main_hwnd {
            unsafe {
                SetWindowPos(
                    hwnd as HWND,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
        }
        for job in &jobs {
            unsafe { apply_one(job) };
        }
        unsafe { sweep(&managed) };
    }

    /// Re-asserts the island windows at the top of the topmost band: the main
    /// window first, then every top-level widget window, so the widgets stay
    /// above the main window while both sit above everything. Desktop-pinned
    /// widgets are children of Progman and are skipped — their placement is
    /// owned by `apply_one`.
    ///
    /// Windows re-orders within the topmost band whenever *any* topmost
    /// window is activated, so a window the user pinned (or an overlay) can
    /// bury the island between widget syncs. A few `SetWindowPos` calls at
    /// microsecond cost restore the standing order.
    pub fn raise_band(main_hwnd: Option<Hwnd>, widget_hwnds: Vec<Hwnd>) {
        unsafe {
            if let Some(hwnd) = main_hwnd {
                SetWindowPos(
                    hwnd as HWND,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
            for hwnd in widget_hwnds {
                if GetParent(hwnd as HWND).is_null() {
                    SetWindowPos(
                        hwnd as HWND,
                        HWND_TOPMOST,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                }
            }
        }
        // Safety net for the rare composition change that never reached the
        // foreground hook: a redraw repairs any stale opaque corner pixels.
        repaint_widgets();
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

    pub fn run_pass(_jobs: Vec<Job>, _main_hwnd: Option<Hwnd>) {}

    pub fn raise_band(_main_hwnd: Option<Hwnd>, _widget_hwnds: Vec<Hwnd>) {}

    pub fn install_repaint_hook() {}
}

/// Installs the foreground repaint hook that repairs stale widget corners
/// after composition changes such as Win+D.
pub fn install_repaint_hook() {
    native::install_repaint_hook();
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
    let main_hwnd = app
        .get_webview_window("main")
        .and_then(|window| native::raw_hwnd(&window));
    let _ = app.run_on_main_thread(move || native::run_pass(jobs, main_hwnd));

    Ok(())
}

/// Re-asserts the standing Z order of the island windows.
///
/// Called on a slow timer from the main window. Windows re-orders the topmost
/// band whenever any topmost window is activated, so a window the user pinned
/// (for example with a window manager's "always on top") can bury the island
/// between widget syncs; this restores it. See `native::raise_band`.
#[tauri::command]
pub async fn ensure_on_top(app: AppHandle) -> Result<(), String> {
    let main_hwnd = app
        .get_webview_window("main")
        .and_then(|window| native::raw_hwnd(&window));
    let widget_hwnds: Vec<native::Hwnd> = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| label.starts_with(WIDGET_LABEL_PREFIX))
        .filter_map(|(_, window)| native::raw_hwnd(&window))
        .collect();
    let _ = app.run_on_main_thread(move || native::raise_band(main_hwnd, widget_hwnds));
    Ok(())
}
