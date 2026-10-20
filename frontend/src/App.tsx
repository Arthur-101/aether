import { useCallback, useEffect, useState } from 'react';
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
import type { NotesApi } from './types/notes';

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
    clockEvent,
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
  const [cropFile, setCropFile] = useState<string | null>(null);
  const [addBgFile, setAddBgFile] = useState<string | null>(null);
  const [askRequest, setAskRequest] = useState<{ id: number; filePath: string } | null>(null);

  const handleAskFile = useCallback(
    (filePath: string) => {
      if (!filePath) return;
      closeRadialWheel();
      attachFile(filePath);
      setAskRequest({ id: Date.now(), filePath });
    },
    [attachFile, closeRadialWheel]
  );

  useTauriFileDrop(handleAskFile, radialWheel?.file_path ?? null);

  useEffect(() => {
    if (configError) setIsSettingsOpen(true);
  }, [configError]);

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
        notes={notesApi}
        model={{ status: modelStatus, onLoad: loadModel, onRelease: releaseModel }}
        onToggleDrawer={() => {
          if (isDrawerOpen) {
            setIsDrawerOpen(false);
            return;
          }
          refreshSessions();
          setIsDrawerOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
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
        onToggleThinking={toggleThinking}
        onSave={saveConfig}
        onHotkeyCapture={setHotkeyCapture}
        onClose={() => {
          setIsSettingsOpen(false);
          clearConfigError();
          refreshNotes();
        }}
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
        clockEvent={clockEvent}
        wheelResult={lastWheelResult}
        errorMessage={errorMessage}
        onClearClock={clearClockEvent}
        onClearWheelResult={clearWheelResult}
        onClearError={clearError}
      />
    </main>
  );
}

export default App;
