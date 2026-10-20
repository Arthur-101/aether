/**
 * Aether IPC Event Definitions
 * Typed envelopes exchanged over ws://127.0.0.1:8765/ws
 */

import type { NoteSaveInput } from './notes';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface ModelStatus {
  loaded: boolean;
  starting: boolean;
  local: boolean;
}

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

export type TaskScheduleType = 'once' | 'daily' | 'custom';
export type TaskKind = 'task' | 'alarm';

export interface ScheduledTask {
  id: string;
  session_id: string;
  session_title?: string;
  prompt_to_execute: string;
  is_recurring: boolean;
  schedule_type?: TaskScheduleType;
  kind?: TaskKind;
  cron_or_iso: string;
  run_at_iso?: string | null;
  hour?: number | null;
  minute?: number | null;
  start_at_iso?: string | null;
  end_at_iso?: string | null;
  next_run_at?: string | null;
  status?: string;
}

export interface TaskInput {
  prompt: string;
  schedule_type: TaskScheduleType;
  is_recurring?: boolean;
  kind?: TaskKind;
  run_at_iso?: string;
  hour?: number;
  minute?: number;
  start_at_iso?: string;
  end_at_iso?: string;
}

export interface ClockAlert {
  event: string;
  title: string;
  kind: TaskKind;
  taskId: string;
}

export interface WifiProfile {
  name: string;
  connected: boolean;
}

export interface BluetoothDeviceInfo {
  name: string;
  status: string;
  connected: boolean;
  instance_id?: string;
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
    notes_directory?: string;
    notes_theme?: string;
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
  | { type: 'LIST_TASKS'; payload: Record<string, never> }
  | { type: 'CREATE_TASK'; payload: TaskInput }
  | { type: 'UPDATE_TASK'; payload: TaskInput & { task_id: string } }
  | { type: 'DELETE_TASK'; payload: { task_id: string } }
  | { type: 'LIST_NOTES'; payload: Record<string, never> }
  | { type: 'READ_NOTE'; payload: { note_id: string } }
  | { type: 'SAVE_NOTE'; payload: NoteSaveInput }
  | { type: 'DELETE_NOTE'; payload: { note_id: string } }
  | { type: 'ATTACH_NOTE'; payload: { note_id: string } }
  | { type: 'TOGGLE_THINKING_MODE'; payload: { enabled: boolean } }
  | { type: 'GET_CONFIG'; payload: Record<string, never> }
  | { type: 'GET_SYSTEM_STATE'; payload: Record<string, never> }
  | { type: 'GET_MODEL_STATUS'; payload: Record<string, never> }
  | { type: 'LOAD_MODEL'; payload: Record<string, never> }
  | { type: 'RELEASE_MODEL'; payload: Record<string, never> }
  | { type: 'KILL_APP'; payload: Record<string, never> }
  | { type: 'SAVE_CONFIG'; payload: { config: AppConfig } }
  | { type: 'SET_HOTKEY_CAPTURE'; payload: { enabled: boolean } }
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
  | { type: 'TOGGLE_DARK_MODE'; payload: { enabled?: boolean } }
  | { type: 'LIST_WIFI_PROFILES'; payload: Record<string, never> }
  | { type: 'CONNECT_WIFI'; payload: { profile: string } }
  | { type: 'DISCONNECT_WIFI'; payload: Record<string, never> }
  | { type: 'LIST_BLUETOOTH_DEVICES'; payload: Record<string, never> }
  | { type: 'OPEN_SETTINGS_PAGE'; payload: { page: string } };

export interface IncomingEnvelope<T = any> {
  type: string;
  payload: T;
}
