//! Windows sign-in autostart.
//!
//! Tauri does not ship a cross-platform autostart plugin in this project, and
//! Aether only targets Windows. Writing the per-user Run value directly keeps
//! the installer lighter and avoids a second dependency tree.

#[cfg(windows)]
mod platform {
    use std::ptr::{null, null_mut};

    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW,
        RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const VALUE_NAME: &str = "Aether";

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn is_enabled() -> Result<bool, String> {
        let subkey = wide(RUN_KEY);
        let name = wide(VALUE_NAME);
        let mut key: HKEY = null_mut();

        let open = unsafe {
            RegOpenKeyExW(
                HKEY_CURRENT_USER,
                subkey.as_ptr(),
                0,
                KEY_QUERY_VALUE,
                &mut key,
            )
        };
        if open != 0 {
            return Ok(false);
        }

        let mut kind = 0u32;
        let mut size = 0u32;
        let query = unsafe {
            RegQueryValueExW(
                key,
                name.as_ptr(),
                null(),
                &mut kind,
                null_mut(),
                &mut size,
            )
        };
        unsafe {
            RegCloseKey(key);
        }
        Ok(query == 0 && kind == REG_SZ && size > 0)
    }

    pub fn set_enabled(enabled: bool) -> Result<(), String> {
        if !enabled {
            return remove();
        }

        let executable = std::env::current_exe()
            .map_err(|error| format!("Could not locate the Aether executable: {error}"))?;
        let command = format!("\"{}\"", executable.display());
        let subkey = wide(RUN_KEY);
        let name = wide(VALUE_NAME);
        let value = wide(&command);
        let mut key: HKEY = null_mut();

        let create = unsafe {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                subkey.as_ptr(),
                0,
                null(),
                REG_OPTION_NON_VOLATILE,
                KEY_SET_VALUE,
                null(),
                &mut key,
                null_mut(),
            )
        };
        if create != 0 {
            return Err(format!("Could not open the Windows startup registry key ({create})."));
        }

        let bytes = unsafe {
            std::slice::from_raw_parts(value.as_ptr() as *const u8, value.len() * 2)
        };
        let result = unsafe {
            RegSetValueExW(
                key,
                name.as_ptr(),
                0,
                REG_SZ,
                bytes.as_ptr(),
                bytes.len() as u32,
            )
        };
        unsafe {
            RegCloseKey(key);
        }
        if result != 0 {
            return Err(format!("Could not enable startup for Aether ({result})."));
        }
        Ok(())
    }

    fn remove() -> Result<(), String> {
        let subkey = wide(RUN_KEY);
        let name = wide(VALUE_NAME);
        let mut key: HKEY = null_mut();

        let open = unsafe {
            RegOpenKeyExW(
                HKEY_CURRENT_USER,
                subkey.as_ptr(),
                0,
                KEY_SET_VALUE,
                &mut key,
            )
        };
        if open != 0 {
            // No Run key at all means Aether is already disabled.
            return Ok(());
        }

        let result = unsafe { RegDeleteValueW(key, name.as_ptr()) };
        unsafe {
            RegCloseKey(key);
        }
        // 2 = ERROR_FILE_NOT_FOUND, i.e. the value was already absent.
        if result != 0 && result != 2 {
            return Err(format!("Could not disable startup for Aether ({result})."));
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn is_enabled() -> Result<bool, String> {
        Ok(false)
    }

    pub fn set_enabled(_enabled: bool) -> Result<(), String> {
        Err("Start on startup is only implemented on Windows.".into())
    }
}

#[tauri::command]
pub fn get_autostart() -> Result<bool, String> {
    platform::is_enabled()
}

#[tauri::command]
pub fn set_autostart(enabled: bool) -> Result<(), String> {
    platform::set_enabled(enabled)
}
