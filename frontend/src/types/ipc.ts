/**
 * Aether IPC Event Definitions
 * Typed envelopes exchanged over ws://127.0.0.1:8765/ws
 */

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface SystemStats {
  cpu_percent: number;
  ram_percent: number;
  ram_used_gb?: number;
  ram_total_gb?: number;
  disk_percent: number;
  gpu_vram_gb?: number | null;
  volume?: number;
  muted?: boolean;
}

export interface SessionItem {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  last_turn_prompt?: string;
  last_turn_reply?: string;
  turn_count?: number;
}

export interface ChatTurn {
  user: string;
  ai: string;
  timestamp?: string;
}

export interface RadialWheelPayload {
  x: number;
  y: number;
  file_path: string;
  ext: string;
}

export type OutgoingEvent =
  | { type: 'CHAT_MESSAGE'; payload: { text: string } }
  | { type: 'SWITCH_SESSION'; payload: { session_id: string } }
  | { type: 'LIST_SESSIONS'; payload: Record<string, never> }
  | {
      type: 'WHEEL_ACTION';
      payload: { file_path: string; action: string; target?: string };
    }
  | { type: 'FILE_DROPPED_ISLAND'; payload: { file_path: string } }
  | { type: 'TOGGLE_THINKING_MODE'; payload: { enabled: boolean } }
  | { type: 'GET_CONFIG'; payload: Record<string, never> }
  | {
      type: 'UPDATE_CONFIG';
      payload: { section: string; key: string; value: any };
    };

export interface IncomingEnvelope<T = any> {
  type: string;
  payload: T;
}
