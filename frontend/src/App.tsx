import { useCallback, useEffect, useRef, useState } from 'react';
import { useBackendSocket } from './hooks/useBackendSocket';
import { useClickThrough } from './hooks/useClickThrough';
import { useTauriFileDrop } from './hooks/useTauriFileDrop';
import { DesktopIsland } from './components/Island/DesktopIsland';
import { RadialWheel } from './components/RadialWheel/RadialWheel';
import { SessionDrawer } from './components/SessionDrawer/SessionDrawer';
import { CropModal } from './components/MicroModals/CropModal';
import { AddBgModal } from './components/MicroModals/AddBgModal';
import { SettingsModal } from './components/SettingsModal/SettingsModal';
import { CircleToAsk } from './components/CircleToAsk/CircleToAsk';
import { Notifications } from './components/Notifications';
import {
  openExternalTarget,
  openSettingsPageExternal,
  placementBesideSettings,
} from './lib/externalWindows';
import { openNotesFolder as openNotesFolderFallback } from './lib/notesApi';
import type { NotesApi } from './types/notes';

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
    clockAlert,
    lastWheelResult,
    subscribeMouse,
    sendChatMessage,
    newSession,
    switchSession,
    refreshSessions,
    refreshTasks,
    loadModel,
    releaseModel,
    killApp,
    createTask,
    updateTask,
    deleteTask,
    refreshNotes,
    readNote,
    saveNote,
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
    openSettingsPage,
    closeRadialWheel,
    closeCircle,
    clearClockEvent,
    clearError,
    clearConfigError,
    clearWheelResult,
  } = useBackendSocket();

  useClickThrough(subscribeMouse, connected);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isIslandExpanded, setIsIslandExpanded] = useState(false);
  const [cropFile, setCropFile] = useState<string | null>(null);
  const [addBgFile, setAddBgFile] = useState<string | null>(null);
  const [askRequest, setAskRequest] = useState<{ id: number; filePath: string } | null>(null);
  const islandExpandedRef = useRef(false);
  const islandExpandedBeforeSettings = useRef(false);
  const settingsOpenRef = useRef(false);

  useEffect(() => {
    islandExpandedRef.current = isIslandExpanded;
  }, [isIslandExpanded]);

  useEffect(() => {
    settingsOpenRef.current = isSettingsOpen;
  }, [isSettingsOpen]);

  const openSettings = useCallback(() => {
    if (!settingsOpenRef.current) {
      islandExpandedBeforeSettings.current = islandExpandedRef.current;
      settingsOpenRef.current = true;
      setIsIslandExpanded(false);
    }
    setIsSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    settingsOpenRef.current = false;
    setIsSettingsOpen(false);
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

  const ai = config?.ai_provider;
  const engineLabel = !ai
    ? 'Connecting…'
    : ai.mode === 'ollama'
      ? `Ollama · ${ai.ollama_model_name || 'no model'}`
      : ai.mode === 'cloud'
        ? `${ai.cloud_provider || 'Cloud'} · ${ai.cloud_model || 'no model'}`
        : 'Local GGUF';

  const notesApi: NotesApi = {
    items: notes,
    current: activeNote,
    directory: notesDirectory,
    defaultTheme: config?.storage?.notes_theme || 'default',
    contentSeq: noteContentSeq,
    onList: refreshNotes,
    onRead: readNote,
    onSave: saveNote,
    onDelete: deleteNote,
    onAttach: attachNote,
  };

  return (
    <main className="relative h-screen w-screen select-none overflow-hidden bg-transparent font-sans">
      <DesktopIsland
        sessionTitle={activeSessionTitle}
        voiceState={voiceState}
        systemStats={systemStats}
        thinkingMode={thinkingMode}
        engineLabel={engineLabel}
        chatHistory={chatHistory}
        chatPending={chatPending}
        attachments={attachments}
        askRequest={askRequest}
        tasks={tasks}
        wifiProfiles={wifiProfiles}
        bluetoothDevices={bluetoothDevices}
        notes={notesApi}
        model={{ status: modelStatus, onLoad: loadModel, onRelease: releaseModel }}
        isExpanded={isIslandExpanded}
        onExpandedChange={setIsIslandExpanded}
        onToggleDrawer={() => {
          if (isDrawerOpen) {
            setIsDrawerOpen(false);
            return;
          }
          refreshSessions();
          setIsDrawerOpen(true);
        }}
        onOpenSettings={openSettings}
        onKillApp={killApp}
        onSendMessage={sendChatMessage}
        onAskFile={handleAskFile}
        onDetachFile={detachFile}
        onRefreshTasks={refreshTasks}
        onCreateTask={createTask}
        onUpdateTask={updateTask}
        onDeleteTask={deleteTask}
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
        onOpenSettingsPage={handleOpenSettingsPage}
      />

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

      <SessionDrawer
        isOpen={isDrawerOpen}
        sessions={sessions}
        activeSessionId={activeSessionId}
        attachments={attachments}
        vectorReady={connected}
        onSelectSession={(id) => {
          switchSession(id);
          setIsDrawerOpen(false);
        }}
        onNewSession={() => {
          newSession();
          setIsDrawerOpen(false);
        }}
        onDeleteSession={deleteSession}
        onClose={() => setIsDrawerOpen(false)}
      />

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
