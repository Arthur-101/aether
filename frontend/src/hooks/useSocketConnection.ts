/**
 * Aether WebSocket Transport
 * Resilient ws://127.0.0.1:8765/ws connection with exponential-free auto-reconnect.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OutgoingEvent } from '../types/ipc';

const WS_URL = 'ws://127.0.0.1:8765/ws';

export function useSocketConnection(onMessage: (raw: string) => void) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  const connectRef = useRef<() => void>(() => undefined);

  onMessageRef.current = onMessage;

  const sendEvent = useCallback((event: OutgoingEvent) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  const connect = useCallback(() => {
    disposedRef.current = false;
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onclose = () => {
        if (wsRef.current !== ws || disposedRef.current) return;
        setConnected(false);
        wsRef.current = null;
        reconnectTimeoutRef.current = window.setTimeout(
          () => connectRef.current(),
          2000
        );
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (event) => onMessageRef.current(event.data);
    } catch {
      if (disposedRef.current) return;
      reconnectTimeoutRef.current = window.setTimeout(
        () => connectRef.current(),
        3000
      );
    }
  }, []);

  connectRef.current = connect;

  useEffect(() => {
    connect();
    return () => {
      disposedRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        ws.close();
      }
    };
  }, [connect]);

  return { connected, sendEvent };
}
