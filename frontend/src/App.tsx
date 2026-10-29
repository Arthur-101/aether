import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useBackendSocket } from './hooks/useBackendSocket';
import { useClickThrough } from './hooks/useClickThrough';
import { useTauriFileDrop } from './hooks/useTauriFileDrop';
import { DesktopIsland } from './components/Island/DesktopIsland';
import { RadialWheel } from './components/RadialWheel/RadialWheel';
import { CropModal } from './components/MicroModals/CropModal';
import { AddBgModal } from './components/MicroModals/AddBgModal';
import { SettingsModal, type SettingsTab } from './components/SettingsModal/SettingsModal';
import {
  RegionToAsk,
  type RegionSelection,
} from './components/RegionToAsk/RegionToAsk';
import { ScreenScale } from './components/Island/ScreenScale';
import { useDesktopWidgets } from './hooks/useDesktopWidgets';
import { useIslandOnTop } from './hooks/useIslandOnTop';
import { ColorPickerOverlay } from './components/Island/ColorPickerOverlay';
import { DEFAULT_COLOR, normalizeHex } from './components/Island/colorUtils';
import type { ScaleUnit } from './components/Island/scaleUnits';
import { Notifications } from './components/Notifications';
import {
  openExternalTarget,
  openSettingsPageExternal,
  placementBesideSettings,
} from './lib/externalWindows';
import { openNotesFolder as openNotesFolderFallback } from './lib/notesApi';
import {
  DEFAULT_CLOCK_CONFIG,
  appearanceCssVars,
  resolveAppearance,
  resolveTheme,
} from './components/Island/appearance';
import type {
  AIProviderConfig,
  AppearanceConfig,
  ClockConfig,
  MediaControlAction,
  TaskbarPinnedApp,
} from './types/ipc';
import type { NotesApi } from './types/notes';

const PICKED_COLOR_KEY = 'aether.picked_color';
const DEFAULT_PICKED_COLOR = DEFAULT_COLOR;

function readPickedColor(): string {
  try {
    return normalizeHex(
      window.localStorage.getItem(PICKED_COLOR_KEY) || DEFAULT_PICKED_COLOR,
      DEFAULT_PICKED_COLOR
    );
  } catch {
    return DEFAULT_PICKED_COLOR;
  }
}

