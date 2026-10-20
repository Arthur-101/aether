//! Foreground activation for external Windows windows.
//!
//! Aether is usually the foreground process when it opens Windows Settings or
//! Explorer. Launching those windows from the Python daemon means Windows gives
//! foreground rights to the daemon instead, so the new window can appear behind
//! the active browser. This module launches and focuses the target from the
//! Tauri process, which owns the foreground window.

use std::path::Path;
use std::ptr::null_mut;
use std::time::Duration;

use serde::Deserialize;
use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{SetActiveWindow, SetFocus};
use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, BringWindowToTop, EnumWindows, GetClassNameW,
    GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId, IsIconic,
    IsWindowVisible, SetForegroundWindow, SetWindowPos, ShowWindow, HWND_TOP,
    SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_RESTORE, SW_SHOWNORMAL, WNDENUMPROC,
};

#[derive(Clone, Copy, PartialEq, Eq)]
enum WindowKind {
    Settings,
    Explorer,
}

#[derive(Deserialize)]
pub struct WindowPlacement {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

struct SearchContext {
    kind: WindowKind,
    needle: String,
    found: Option<HWND>,
}

fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn window_title(hwnd: HWND) -> String {
    let mut buffer = [0u16; 512];
    let length = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
    if length <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..length as usize])
}

fn window_class(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    let length = unsafe { GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
    if length <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..length as usize])
}

unsafe extern "system" fn enum_window(hwnd: HWND, lparam: isize) -> i32 {
    unsafe {
        let context = &mut *(lparam as *mut SearchContext);
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }

        let title = window_title(hwnd);
        if title.is_empty() {
            return 1;
        }
        let class = window_class(hwnd);

        let matches = match context.kind {
            WindowKind::Settings => {
                let lower = title.to_lowercase();
                lower == "settings"
                    || (class.eq_ignore_ascii_case("ApplicationFrameWindow")
                        && lower.contains("settings"))
            }
            WindowKind::Explorer => {
                class.eq_ignore_ascii_case("CabinetWClass")
                    && title
                        .to_lowercase()
                        .contains(&context.needle.to_lowercase())
            }
        };

        if matches {
            context.found = Some(hwnd);
            return 0;
        }
        1
    }
}

fn find_window(kind: WindowKind, needle: &str) -> Option<HWND> {
    let mut context = SearchContext {
        kind,
        needle: needle.to_string(),
        found: None,
    };
    let callback: WNDENUMPROC = Some(enum_window);
    unsafe {
        EnumWindows(callback, &mut context as *mut SearchContext as isize);
    }
    context.found
}

fn focus_window(hwnd: HWND) {
    unsafe {
        if IsIconic(hwnd) != 0 {
            ShowWindow(hwnd, SW_RESTORE);
        }
        BringWindowToTop(hwnd);
        SetForegroundWindow(hwnd);
        SetActiveWindow(hwnd);

        if GetForegroundWindow() == hwnd {
            return;
        }

        // Windows can still deny SetForegroundWindow when focus belongs to
        // another process. Temporarily attaching to the foreground thread
        // releases that restriction.
        let foreground = GetForegroundWindow();
        let foreground_thread = GetWindowThreadProcessId(foreground, null_mut());
        let target_thread = GetWindowThreadProcessId(hwnd, null_mut());
        let current_thread = GetCurrentThreadId();

        if foreground_thread != 0 {
            AttachThreadInput(current_thread, foreground_thread, 1);
        }
        if target_thread != 0 && target_thread != foreground_thread {
            AttachThreadInput(current_thread, target_thread, 1);
        }

        BringWindowToTop(hwnd);
        SetForegroundWindow(hwnd);
        SetActiveWindow(hwnd);
        SetFocus(hwnd);

        if target_thread != 0 && target_thread != foreground_thread {
            AttachThreadInput(current_thread, target_thread, 0);
        }
        if foreground_thread != 0 {
            AttachThreadInput(current_thread, foreground_thread, 0);
        }
    }
}

fn place_window(hwnd: HWND, placement: &WindowPlacement) {
    unsafe {
        // Restore maximized windows too, otherwise the requested size is
        // ignored and Explorer keeps its previous full-screen bounds.
        ShowWindow(hwnd, SW_RESTORE);
        SetWindowPos(
            hwnd,
            HWND_TOP,
            placement.x,
            placement.y,
            placement.width,
            placement.height,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
    }
}

fn folder_name(target: &str) -> String {
    Path::new(target)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(target)
        .to_string()
}

fn open_external_blocking(
    target: String,
    placement: Option<WindowPlacement>,
) -> Result<(), String> {
    let target = target.trim().to_string();
    if target.is_empty() {
        return Err("No external target was provided.".to_string());
    }

    let is_settings = target.to_lowercase().starts_with("ms-settings:");
    let kind = if is_settings {
        WindowKind::Settings
    } else {
        WindowKind::Explorer
    };
    let needle = if is_settings {
        "settings".to_string()
    } else {
        folder_name(&target)
    };

    let operation = to_wide("open");
    let file = to_wide(&target);
    unsafe {
        AllowSetForegroundWindow(u32::MAX);
        let result = ShellExecuteW(
            null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        );
        if result as isize <= 32 {
            return Err(format!("Windows could not open {target}."));
        }
    }

    // Settings and Explorer can take a moment to create or update their window.
    for _ in 0..45 {
        if let Some(hwnd) = find_window(kind, &needle) {
            if !is_settings {
                if let Some(placement) = placement.as_ref() {
                    place_window(hwnd, placement);
                }
            }
            focus_window(hwnd);
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    // The window existed but did not match our title search (for example a
    // localized Settings title). The launch itself succeeded, so leave it.
    Ok(())
}

#[tauri::command]
pub async fn open_external(
    target: String,
    placement: Option<WindowPlacement>,
) -> Result<(), String> {
    match tauri::async_runtime::spawn_blocking(move || open_external_blocking(target, placement))
        .await
    {
        Ok(result) => result,
        Err(error) => Err(error.to_string()),
    }
}
