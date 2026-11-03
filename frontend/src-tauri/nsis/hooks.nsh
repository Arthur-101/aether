; Aether installer hooks.

!macro NSIS_HOOK_PREINSTALL
  ; Tauri waits for Aether.exe before touching files, but the bundled Python
  ; daemon is a separate process that keeps DLLs inside aether-backend\_internal
  ; mapped. Leaving it running aborts an in-place update with "Error opening
  ; file for writing". The app reaps the daemon it spawned before handing off
  ; to the updater; this also covers a manual install over a running Aether and
  ; a stale daemon the app found already listening. /T closes the llama-server
  ; and STT runtime the daemon spawned too.
  nsExec::ExecToLog 'taskkill /F /T /IM aether-backend.exe'
  Pop $0
!macroend

; The base uninstaller deliberately keeps %APPDATA%\Aether (config, notes
; index, SQLite DB). The bulky, re-downloadable parts are the models and the
; component packs (engine, voice, STT, media), so ask once at the end of an
; interactive uninstall and remove only those.
;
; Runs from the POSTUNINSTALL hook: Tauri checks/kills a running Aether before
; removing files, so llama-server cannot hold a .gguf or an engine DLL open
; while we delete. Silent, passive (/P) and update (/UPDATE) runs remove
; nothing, so an auto-update never touches user data.

!macro NSIS_HOOK_POSTUNINSTALL
  IfSilent aether_keep_user_data

  ${If} $PassiveMode = 1
    Goto aether_keep_user_data
  ${EndIf}
  ${If} $UpdateMode = 1
    Goto aether_keep_user_data
  ${EndIf}

  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete downloaded models and component packs?$\r$\n$\r$\n$APPDATA\Aether\models$\r$\n$LOCALAPPDATA\Aether\components$\r$\n$\r$\nYour settings, notes, and database are kept either way. A model can be several gigabytes to download again." IDNO aether_keep_user_data

  ; /r keeps going when a file is still locked; a partial cleanup is better
  ; than aborting the uninstall.
  RMDir /r "$APPDATA\Aether\models"
  RMDir /r "$LOCALAPPDATA\Aether\components"

  aether_keep_user_data:
!macroend