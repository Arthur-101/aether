/**
 * Aether WebSocket Hook
 * Maintains a resilient connection to ws://127.0.0.1:8765/ws with auto-reconnect.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppConfig,
  AttachmentItem,
  AudioOutputDevice,
  BluetoothDeviceInfo,
  ChatTurn,
  ClockAlert,
  DisplayInfo,
  IncomingEnvelope,
  MediaSnapshot,
  ModelStatus,
  OutgoingEvent,
  RadialWheelCursor,
  RadialWheelDropPayload,
  RadialWheelPayload,
  ScreenSample,
  SessionItem,
  ScheduledTask,
  SpeedTestResult,
  SystemStats,
  TaskbarAppsState,
  VoiceState,
  WeatherSnapshot,
  WifiProfile,
} from '../types/ipc';
import type { Note, NoteMeta } from '../types/notes';
import { useBackendActions } from './useBackendActions';
import { useSocketConnection } from './useSocketConnection';

type MouseSubscriber = (x: number, y: number) => void;
const EMPTY_STATS: SystemStats = { cpu_percent: 0, ram_percent: 0, disk_percent: 0 };
export function useBackendSocket() {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [activeSessionId, setActiveSessionId] = useState('');
  const [activeSessionTitle, setActiveSessionTitle] = useState('New Session');
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatPending, setChatPending] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [notesDirectory, setNotesDirectory] = useState('');
  const [noteContentSeq, setNoteContentSeq] = useState(0);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [radialWheel, setRadialWheel] = useState<RadialWheelPayload | null>(null);
  const [wheelCursor, setWheelCursor] = useState<RadialWheelCursor | null>(null);
  const [wheelDrop, setWheelDrop] = useState<RadialWheelDropPayload | null>(null);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isCircleOpen, setIsCircleOpen] = useState(false);
  const [wifiProfiles, setWifiProfiles] = useState<WifiProfile[]>([]);
  const [bluetoothDevices, setBluetoothDevices] = useState<BluetoothDeviceInfo[]>([]);
  const [clockAlert, setClockAlert] = useState<ClockAlert | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [taskbarState, setTaskbarState] = useState<TaskbarAppsState | null>(null);
  const [media, setMedia] = useState<MediaSnapshot | null>(null);
  const [audioDevices, setAudioDevices] = useState<AudioOutputDevice[]>([]);
  const [displayInfo, setDisplayInfo] = useState<DisplayInfo | null>(null);
  const [screenSample, setScreenSample] = useState<ScreenSample | null>(null);
  const [speedTest, setSpeedTest] = useState<SpeedTestResult | null>(null);
  const [lastWheelResult, setLastWheelResult] = useState<string | null>(null);
  const mouseListenersRef = useRef<Set<MouseSubscriber>>(new Set());

  const subscribeMouse = useCallback((cb: MouseSubscriber) => {
    mouseListenersRef.current.add(cb);
    return () => mouseListenersRef.current.delete(cb);
  }, []);

  const { connected, sendEvent } = useSocketConnection((raw) => {
    try {
      const envelope: IncomingEnvelope = JSON.parse(raw);
      const { type, payload } = envelope;

      switch (type) {
        case 'VOICE_STATE':
          setVoiceState(payload.state || 'idle');
          setVoiceTranscript(payload.transcript || '');
          break;
        case 'SHOW_RADIAL_WHEEL':
        case 'RADIAL_WHEEL_OPEN':
          setRadialWheel(payload);
          setWheelCursor({ x: payload.x, y: payload.y });
          setWheelDrop(null);
          break;
        case 'RADIAL_WHEEL_MOVE':
          setWheelCursor({ x: payload.cursor_x, y: payload.cursor_y });
          break;
        case 'RADIAL_WHEEL_DROP':
          setWheelDrop({ x: payload.x, y: payload.y, id: Date.now() });
          break;
        case 'WHEEL_RESULT':
          setLastWheelResult(payload.result || payload.error || '');
          break;
        case 'FILE_ATTACHED_READY':
          setAttachments(
            (payload.attachments as AttachmentItem[] | undefined) ?? []
          );
          if (payload.session_id) setActiveSessionId(payload.session_id);
          break;
        case 'ATTACHMENTS_STATE':
          setAttachments((payload.attachments as AttachmentItem[]) || []);
          break;
        case 'FILE_ATTACH_ERROR':
          setAttachments((prev) =>
            prev.filter((item) => item.file_path !== payload.file_path)
          );
          setErrorMessage(payload.message || 'Could not attach the file.');
          break;
        case 'FILE_INGESTED':
          setLastWheelResult(payload.result || 'File ingested into memory.');
          break;
        case 'SESSION_UPDATED':
          setActiveSessionId(payload.session_id);
          setActiveSessionTitle(payload.title);
          if (payload.turn) {
            setChatHistory((prev) => [...prev, payload.turn as ChatTurn]);
          }
          setChatPending(null);
          break;
        case 'SESSION_SWITCHED':
          if (payload.session) {
            setActiveSessionId(payload.session.id);
            setActiveSessionTitle(payload.session.title);
          }
          if (payload.history) {
            setChatHistory(
              payload.history.map((h: any) => ({
                user: h.user_prompt,
                ai: h.ai_reply,
                timestamp: h.timestamp,
              }))
            );
          }
          setAttachments((payload.attachments as AttachmentItem[]) || []);
          setChatPending(null);
          break;
        case 'SESSION_DELETED':
          setSessions((prev) => prev.filter((s) => s.id !== payload.session_id));
          if (payload.session_id === activeSessionId) {
            setChatHistory([]);
            setChatPending(null);
            setAttachments([]);
            setActiveSessionId(payload.active_session_id || '');
            setActiveSessionTitle('New Session');
          }
          break;
        case 'SESSION_LIST':
          setSessions(payload.sessions || []);
          break;
        case 'TASKS_LIST':
          setTasks((payload.tasks as ScheduledTask[] | undefined) || []);
          break;
        case 'WEATHER_STATE':
          setWeather(payload as WeatherSnapshot);
          break;
        case 'TASKBAR_APPS_STATE':
          setTaskbarState(payload as TaskbarAppsState);
          break;
        case 'MEDIA_STATE':
          setMedia(payload as MediaSnapshot);
          break;
        case 'NOTES_LIST': {
          const noteList = (payload.notes as NoteMeta[] | undefined) || [];
          setNotes(noteList);
          setNotesDirectory(payload.directory || '');
          setActiveNote((prev) =>
            prev && !noteList.some((note) => note.id === prev.id) ? null : prev
          );
          break;
        }
        case 'NOTE_CONTENT':
          setActiveNote((payload.note as Note | undefined) ?? null);
          setNoteContentSeq((seq) => seq + 1);
          break;
        case 'NOTE_SAVED': {
          const saved = payload.note as Note | undefined;
          if (saved) {
            setActiveNote((prev) => {
              if (!prev || prev.id !== saved.id) return saved;
              return {
                ...prev,
                title: saved.title,
                theme: saved.theme,
                updated: saved.updated,
                pinned: saved.pinned,
                file_name: saved.file_name,
              };
            });
          }
          break;
        }
        case 'NOTE_DELETED':
          setActiveNote((prev) =>
            prev && prev.id === payload.note_id ? null : prev
          );
          break;
        case 'SYSTEM_STATS':
        case 'SYSTEM_CONTROL_CHANGED':
          setSystemStats((prev) => ({ ...(prev ?? EMPTY_STATS), ...payload }));
          break;
        case 'WIFI_PROFILES':
          setWifiProfiles((payload.profiles as WifiProfile[] | undefined) || []);
          break;
        case 'BLUETOOTH_DEVICES':
          setBluetoothDevices(
            (payload.devices as BluetoothDeviceInfo[] | undefined) || []
          );
          break;
        case 'AUDIO_DEVICES':
          setAudioDevices(
            (payload.devices as AudioOutputDevice[] | undefined) || []
          );
          break;
        case 'DISPLAY_INFO':
          setDisplayInfo(payload as DisplayInfo);
          break;
        case 'SCREEN_SAMPLE':
          setScreenSample(payload as ScreenSample);
          break;
        case 'SPEED_TEST_STATE':
          setSpeedTest((prev) => ({ ...(prev ?? { state: 'idle' }), state: payload.state }));
          break;
        case 'SPEED_TEST_RESULT':
          setSpeedTest(payload as SpeedTestResult);
          break;
        case 'MODEL_STATUS':
          setModelStatus(payload as ModelStatus);
          break;
        case 'THINKING_MODE_CHANGED':
          setThinkingMode(Boolean(payload.enabled));
          setConfig((prev) =>
            prev
              ? { ...prev, ai_provider: { ...prev.ai_provider, thinking_mode: Boolean(payload.enabled) } }
              : prev
          );
          break;
        case 'CONFIG_STATE':
          setConfig(payload as AppConfig);
          setConfigError(null);
          break;
        case 'CONFIG_UPDATED':
          setConfig((prev) => {
            if (!prev) return prev;
            const next = { ...prev } as any;
            next[payload.section] = {
              ...(next[payload.section] || {}),
              [payload.key]: payload.value,
            };
            return next as AppConfig;
          });
          break;
        case 'ERROR_CONFIG_MISSING':
          setConfigError(payload.message || 'AI engine is not configured.');
          break;
        case 'ERROR':
          setErrorMessage(payload.message || 'An error occurred.');
          break;
        case 'CLOCK_TRIGGER':
          setClockAlert({
            event: payload.event || '',
            title: payload.title || payload.event || 'Clock alarm',
            kind: payload.kind === 'alarm' ? 'alarm' : 'task',
            taskId: payload.task_id || '',
          });
          break;
        case 'CIRCLE_TO_ASK':
          setIsCircleOpen(true);
          break;
        case 'MOUSE_POSITION':
          mouseListenersRef.current.forEach((cb) => cb(payload.x, payload.y));
          break;
      }
    } catch (e) {
      console.error('WS parse error:', e);
    }
  });
  useEffect(() => {
    if (!connected) return;
    const bootTypes: OutgoingEvent['type'][] = ['LIST_SESSIONS', 'LIST_TASKS', 'GET_CONFIG', 'GET_SYSTEM_STATE', 'GET_MODEL_STATUS', 'GET_WEATHER', 'GET_TASKBAR_APPS', 'GET_MEDIA_STATE', 'LIST_AUDIO_DEVICES', 'GET_DISPLAY_INFO'];
    bootTypes.forEach((type) => sendEvent({ type, payload: {} } as OutgoingEvent));
    const weatherTimer = window.setInterval(
      () => sendEvent({ type: 'GET_WEATHER', payload: {} }),
      15 * 60 * 1000
    );
    return () => window.clearInterval(weatherTimer);
  }, [connected, sendEvent]);

  const actions = useBackendActions(sendEvent, {
    setChatHistory,
    setChatPending,
    setThinkingMode,
    setConfig,
    setAttachments,
    setSessions,
  });

  const requestScreenSample = useCallback(
    (requestId: string, radius = 10) =>
      sendEvent({
        type: 'SAMPLE_SCREEN',
        payload: { request_id: requestId, radius },
      }),
    [sendEvent]
  );

  const closeRadialWheel = useCallback(() => {
    setRadialWheel(null);
    setWheelCursor(null);
    setWheelDrop(null);
  }, []);

  const closeCircle = useCallback(() => setIsCircleOpen(false), []);
  const clearClockEvent = useCallback(() => setClockAlert(null), []);
  const clearError = useCallback(() => setErrorMessage(null), []);
  const clearConfigError = useCallback(() => setConfigError(null), []);
  const clearWheelResult = useCallback(() => setLastWheelResult(null), []);
  const refreshWeather = useCallback(
    () => sendEvent({ type: 'GET_WEATHER', payload: {} }),
    [sendEvent]
  );

  return {
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
    weather,
    taskbarState,
    media,
    audioDevices,
    displayInfo,
    screenSample,
    speedTest,
    lastWheelResult,
    subscribeMouse,
    ...actions,
    requestScreenSample,
    refreshWeather,
    closeRadialWheel,
    closeCircle,
    clearClockEvent,
    clearError,
    clearConfigError,
    clearWheelResult,
  };
}
