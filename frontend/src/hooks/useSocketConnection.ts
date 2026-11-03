/**
 * Aether WebSocket Transport
 * Resilient ws://127.0.0.1:8765/ws connection with exponential-free auto-reconnect.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OutgoingEvent } from '../types/ipc';

const WS_URL = 'ws://127.0.0.1:8765/ws';

// A send that lands while the socket is down must not disappear. The Island
// paints its optimistic state first (a "Thinking..." bubble), and only a reply
// clears it, so a dropped envelope used to strand the UI forever. Queue it and
// flush the moment the socket reopens.
const MAX_QUEUED_EVENTS = 200;

function flushQueue(ws: WebSocket, queue: OutgoingEvent[]) {
  if (!queue.length) return;
  const pending = queue.splice(0, queue.length);
  for (const event of pending) {
    try {
      ws.send(JSON.stringify(event));
    } catch {
      // Socket died mid-flush; keep the rest for the next connection.
      queue.push(event);
    }
  }
}

export function useSocketConnection(onMessage: (raw: string) => void) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  const connectRef = useRef<() => void>(() => undefined);
  const queueRef = useRef<OutgoingEvent[]>([]);

  onMessageRef.current = onMessage;

  const sendEvent = useCallback((event: OutgoingEvent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(event));
        return;
      } catch {
        // The socket died between the check and the send; queue it instead.
      }
    }
    const queue = queueRef.current;
    queue.push(event);
    if (queue.length > MAX_QUEUED_EVENTS) {
      queue.splice(0, queue.length - MAX_QUEUED_EVENTS);
    }
  }, []);

  const connect = useCallback(() => {
    disposedRef.current = false;
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        flushQueue(ws, queueRef.current);
      };

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
