/**
 * Aether Backend Actions
 * Typed outbound commands shared by the Island, Settings, and overlays.
 */

import { useCallback } from 'react';
import type {
  AppConfig,
  AttachmentItem,
  ChatTurn,
  MediaControlAction,
  OutgoingEvent,
  PowerAction,
  SessionItem,
  TaskInput,
} from '../types/ipc';
import type { NoteSaveInput } from '../types/notes';

type Dispatch<T> = (value: T | ((prev: T) => T)) => void;

interface ActionSetters {
  setChatHistory: Dispatch<ChatTurn[]>;
  setChatPending: Dispatch<string | null>;
  setThinkingMode: Dispatch<boolean>;
  setConfig: Dispatch<AppConfig | null>;
  setAttachments: Dispatch<AttachmentItem[]>;
  setSessions: Dispatch<SessionItem[]>;
}

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

export function useBackendActions(
  sendEvent: (event: OutgoingEvent) => void,
  setters: ActionSetters
) {
  const {
    setChatHistory,
    setChatPending,
    setThinkingMode,
    setConfig,
    setAttachments,
    setSessions,
  } = setters;

  const sendChatMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      setChatPending(text);
      sendEvent({ type: 'CHAT_MESSAGE', payload: { text } });
    },
    [sendEvent, setChatPending]
  );

  const newSession = useCallback(() => {
    setChatHistory([]);
    setChatPending(null);
    setAttachments([]);
    sendEvent({ type: 'NEW_SESSION', payload: {} });
  }, [sendEvent, setChatHistory, setChatPending, setAttachments]);

  const switchSession = useCallback(
    (sessionId: string) => {
      sendEvent({ type: 'SWITCH_SESSION', payload: { session_id: sessionId } });
    },
    [sendEvent]
  );

  const refreshSessions = useCallback(() => {
    sendEvent({ type: 'LIST_SESSIONS', payload: {} });
  }, [sendEvent]);

  const refreshTasks = useCallback(() => {
    sendEvent({ type: 'LIST_TASKS', payload: {} });
  }, [sendEvent]);

  const refreshTaskbarApps = useCallback(
    (refresh = false) =>
      sendEvent({ type: 'GET_TASKBAR_APPS', payload: refresh ? { refresh: true } : {} }),
    [sendEvent]
  );

  const launchTaskbarApp = useCallback(
    (appId: string) =>
      sendEvent({ type: 'LAUNCH_TASKBAR_APP', payload: { app_id: appId } }),
    [sendEvent]
  );

  const refreshMedia = useCallback(
    () => sendEvent({ type: 'GET_MEDIA_STATE', payload: {} }),
    [sendEvent]
  );

  const mediaControl = useCallback(
    (action: MediaControlAction) =>
      sendEvent({ type: 'MEDIA_CONTROL', payload: { action } }),
    [sendEvent]
  );

  const loadModel = useCallback(
    () => sendEvent({ type: 'LOAD_MODEL', payload: {} }),
    [sendEvent]
  );

  const releaseModel = useCallback(
    () => sendEvent({ type: 'RELEASE_MODEL', payload: {} }),
    [sendEvent]
  );

  const killApp = useCallback(
    () => sendEvent({ type: 'KILL_APP', payload: {} }),
    [sendEvent]
  );

  const createTask = useCallback(
    (payload: TaskInput) => sendEvent({ type: 'CREATE_TASK', payload }),
    [sendEvent]
  );

  const updateTask = useCallback(
    (payload: TaskInput & { task_id: string }) =>
      sendEvent({ type: 'UPDATE_TASK', payload }),
    [sendEvent]
  );

  const deleteTask = useCallback(
    (taskId: string) =>
      sendEvent({ type: 'DELETE_TASK', payload: { task_id: taskId } }),
    [sendEvent]
  );

  const completeTask = useCallback(
    (taskId: string) =>
      sendEvent({ type: 'COMPLETE_TASK', payload: { task_id: taskId } }),
    [sendEvent]
  );

  const pauseTask = useCallback(
    (taskId: string) =>
      sendEvent({ type: 'PAUSE_TASK', payload: { task_id: taskId } }),
    [sendEvent]
  );

  const resumeTask = useCallback(
    (taskId: string) =>
      sendEvent({ type: 'RESUME_TASK', payload: { task_id: taskId } }),
    [sendEvent]
  );

  const refreshNotes = useCallback(
    () => sendEvent({ type: 'LIST_NOTES', payload: {} }),
    [sendEvent]
  );

  const readNote = useCallback(
    (noteId: string) =>
      sendEvent({ type: 'READ_NOTE', payload: { note_id: noteId } }),
    [sendEvent]
  );

  const saveNote = useCallback(
    (payload: NoteSaveInput) => sendEvent({ type: 'SAVE_NOTE', payload }),
    [sendEvent]
  );

  const setNotePinned = useCallback(
    (noteId: string, pinned: boolean) =>
      sendEvent({ type: 'SET_NOTE_PIN', payload: { note_id: noteId, pinned } }),
    [sendEvent]
  );

  const deleteNote = useCallback(
    (noteId: string) =>
      sendEvent({ type: 'DELETE_NOTE', payload: { note_id: noteId } }),
    [sendEvent]
  );

  const attachNote = useCallback(
    (noteId: string) =>
      sendEvent({ type: 'ATTACH_NOTE', payload: { note_id: noteId } }),
    [sendEvent]
  );

  const triggerWheelAction = useCallback(
    (filePath: string, action: string, target?: string) => {
      sendEvent({ type: 'WHEEL_ACTION', payload: { file_path: filePath, action, target } });
    },
    [sendEvent]
  );

  const attachFile = useCallback(
    (filePath: string) => {
      setAttachments((prev) => [
        ...prev.filter((item) => item.file_path !== filePath),
        {
          file_name: fileName(filePath),
          file_path: filePath,
          mode: 'indexing',
        },
      ]);
      sendEvent({ type: 'ATTACH_FILE', payload: { file_path: filePath } });
    },
    [sendEvent, setAttachments]
  );

  const detachFile = useCallback(
    (filePath: string) => {
      setAttachments((prev) => prev.filter((item) => item.file_path !== filePath));
      sendEvent({ type: 'DETACH_FILE', payload: { file_path: filePath } });
    },
    [sendEvent, setAttachments]
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      sendEvent({ type: 'DELETE_SESSION', payload: { session_id: sessionId } });
    },
    [sendEvent, setSessions]
  );

  const toggleThinking = useCallback(
    (enabled: boolean) => {
      setThinkingMode(enabled);
      sendEvent({ type: 'TOGGLE_THINKING_MODE', payload: { enabled } });
    },
    [sendEvent, setThinkingMode]
  );

  const saveConfig = useCallback(
    (next: AppConfig) => {
      setConfig(next);
      sendEvent({ type: 'SAVE_CONFIG', payload: { config: next } });
    },
    [sendEvent, setConfig]
  );

  const updateConfigValue = useCallback(
    (section: string, key: string, value: unknown) =>
      sendEvent({ type: 'UPDATE_CONFIG', payload: { section, key, value } }),
    [sendEvent]
  );

  const setVolume = useCallback(
    (level: number) => sendEvent({ type: 'SET_VOLUME', payload: { level } }),
    [sendEvent]
  );
  const setHotkeyCapture = useCallback(
    (enabled: boolean) =>
      sendEvent({ type: 'SET_HOTKEY_CAPTURE', payload: { enabled } }),
    [sendEvent]
  );
  const setMuted = useCallback(
    (muted: boolean) => sendEvent({ type: 'SET_MUTED', payload: { muted } }),
    [sendEvent]
  );
  const setBrightness = useCallback(
    (level: number) => sendEvent({ type: 'SET_BRIGHTNESS', payload: { level } }),
    [sendEvent]
  );
  const toggleWifi = useCallback(
    (enabled?: boolean) => sendEvent({ type: 'TOGGLE_WIFI', payload: { enabled } }),
    [sendEvent]
  );
  const toggleBluetooth = useCallback(
    (enabled?: boolean) => sendEvent({ type: 'TOGGLE_BLUETOOTH', payload: { enabled } }),
    [sendEvent]
  );
  const toggleAirplaneMode = useCallback(
    (enabled?: boolean) =>
      sendEvent({ type: 'TOGGLE_AIRPLANE_MODE', payload: { enabled } }),
    [sendEvent]
  );
  const toggleHotspot = useCallback(
    (enabled?: boolean) => sendEvent({ type: 'TOGGLE_HOTSPOT', payload: { enabled } }),
    [sendEvent]
  );
  const toggleDarkMode = useCallback(
    (enabled?: boolean) => sendEvent({ type: 'TOGGLE_DARK_MODE', payload: { enabled } }),
    [sendEvent]
  );

  const refreshWifiProfiles = useCallback(
    () => sendEvent({ type: 'LIST_WIFI_PROFILES', payload: {} }),
    [sendEvent]
  );

  const connectWifi = useCallback(
    (profile: string) =>
      sendEvent({ type: 'CONNECT_WIFI', payload: { profile } }),
    [sendEvent]
  );

  const disconnectWifi = useCallback(
    () => sendEvent({ type: 'DISCONNECT_WIFI', payload: {} }),
    [sendEvent]
  );

  const refreshBluetoothDevices = useCallback(
    () => sendEvent({ type: 'LIST_BLUETOOTH_DEVICES', payload: {} }),
    [sendEvent]
  );

  const openSettingsPage = useCallback(
    (page: string) =>
      sendEvent({ type: 'OPEN_SETTINGS_PAGE', payload: { page } }),
    [sendEvent]
  );

  const refreshAudioDevices = useCallback(
    () => sendEvent({ type: 'LIST_AUDIO_DEVICES', payload: {} }),
    [sendEvent]
  );

  const setAudioDevice = useCallback(
    (deviceId: string) =>
      sendEvent({ type: 'SET_AUDIO_DEVICE', payload: { device_id: deviceId } }),
    [sendEvent]
  );

  const refreshDisplayInfo = useCallback(
    () => sendEvent({ type: 'GET_DISPLAY_INFO', payload: {} }),
    [sendEvent]
  );

  const runSpeedTest = useCallback(
    (durationSeconds: number) =>
      sendEvent({
        type: 'RUN_SPEED_TEST',
        payload: { duration_seconds: durationSeconds },
      }),
    [sendEvent]
  );

  const refreshWallpaper = useCallback(
    () => sendEvent({ type: 'GET_WALLPAPER_STATE', payload: {} }),
    [sendEvent]
  );

  const applyWallpaper = useCallback(
    (path: string) => sendEvent({ type: 'SET_WALLPAPER', payload: { path } }),
    [sendEvent]
  );

  const setWallpaperFolder = useCallback(
    (folder: string) =>
      sendEvent({
        type: 'UPDATE_CONFIG',
        payload: { section: 'wallpaper', key: 'folder', value: folder },
      }),
    [sendEvent]
  );

  const clearWallpaperRecent = useCallback(
    () => sendEvent({ type: 'CLEAR_WALLPAPER_HISTORY', payload: {} }),
    [sendEvent]
  );

  const runPowerAction = useCallback(
    (action: PowerAction, confirm = false) =>
      sendEvent({ type: 'POWER_ACTION', payload: { action, confirm } }),
    [sendEvent]
  );

  return {
    sendChatMessage,
    newSession,
    switchSession,
    refreshSessions,
    refreshTasks,
    refreshTaskbarApps,
    launchTaskbarApp,
    refreshMedia,
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
    updateConfigValue,
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
    refreshAudioDevices,
    setAudioDevice,
    refreshDisplayInfo,
    runSpeedTest,
    refreshWallpaper,
    applyWallpaper,
    setWallpaperFolder,
    clearWallpaperRecent,
    runPowerAction,
  };
}

