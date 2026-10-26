import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useBackendSocket } from './hooks/useBackendSocket';
import { useClickThrough } from './hooks/useClickThrough';
import { useTauriFileDrop } from './hooks/useTauriFileDrop';
import { DesktopIsland } from './components/Island/DesktopIsland';
import { RadialWheel } from './components/RadialWheel/RadialWheel';
import { CropModal } from './components/MicroModals/CropModal';
import { AddBgModal } from './components/MicroModals/AddBgModal';
import { SettingsModal, type SettingsTab } from './components/SettingsModal/SettingsModal';
import { CircleToAsk } from './components/CircleToAsk/CircleToAsk';
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
    errorMessage,
    radialWheel,
    wheelCursor,
    wheelDrop,
    attachments,
    isCircleOpen,
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
    refreshNotes,
    readNote,
    saveNote,
    setNotePinned,
    deleteNote,
    attachNote,
    triggerWheelAction,
    attachFile,
    detachFile,
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
    closeCircle,
    clearClockEvent,
    clearError,
    clearConfigError,
    clearWheelResult,
  } = useBackendSocket();

  useClickThrough(subscribeMouse, connected);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | null>(null);
  const [isIslandExpanded, setIsIslandExpanded] = useState(false);
  const [cropFile, setCropFile] = useState<string | null>(null);
  const [addBgFile, setAddBgFile] = useState<string | null>(null);
  const [askRequest, setAskRequest] = useState<{ id: number; filePath: string } | null>(null);
  const [scaleUnit, setScaleUnit] = useState<ScaleUnit | null>(null);
  const [pickedColor, setPickedColor] = useState<string>(readPickedColor);
  const [isPickingColor, setIsPickingColor] = useState(false);
  const islandExpandedRef = useRef(false);
  const islandExpandedBeforeSettings = useRef(false);
  const settingsOpenRef = useRef(false);
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

  // Global Open Island shortcut. Focus the overlay first so the composer can
  // actually receive typing when Aether was summoned from another app.
  useEffect(() => {
    if (!openIslandRequest || settingsOpenRef.current) return;
    if (isTauri()) {
      void getCurrentWindow().setFocus().catch(() => undefined);
    }
    setIsIslandExpanded(true);
  }, [openIslandRequest]);

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
        onApply={(filePath, width, height, ratio) => {
          triggerWheelAction(filePath, 'CROP', `${width}x${height}_${ratio}`);
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
        notesDirectory={notesDirectory}
        onToggleThinking={toggleThinking}
        onSave={saveConfig}
        onHotkeyCapture={setHotkeyCapture}
        onOpenNotesFolder={handleOpenNotesFolder}
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

      <CircleToAsk
        isOpen={isCircleOpen}
        onCapture={(bbox) => {
          sendChatMessage(
            `Circle to ask on region: (${bbox.x1}, ${bbox.y1}) to (${bbox.x2}, ${bbox.y2})`
          );
        }}
        onClose={closeCircle}
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
      />
    </main>
  );
}

export default App;



