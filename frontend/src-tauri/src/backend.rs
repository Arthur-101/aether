//! Lifecycle for the bundled Python daemon.
//!
//! Release installers ship the PyInstaller onedir tree at
//! `<install dir>\aether-backend\`; this module starts it before the webview
//! connects and kills only the child it spawned when the overlay exits.
//! Debug builds keep using `start_aether.bat` (or an explicit
//! `AETHER_BACKEND_PATH`) so `npm run tauri dev` does not launch a second,
//! frozen daemon beside the source checkout.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const BACKEND_PORT: u16 = 8765;
const HEALTH_ADDRESS: &str = "127.0.0.1:8765";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(45);
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The child process, if this launch started one. `None` means a daemon was
/// already running (dev) or startup was skipped/failed.
pub struct BackendProcess(Mutex<Option<Child>>);

impl BackendProcess {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

/// Returns true when the daemon answers HTTP 200 on `/health`.
fn health_ok() -> bool {
    let Ok(address) = HEALTH_ADDRESS.parse::<SocketAddr>() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));

    let request = "GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }
    response
        .lines()
        .next()
        .is_some_and(|line| line.starts_with("HTTP/1.1 200"))
}

fn resolve_exe(app: &AppHandle, override_path: Option<PathBuf>) -> Result<PathBuf, String> {
    if let Some(path) = override_path {
        let path = if path.is_dir() {
            path.join("aether-backend.exe")
        } else {
            path
        };
        return if path.is_file() {
            Ok(native_path(path))
        } else {
            Err(format!(
                "AETHER_BACKEND_PATH does not point to aether-backend.exe: {}",
                path.display()
            ))
        };
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Could not resolve the resource directory: {error}"))?;
    let candidate = native_path(
        resource_dir
            .join("aether-backend")
            .join("aether-backend.exe"),
    );
    if candidate.is_file() {
        Ok(candidate)
    } else {
        Err(format!(
            "Bundled backend not found at {}. Run build_sidecar.ps1 before building the installer.",
            candidate.display()
        ))
    }
}

/// Tauri's resource directory is an extended-length (`\\?\`) path on Windows.
/// The project enables LongPathsEnabled instead, so keep the path in its
/// native form for logs, `Command`, and the child's working directory.
fn native_path(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = text.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path
    }
}

/// Starts the bundled daemon unless one is already listening or this is a
/// debug build without an explicit override.
pub fn start(app: &AppHandle) {
    if health_ok() {
        log::info!("Backend already listening on 127.0.0.1:{BACKEND_PORT}; not starting another.");
        return;
    }

    let override_path = std::env::var_os("AETHER_BACKEND_PATH").map(PathBuf::from);
    if override_path.is_none() && cfg!(debug_assertions) {
        log::info!("Debug build: expecting the daemon from start_aether.bat.");
        return;
    }

    let exe = match resolve_exe(app, override_path) {
        Ok(exe) => exe,
        Err(error) => {
            log::error!("{error}");
            return;
        }
    };
    let workdir = exe
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    let mut command = Command::new(&exe);
    command
        .current_dir(&workdir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    match command.spawn() {
        Ok(child) => {
            log::info!("Started backend {} (pid {}).", exe.display(), child.id());
            *app.state::<BackendProcess>().0.lock().unwrap() = Some(child);
        }
        Err(error) => {
            log::error!("Could not start backend {}: {error}", exe.display());
            return;
        }
    }

    let handle = app.clone();
    std::thread::spawn(move || {
        let deadline = Instant::now() + STARTUP_TIMEOUT;
        while Instant::now() < deadline {
            if health_ok() {
                log::info!("Backend is healthy on 127.0.0.1:{BACKEND_PORT}.");
                return;
            }

            let exited = {
                let state = handle.state::<BackendProcess>();
                let mut guard = state.0.lock().unwrap();
                match guard.as_mut() {
                    Some(child) => match child.try_wait() {
                        Ok(Some(status)) => Some(status.to_string()),
                        _ => None,
                    },
                    None => return,
                }
            };
            if let Some(status) = exited {
                log::error!("Backend exited during startup ({status}).");
                return;
            }
            std::thread::sleep(Duration::from_millis(500));
        }
        log::error!(
            "Backend did not become healthy within {} seconds.",
            STARTUP_TIMEOUT.as_secs()
        );
    });
}

/// Kills the child this launch spawned. A daemon that was already running is
/// left for the frontend's KILL_APP flow / its owner.
pub fn stop(app: &AppHandle) {
    let state = app.state::<BackendProcess>();
    let Ok(mut guard) = state.0.lock() else {
        return;
    };
    if let Some(mut child) = guard.take() {
        log::info!("Stopping backend (pid {}).", child.id());
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// Reaps the bundled daemon before an in-place update overwrites its files.
///
/// The updater plugin calls `std::process::exit` immediately after it launches
/// the NSIS installer, so `RunEvent::Exit` never fires and the safety net in
/// `lib.rs` does not run. A live daemon keeps `aether-backend\_internal` DLLs
/// mapped, which makes the installer fail with "Error opening file for
/// writing"; the webview awaits this command between downloading and
/// installing so the tree is free before extraction starts.
#[tauri::command]
pub fn reap_backend_for_update(app: AppHandle) {
    stop(&app);
}

/// Starts the daemon again after a failed update hand-off. A successful
/// hand-off never reaches this: the installer exits the process first.
#[tauri::command]
pub fn resume_backend_after_failed_update(app: AppHandle) {
    start(&app);
}
