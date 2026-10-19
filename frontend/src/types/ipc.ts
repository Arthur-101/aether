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
  wifi?: boolean | null;
  wifi_ssid?: string;
  bluetooth?: boolean | null;
  bluetooth_device?: string;
  airplane_mode?: boolean;
  hotspot?: boolean | null;
  brightness?: number | null;
  dark_mode?: boolean;
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

export interface ToolExecution {
  name: string;
  args?: unknown;
  output?: string;
}

export interface ChatTurn {
  user: string;
  ai: string;
  timestamp?: string;
  reasoning?: string;
  tools_used?: ToolExecution[];
  error?: boolean;
}

export interface RadialWheelPayload {
  x: number;
  y: number;
  file_path: string;
  ext: string;
}

export interface RadialWheelDropPayload {
  x: number;
  y: number;
  id: number;
}

export interface RadialWheelCursor {
  x: number;
  y: number;
}

export interface AttachmentItem {
  id?: number;
  file_name: string;
  file_path: string;
  mode: 'inline' | 'rag_vector' | 'image' | 'indexing';
  chunks?: number;
  token_count?: number;
}

export interface AIProviderConfig {
  mode: 'local_gguf' | 'ollama' | 'cloud';
  local_engine?: string;
  gguf_model_path: string;
  ollama_base_url: string;
  ollama_model_name: string;
  cloud_provider: string;
  cloud_model: string;
  api_key: string;
  context_length: number;
  gpu_layers: number;
  kv_cache_type?: string;
  thinking_mode: boolean;
}

export interface VoiceConfig {
  stt_engine: string;
  stt_model_dir: string;
  tts_engine: string;
  tts_model_path: string;
  tts_voice_id: string;
  tts_speed: number;
  mic_device_index: number | null;
}

export interface HotkeysConfig {
  dictation: string;
  circle_to_ask: string;
  radial_wheel_modifier: string;
  toggle_drawer: string;
}

export interface AppConfig {
  first_run_completed?: boolean;
  ai_provider: AIProviderConfig;
  voice: VoiceConfig;
  hotkeys: HotkeysConfig;
  storage?: {
    export_directory?: string;
    auto_session_timeout_minutes?: number;
  };
}

export type OutgoingEvent =
  | { type: 'CHAT_MESSAGE'; payload: { text: string } }
  | { type: 'NEW_SESSION'; payload: Record<string, never> }
  | { type: 'SWITCH_SESSION'; payload: { session_id: string } }
  | { type: 'LIST_SESSIONS'; payload: Record<string, never> }
  | {
      type: 'WHEEL_ACTION';
      payload: { file_path: string; action: string; target?: string };
    }
  | { type: 'FILE_DROPPED_ISLAND'; payload: { file_path: string } }
  | { type: 'ATTACH_FILE'; payload: { file_path: string } }
  | { type: 'DETACH_FILE'; payload: { file_path: string } }
  | { type: 'DELETE_SESSION'; payload: { session_id: string } }
  | { type: 'TOGGLE_THINKING_MODE'; payload: { enabled: boolean } }
  | { type: 'GET_CONFIG'; payload: Record<string, never> }
  | { type: 'GET_SYSTEM_STATE'; payload: Record<string, never> }
  | { type: 'SAVE_CONFIG'; payload: { config: AppConfig } }
  | {
      type: 'UPDATE_CONFIG';
      payload: { section: string; key: string; value: any };
    }
  | { type: 'SET_VOLUME'; payload: { level: number } }
  | { type: 'SET_MUTED'; payload: { muted: boolean } }
  | { type: 'SET_BRIGHTNESS'; payload: { level: number } }
  | { type: 'TOGGLE_WIFI'; payload: { enabled?: boolean } }
  | { type: 'TOGGLE_BLUETOOTH'; payload: { enabled?: boolean } }
  | { type: 'TOGGLE_AIRPLANE_MODE'; payload: { enabled?: boolean } }
  | { type: 'TOGGLE_HOTSPOT'; payload: { enabled?: boolean } }
  | { type: 'TOGGLE_DARK_MODE'; payload: { enabled?: boolean } };

export interface IncomingEnvelope<T = any> {
  type: string;
  payload: T;
}