function localIso(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

export function App() {
  const {
    connected,
    voiceState,
    voiceTranscript,
    activeSessionId,
    activeSessionTitle,
    chatHistory,
    chatPending,
    chatDraft,
    activeToolCalls,
    toolApproval,
    sessions,
    tasks,
    weather,
    taskbarState,
    media,
    notes,
    activeNote,
    notesDirectory,
    noteContentSeq,
    modelStatus,
    systemStats,
    thinkingMode,
    config,
    configError,
    spotifyAuth,
    toolGroups,
    errorMessage,
    radialWheel,
    wheelCursor,
    wheelDrop,
    attachments,
    isRegionOpen,
    regionCapture,
    regionCaptureError,
    wifiProfiles,
    bluetoothDevices,
    audioDevices,
    displayInfo,
    screenSample,
    speedTest,
    wallpaperState,
    powerResult,
    clockAlert,
    lastWheelResult,
    openIslandRequest,
    subscribeMouse,
    requestScreenSample,
    sendChatMessage,
    resolveToolApproval,
    newSession,
    switchSession,
    refreshSessions,
    refreshTasks,
    refreshTaskbarApps,
    launchTaskbarApp,
    mediaControl,
    loadModel,
    releaseModel,
    killApp,
    createTask,
    updateTask,
    deleteTask,
    completeTask,
    pauseTask,
    resumeTask,
    refreshWeather,
    updateConfigValue,
    refreshSpotify,
    refreshToolGroups,
    connectSpotify,
    disconnectSpotify,
    refreshNotes,
    readNote,
    saveNote,
    setNotePinned,
    deleteNote,
    attachNote,
    triggerWheelAction,
    attachFile,
    detachFile,
    captureRegion,
    deleteSession,
    toggleThinking,
    saveConfig,
    setVolume,
    setHotkeyCapture,
    setMuted,
    setBrightness,
    toggleWifi,
    toggleBluetooth,
    toggleAirplaneMode,
    toggleHotspot,
    toggleDarkMode,
    refreshWifiProfiles,
    connectWifi,
    disconnectWifi,
    refreshBluetoothDevices,
    refreshAudioDevices,
    setAudioDevice,
    runSpeedTest,
    refreshWallpaper,
    applyWallpaper,
    setWallpaperFolder,
    clearWallpaperRecent,
    runPowerAction,
    openSettingsPage,
    closeRadialWheel,
    closeRegion,
    clearClockEvent,
    clearError,
    clearConfigError,
    clearWheelResult,
  } = useBackendSocket();

  useClickThrough(subscribeMouse, connected);

  const showMainWindow = useCallback(async () => {
    if (!isTauri()) return;
    const appWindow = getCurrentWindow();
    try {
      await appWindow.show();
      await appWindow.setFocus();
    } catch (error) {
      console.warn('Could not restore the Aether overlay:', error);
    }
  }, []);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | null>(null);
  const [isIslandExpanded, setIsIslandExpanded] = useState(false);
  const [cropFile, setCropFile] = useState<string | null>(null);
  const [addBgFile, setAddBgFile] = useState<string | null>(null);
  const [askRequest, setAskRequest] = useState<{ id: number; filePath: string } | null>(null);
  const [scaleUnit, setScaleUnit] = useState<ScaleUnit | null>(null);
  const [pickedColor, setPickedColor] = useState<string>(readPickedColor);
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [notificationHeight, setNotificationHeight] = useState(0);
  const handleNotificationHeight = useCallback((height: number) => {
    setNotificationHeight((previous) =>
      Math.abs(previous - height) > 1 ? height : previous
    );
  }, []);
  const islandExpandedRef = useRef(false);
  const islandExpandedBeforeSettings = useRef(false);
  const settingsOpenRef = useRef(false);
  const regionRestoreTimer = useRef<number | null>(null);
  const appliedGeneralRef = useRef('');
  const [previewAppearance, setPreviewAppearance] = useState<AppearanceConfig | null>(
    null
  );
  const appearance = useMemo(
    () => resolveAppearance(config?.appearance),
    [config?.appearance]
  );
  // While Settings is open the draft appearance drives the live surfaces so the
  // opacity and blur sliders can be previewed before saving.
  const liveAppearance = previewAppearance ?? appearance;
  const clockConfig = useMemo(
    () => ({ ...DEFAULT_CLOCK_CONFIG, ...(config?.clock || {}) }),
    [config?.clock]
  );
  const taskbarApps = useMemo<TaskbarPinnedApp[]>(
    () => taskbarState?.apps ?? [],
    [taskbarState?.apps]
  );
  const saveWeather = useCallback(
    (patch: Partial<ClockConfig>) => {
      Object.entries(patch).forEach(([key, value]) =>
        updateConfigValue('clock', key, value)
      );
    },
    [updateConfigValue]
  );

  useEffect(() => {
    islandExpandedRef.current = isIslandExpanded;
  }, [isIslandExpanded]);

  useEffect(() => {
    settingsOpenRef.current = isSettingsOpen;
  }, [isSettingsOpen]);

  // Global Open Island shortcut. Restore and focus the overlay first so it can
  // receive typing even after the user hid it from the system tray.
  useEffect(() => {
    if (!openIslandRequest || settingsOpenRef.current) return;
    void showMainWindow();
    setIsIslandExpanded(true);
  }, [openIslandRequest, showMainWindow]);

  // Region to Ask is also reachable while the overlay is hidden in the tray.
  useEffect(() => {
    if (!isRegionOpen) return;
    void showMainWindow();
  }, [isRegionOpen, showMainWindow]);

  // Keep the OS integrations in sync with the saved General settings. The
  // signature guard avoids rewriting the registry when unrelated config
  // sections change.
  useEffect(() => {
    const general = config?.general;
    if (!isTauri() || !general) return;
    const signature = `${general.start_on_startup}:${general.show_tray_icon}`;
    if (appliedGeneralRef.current === signature) return;
    appliedGeneralRef.current = signature;
    void invoke('set_autostart', {
      enabled: Boolean(general.start_on_startup),
    }).catch((error) => console.error('Could not update startup setting:', error));
    void invoke('set_tray_visible', {
      visible: general.show_tray_icon !== false,
    }).catch((error) => console.error('Could not update tray visibility:', error));
  }, [config?.general]);

  useEffect(
    () => () => {
      if (regionRestoreTimer.current !== null) {
        window.clearTimeout(regionRestoreTimer.current);
      }
    },
    []
  );

  const showSettings = useCallback((tab: SettingsTab | null) => {
    if (!settingsOpenRef.current) {
      islandExpandedBeforeSettings.current = islandExpandedRef.current;
      settingsOpenRef.current = true;
      setIsIslandExpanded(false);
    }
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  }, []);

  const openSettings = useCallback(() => showSettings(null), [showSettings]);

  // Native tray actions are emitted by the Rust shell.
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen('aether:open-settings', () => {
      if (!disposed) showSettings(null);
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [showSettings]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen('aether:quit', () => {
      if (!disposed) killApp();
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [killApp]);

  const openTaskbarSettings = useCallback(
    () => showSettings('appearance'),
    [showSettings]
  );

  const handleLaunchTaskbarApp = useCallback(
    (app: TaskbarPinnedApp) => launchTaskbarApp(app.id),
    [launchTaskbarApp]
  );

  const handleMediaControl = useCallback(
    (action: MediaControlAction) => mediaControl(action),
    [mediaControl]
  );

  // Quick Chat's engine chip rotates the same backends the AI settings expose,
  // so a backend swap does not require opening Settings.
  const handleCycleBackend = useCallback(() => {
    if (!config) return;
    const ai = config.ai_provider;
    const nextMode: AIProviderConfig['mode'] =
      ai.mode === 'local_gguf' ? 'ollama' : ai.mode === 'ollama' ? 'cloud' : 'local_gguf';
    saveConfig({ ...config, ai_provider: { ...ai, mode: nextMode } });
  }, [config, saveConfig]);

  const closeSettings = useCallback(() => {
    settingsOpenRef.current = false;
    setIsSettingsOpen(false);
    setSettingsInitialTab(null);
    clearConfigError();
    refreshNotes();
    if (islandExpandedBeforeSettings.current) {
      setIsIslandExpanded(true);
    }
    islandExpandedBeforeSettings.current = false;
  }, [clearConfigError, refreshNotes]);

  const handleOpenSettingsPage = useCallback(
    (page: string) => {
      setIsIslandExpanded(false);
      void openSettingsPageExternal(page).then((opened) => {
        if (!opened) openSettingsPage(page);
      });
    },
    [openSettingsPage]
  );

  const handleOpenNotesFolder = useCallback((path: string) => {
    setIsIslandExpanded(false);
    if (!path) {
      void openNotesFolderFallback();
      return;
    }
    const placement = placementBesideSettings();
    void openExternalTarget(path, placement).then((opened) => {
      if (!opened) void openNotesFolderFallback();
    });
  }, []);

  const handleAskFile = useCallback(
    (filePath: string) => {
      if (!filePath) return;
      closeRadialWheel();
      attachFile(filePath);
      setAskRequest({ id: Date.now(), filePath });
    },
    [attachFile, closeRadialWheel]
  );

  /**
   * Converts the CSS selection into absolute physical pixels, hides the
   * transparent overlay so it is not baked into the screenshot, then asks the
   * Python daemon to capture and attach the region.
   */
  const handleRegionCapture = useCallback(
    async (bbox: RegionSelection) => {
      closeRegion();
      setIsIslandExpanded(false);
      const appWindow = getCurrentWindow();
      let origin = { x: 0, y: 0 };
      let scale = 1;

      if (isTauri()) {
        try {
          const position = await appWindow.outerPosition();
          origin = { x: position.x, y: position.y };
          scale = await appWindow.scaleFactor();
          await appWindow.hide();
        } catch (error) {
          console.warn('Could not hide the overlay before capture:', error);
        }
        // Let the compositor remove the selection highlight before mss grabs.
        await new Promise((resolve) => window.setTimeout(resolve, 140));
      }

      captureRegion({
        x: Math.round(origin.x + bbox.x1 * scale),
        y: Math.round(origin.y + bbox.y1 * scale),
        width: Math.max(1, Math.round((bbox.x2 - bbox.x1) * scale)),
        height: Math.max(1, Math.round((bbox.y2 - bbox.y1) * scale)),
      });

      if (regionRestoreTimer.current !== null) {
        window.clearTimeout(regionRestoreTimer.current);
      }
      regionRestoreTimer.current = window.setTimeout(() => {
        regionRestoreTimer.current = null;
        void showMainWindow();
      }, 6000);
    },
    [captureRegion, closeRegion, showMainWindow]
  );

  useEffect(() => {
    if (!regionCapture) return;
    if (regionRestoreTimer.current !== null) {
      window.clearTimeout(regionRestoreTimer.current);
      regionRestoreTimer.current = null;
    }
    void showMainWindow();
    // The daemon already attached the image; only the Quick Chat focus request
    // is needed here.
    setAskRequest({ id: regionCapture.id, filePath: regionCapture.filePath });
  }, [regionCapture, showMainWindow]);

  useEffect(() => {
    if (!regionCaptureError) return;
    if (regionRestoreTimer.current !== null) {
      window.clearTimeout(regionRestoreTimer.current);
      regionRestoreTimer.current = null;
    }
    void showMainWindow();
  }, [regionCaptureError, showMainWindow]);

  const openScale = useCallback((unit: ScaleUnit) => {
    setIsIslandExpanded(false);
    setScaleUnit(unit);
  }, []);

  const openColorPicker = useCallback(() => {
    if (!connected) return;
    setIsIslandExpanded(false);
    setIsPickingColor(true);
  }, [connected]);

  const closeColorPicker = useCallback(() => {
    setIsPickingColor(false);
    setIsIslandExpanded(true);
  }, []);

  const setColor = useCallback((hex: string) => {
    const value = normalizeHex(hex, DEFAULT_PICKED_COLOR);
    setPickedColor(value);
    try {
      window.localStorage.setItem(PICKED_COLOR_KEY, value);
    } catch {
      // A locked-down WebView may reject storage; the session still works.
    }
  }, []);

  const applyPickedColor = useCallback(
    (hex: string) => {
      setColor(hex);
      setIsPickingColor(false);
      setIsIslandExpanded(true);
    },
    [setColor]
  );

  const snoozeAlarm = useCallback(() => {
    if (!clockAlert) return;
    createTask({
      prompt: clockAlert.title,
      schedule_type: 'once',
      is_recurring: false,
      kind: 'alarm',
      run_at_iso: localIso(new Date(Date.now() + 5 * 60 * 1000)),
    });
    clearClockEvent();
  }, [clockAlert, createTask, clearClockEvent]);

  useTauriFileDrop(handleAskFile, radialWheel?.file_path ?? null);

  useEffect(() => {
    if (configError) openSettings();
  }, [configError, openSettings]);

  const notesApi: NotesApi = {
    items: notes,
    current: activeNote,
    directory: notesDirectory,
    defaultTheme: config?.storage?.notes_theme || 'default',
    contentSeq: noteContentSeq,
    onList: refreshNotes,
    onRead: readNote,
    onSave: saveNote,
    onSetPinned: setNotePinned,
    onDelete: deleteNote,
    onAttach: attachNote,
  };

  const resolvedTheme = resolveTheme(
    liveAppearance.theme_mode,
    systemStats?.dark_mode
  );
  const brandName = (config?.brand_name ?? '').trim() || 'Aether';

  // Desktop widgets live in their own native windows; this hook owns the list,
  // the windows that mirror it, and the state those windows render from.
  const desktopWidgets = useDesktopWidgets({
    appearance: liveAppearance,
    theme: resolvedTheme,
    timeFormat: liveAppearance.time_format,
    media,
    audioDevices,
    wallpaper:
      (wallpaperState?.recent.find((item) => item.is_current) ??
        wallpaperState?.recent[0])?.thumbnail ?? null,
    onMediaControl: handleMediaControl,
  });

  // Re-asserts the island's topmost-band placement every few seconds, since
  // activating another topmost window re-orders within the band and can bury
  // everything.
  useIslandOnTop();

  // The overlay window stays wrapped around the idle pill. Anything that
  // paints beyond the pill — the expanded island, Settings, the wheel, region
  // capture, or modals — needs the full monitor back. The bounds hook grows the
  // window immediately and only shrinks it after the closing animation.
  const notificationsActive =
    !connected ||
    voiceState !== 'idle' ||
    Boolean(clockAlert) ||
    Boolean(lastWheelResult) ||
    Boolean(errorMessage);

  const overlayFullScreen =
    isIslandExpanded ||
    isSettingsOpen ||
    Boolean(radialWheel) ||
    Boolean(cropFile) ||
    Boolean(addBgFile) ||
    Boolean(scaleUnit) ||
    isPickingColor ||
    isRegionOpen;

  return (
    <main
      // Aether follows the Windows theme by default, so the overlay, the
      // island, and Settings all flip together with the desktop. An
      // explicit choice in Settings → Appearance overrides it.
      data-theme={resolvedTheme}
      className="relative h-screen w-screen select-none overflow-hidden bg-transparent font-sans"
      // Root-level appearance vars so surfaces outside the notch shell
      // (notification pills) share the same grain and pop depth.
      style={appearanceCssVars(liveAppearance, resolvedTheme) as React.CSSProperties}
    >
      <DesktopIsland
        systemStats={systemStats}
        speedTest={speedTest}
        onRunSpeedTest={runSpeedTest}
        wallpaperState={wallpaperState}
        powerResult={powerResult}
        onRefreshWallpaper={refreshWallpaper}
        onApplyWallpaper={applyWallpaper}
        onSetWallpaperFolder={setWallpaperFolder}
        onClearWallpaperRecent={clearWallpaperRecent}
        onPowerAction={runPowerAction}
        chatHistory={chatHistory}
        chatPending={chatPending}
        chatDraft={chatDraft}
        activeToolCalls={activeToolCalls}
        toolApproval={toolApproval}
        onResolveToolApproval={resolveToolApproval}
        attachments={attachments}
        sessions={sessions}
        activeSessionId={activeSessionId}
        activeSessionTitle={activeSessionTitle}
        askRequest={askRequest}
        openIslandRequest={openIslandRequest}
        tasks={tasks}
        weather={weather}
        clockConfig={clockConfig}
        wifiProfiles={wifiProfiles}
        bluetoothDevices={bluetoothDevices}
        audioDevices={audioDevices}
        displayInfo={displayInfo}
        notes={notesApi}
        model={{ status: modelStatus, onLoad: loadModel, onRelease: releaseModel }}
        aiConfig={config?.ai_provider}
        thinkingMode={thinkingMode}
        vectorReady={connected}
        isExpanded={isIslandExpanded}
        onExpandedChange={setIsIslandExpanded}
        onSelectSession={switchSession}
        onNewSession={newSession}
        onDeleteSession={deleteSession}
        onRefreshSessions={refreshSessions}
        onToggleThinking={toggleThinking}
        onCycleBackend={handleCycleBackend}
        onOpenSettings={openSettings}
        onKillApp={killApp}
        onSendMessage={sendChatMessage}
        onAskFile={handleAskFile}
        onDetachFile={detachFile}
        onRefreshTasks={refreshTasks}
        onCreateTask={createTask}
        onUpdateTask={updateTask}
        onDeleteTask={deleteTask}
        onCompleteTask={completeTask}
        onPauseTask={pauseTask}
        onResumeTask={resumeTask}
        onSaveWeather={saveWeather}
        onRefreshWeather={refreshWeather}
        onSetVolume={setVolume}
        onSetMuted={setMuted}
        onSetBrightness={setBrightness}
        onToggleWifi={toggleWifi}
        onToggleBluetooth={toggleBluetooth}
        onToggleAirplaneMode={toggleAirplaneMode}
        onToggleHotspot={toggleHotspot}
        onToggleDarkMode={toggleDarkMode}
        onRefreshWifiProfiles={refreshWifiProfiles}
        onConnectWifi={connectWifi}
        onDisconnectWifi={disconnectWifi}
        onRefreshBluetoothDevices={refreshBluetoothDevices}
        onRefreshAudioDevices={refreshAudioDevices}
        onSelectAudioDevice={setAudioDevice}
        onOpenSettingsPage={handleOpenSettingsPage}
        onOpenScale={openScale}
        pickedColor={pickedColor}
        colorPickerConnected={connected}
        onOpenColorPicker={openColorPicker}
        onSetColor={setColor}
        hidden={isPickingColor}
        autoHideSuspended={isSettingsOpen}
        overlayFullScreen={overlayFullScreen}
        notificationActive={notificationsActive}
        notificationHeight={notificationHeight}
        connected={connected}
        subscribeMouse={subscribeMouse}
        brandName={brandName}
        appearance={liveAppearance}
        hotkeys={config?.hotkeys}
        peekEnabled={!isSettingsOpen}
        media={media}
        taskbarApps={taskbarApps}
        onLaunchTaskbarApp={handleLaunchTaskbarApp}
        onManageTaskbarApps={openTaskbarSettings}
        onMediaControl={handleMediaControl}
        widgets={desktopWidgets}
      />

      {isIslandExpanded && appearance.close_on_outside_click ? (
        <div
          data-aether-interactive
          aria-hidden
          className="fixed inset-0 z-40"
          onClick={() => setIsIslandExpanded(false)}
        />
      ) : null}

      {radialWheel && (
        <RadialWheel
          data={radialWheel}
          cursor={wheelCursor}
          dropPoint={wheelDrop}
          onAction={triggerWheelAction}
          onAsk={handleAskFile}
          onOpenCrop={(filePath) => setCropFile(filePath)}
          onOpenAddBg={(filePath) => setAddBgFile(filePath)}
          onClose={closeRadialWheel}
        />
      )}

      <CropModal
        isOpen={Boolean(cropFile)}
        filePath={cropFile || ''}
        onApply={(filePath, width, height, ratio, x, y) => {
          triggerWheelAction(
            filePath,
            'CROP',
            JSON.stringify({ x, y, w: width, h: height, ratio })
          );
          setCropFile(null);
        }}
        onClose={() => setCropFile(null)}
      />

      <AddBgModal
        isOpen={Boolean(addBgFile)}
        filePath={addBgFile || ''}
        onSave={(filePath, bg, pad, crn, shd) => {
          triggerWheelAction(filePath, 'ADD_BG', JSON.stringify({ bg, pad, crn, shd }));
          setAddBgFile(null);
        }}
        onClose={() => setAddBgFile(null)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        thinkingMode={thinkingMode}
        config={config}
        configError={configError}
        spotifyAuth={spotifyAuth}
        notesDirectory={notesDirectory}
        onToggleThinking={toggleThinking}
        onSave={saveConfig}
        onHotkeyCapture={setHotkeyCapture}
        onOpenNotesFolder={handleOpenNotesFolder}
        onSpotifyConnect={connectSpotify}
        onSpotifyDisconnect={disconnectSpotify}
        onSpotifyRefresh={refreshSpotify}
        toolGroups={toolGroups}
        onRefreshToolGroups={refreshToolGroups}
        taskbarState={taskbarState}
        widgets={desktopWidgets.widgets}
        onWidgetAppearanceChange={desktopWidgets.setWidgetAppearance}
        onResetWidgetAppearance={desktopWidgets.resetWidgetAppearance}
        onWidgetAlwaysOnTopChange={desktopWidgets.setWidgetAlwaysOnTop}
        initialTab={settingsInitialTab}
        onRefreshTaskbar={refreshTaskbarApps}
        onPreviewAppearance={setPreviewAppearance}
        onClose={closeSettings}
      />

      <RegionToAsk
        isOpen={isRegionOpen}
        onCapture={(bbox) => {
          void handleRegionCapture(bbox);
        }}
        onClose={closeRegion}
      />

      {scaleUnit ? (
        <ScreenScale
          initialUnit={scaleUnit}
          displayInfo={displayInfo}
          onClose={() => setScaleUnit(null)}
        />
      ) : null}

      {isPickingColor ? (
        <ColorPickerOverlay
          sample={screenSample}
          connected={connected}
          requestSample={requestScreenSample}
          onPick={applyPickedColor}
          onCancel={closeColorPicker}
        />
      ) : null}

      <Notifications
        connected={connected}
        voiceState={voiceState}
        voiceTranscript={voiceTranscript}
        clockAlert={clockAlert}
        wheelResult={lastWheelResult}
        errorMessage={errorMessage}
        onClearClock={clearClockEvent}
        onSnoozeAlarm={snoozeAlarm}
        onClearWheelResult={clearWheelResult}
        onClearError={clearError}
        compact={!overlayFullScreen}
        onHeightChange={handleNotificationHeight}
      />
    </main>
  );
}

export default App;



