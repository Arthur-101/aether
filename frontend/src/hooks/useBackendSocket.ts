/**
 * Aether WebSocket Hook
 * Maintains a resilient connection to ws://127.0.0.1:8765/ws with auto-reconnect.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppConfig,
  AttachmentItem,
  ChatTurn,
  IncomingEnvelope,
  RadialWheelCursor,
  RadialWheelDropPayload,
  RadialWheelPayload,
  SessionItem,
  SystemStats,
  VoiceState,
} from '../types/ipc';
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
  const [clockEvent, setClockEvent] = useState<string | null>(null);
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
        case 'SYSTEM_STATS':
          setSystemStats((prev) => ({ ...(prev ?? EMPTY_STATS), ...payload }));
          break;
        case 'SYSTEM_CONTROL_CHANGED':
          setSystemStats((prev) => ({ ...(prev ?? EMPTY_STATS), ...payload }));
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
          setClockEvent(payload.event);
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
    sendEvent({ type: 'LIST_SESSIONS', payload: {} });
    sendEvent({ type: 'GET_CONFIG', payload: {} });
    sendEvent({ type: 'GET_SYSTEM_STATE', payload: {} });
  }, [connected, sendEvent]);

  const actions = useBackendActions(sendEvent, {
    setChatHistory,
    setChatPending,
    setThinkingMode,
    setConfig,
    setAttachments,
    setSessions,
  });

  const closeRadialWheel = useCallback(() => {
    setRadialWheel(null);
    setWheelCursor(null);
    setWheelDrop(null);
  }, []);

  const closeCircle = useCallback(() => setIsCircleOpen(false), []);
  const clearClockEvent = useCallback(() => setClockEvent(null), []);
  const clearError = useCallback(() => setErrorMessage(null), []);
  const clearConfigError = useCallback(() => setConfigError(null), []);
  const clearWheelResult = useCallback(() => setLastWheelResult(null), []);

  return {
    connected,
    voiceState,
    voiceTranscript,
    activeSessionId,
    activeSessionTitle,
    chatHistory,
    chatPending,
    sessions,
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
    ...actions,
    closeRadialWheel,
    closeCircle,
    clearClockEvent,
    clearError,
    clearConfigError,
    clearWheelResult,
  };
}
