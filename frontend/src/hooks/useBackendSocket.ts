/**
 * Aether WebSocket Hook
 * Maintains a resilient connection to ws://127.0.0.1:8765/ws with auto-reconnect.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatTurn,
  IncomingEnvelope,
  OutgoingEvent,
  RadialWheelPayload,
  SessionItem,
  SystemStats,
  VoiceState,
} from '../types/ipc';

const WS_URL = 'ws://127.0.0.1:8765/ws';

export function useBackendSocket() {
  const [connected, setConnected] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [activeSessionId, setActiveSessionId] = useState('');
  const [activeSessionTitle, setActiveSessionTitle] = useState('New Session');
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [radialWheel, setRadialWheel] = useState<RadialWheelPayload | null>(null);
  const [clockEvent, setClockEvent] = useState<string | null>(null);
  const [lastWheelResult, setLastWheelResult] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const sendEvent = useCallback((event: OutgoingEvent) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        sendEvent({ type: 'LIST_SESSIONS', payload: {} });
        sendEvent({ type: 'GET_CONFIG', payload: {} });
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const envelope: IncomingEnvelope = JSON.parse(event.data);
          const { type, payload } = envelope;

          switch (type) {
            case 'VOICE_STATE':
              setVoiceState(payload.state || 'idle');
              setVoiceTranscript(payload.transcript || '');
              break;
            case 'SHOW_RADIAL_WHEEL':
              setRadialWheel(payload);
              break;
            case 'WHEEL_RESULT':
              setLastWheelResult(payload.result || payload.error || '');
              break;
            case 'SESSION_UPDATED':
              setActiveSessionId(payload.session_id);
              setActiveSessionTitle(payload.title);
              if (payload.turn) {
                setChatHistory((prev) => [...prev, payload.turn]);
              }
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
              break;
            case 'SESSION_LIST':
              setSessions(payload.sessions || []);
              break;
            case 'SYSTEM_STATS':
              setSystemStats(payload);
              break;
            case 'THINKING_MODE_CHANGED':
              setThinkingMode(Boolean(payload.enabled));
              break;
            case 'CLOCK_TRIGGER':
              setClockEvent(payload.event);
              break;
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };
    } catch {
      reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
    }
  }, [sendEvent]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendChatMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      setChatHistory((prev) => [...prev, { user: text, ai: '...' }]);
      sendEvent({ type: 'CHAT_MESSAGE', payload: { text } });
    },
    [sendEvent]
  );

  const switchSession = useCallback(
    (sessionId: string) => {
      sendEvent({ type: 'SWITCH_SESSION', payload: { session_id: sessionId } });
    },
    [sendEvent]
  );

  const refreshSessions = useCallback(() => {
    sendEvent({ type: 'LIST_SESSIONS', payload: {} });
  }, [sendEvent]);

  const triggerWheelAction = useCallback(
    (filePath: string, action: string, target?: string) => {
      sendEvent({
        type: 'WHEEL_ACTION',
        payload: { file_path: filePath, action, target },
      });
    },
    [sendEvent]
  );

  const toggleThinking = useCallback(
    (enabled: boolean) => {
      sendEvent({ type: 'TOGGLE_THINKING_MODE', payload: { enabled } });
    },
    [sendEvent]
  );

  return {
    connected,
    voiceState,
    voiceTranscript,
    activeSessionId,
    activeSessionTitle,
    chatHistory,
    sessions,
    systemStats,
    thinkingMode,
    radialWheel,
    clockEvent,
    lastWheelResult,
    sendChatMessage,
    switchSession,
    refreshSessions,
    triggerWheelAction,
    toggleThinking,
    closeRadialWheel: () => setRadialWheel(null),
    clearClockEvent: () => setClockEvent(null),
  };
}
