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

export type DashboardTabId =
  | 'controls'
  | 'chat'
  | 'clock'
  | 'stats'
  | 'notes'
  | 'wallpaper'
  | 'power';

export interface AppearanceConfig {
  dashboard_tabs: DashboardTabId[];
  theme_mode: ThemeMode;
  glow_style: GlowStyle;
  glow_color: GlowColor;
  pill_opacity: number;
  island_opacity: number;
  pill_grain: number;
  island_grain: number;
  pill_pop: number;
  island_pop: number;
  /** Surface settings for the popped-out desktop widgets. */
  widget_opacity: number;
  widget_grain: number;
  widget_pop: number;
  /** Corner radius of the widget card, in pixels. */
  widget_radius: number;
  /** Clock widget: show the small seconds counter beside the minutes. */
  widget_clock_seconds: boolean;
  /** Clock widget: show the weekday and date under the time. */
  widget_clock_daydate: boolean;
  /** Look of the media widget. The clock and date keep the shared surface. */
  widget_theme: WidgetTheme;
  /**
   * Text colour for widget cards. An empty string follows the theme, which is
   * white on dark and black on light.
   */
  widget_text_color: string;
  button_primary: string;
  button_secondary: string;
  button_gradient: boolean;
  close_on_outside_click: boolean;
  auto_hide_pill: boolean;
  time_format: TimeFormat;
}

export type ThemeMode = 'system' | 'light' | 'dark';

/** Alternate looks for the desktop widgets. */
export type WidgetTheme =
  | 'default'
  | 'cozy'
  | 'newsprint'
  | 'aura'
  | 'blueprint';

/** How times of day are displayed across the island. */
export type TimeFormat = '12h' | '24h';

/** How the media widget's glow is drawn. */
export type GlowStyle = 'off' | 'soft' | 'glass' | 'neon' | 'pulse';

/** Whether the glow follows the media source or the app accent. */
export type GlowColor = 'source' | 'theme';

export interface ClockConfig {
  weather_mode: 'auto' | 'manual';
  weather_city: string;
  weather_latitude?: number | null;
  weather_longitude?: number | null;
  weather_unit: 'celsius' | 'fahrenheit';
  weather_label?: string;
}

export interface WallpaperConfig {
  folder: string;
}

export interface WallpaperItem {
  path: string;
  name: string;
  thumbnail: string;
  modified: number;
  is_current: boolean;
}

export interface WallpaperState {
  current: string;
  current_name: string;
  recent: WallpaperItem[];
  folder: WallpaperItem[];
  folder_path: string;
  available: boolean;
  message: string;
}

export type PowerAction = 'lock' | 'sleep' | 'restart' | 'shutdown';

export interface PowerActionResult {
  ok: boolean;
  action: PowerAction | string;
  message: string;
}

export interface WeatherSnapshot {
  available: boolean;
  stale: boolean;
  location: string;
  temperature: number | null;
  unit: 'C' | 'F';
  condition: string;
  icon: string;
  humidity: number | null;
  wind_kph: number | null;
  updated_at: string;
  message: string;
}

export interface TaskbarPinnedApp {
  id: string;
  name: string;
  path: string;
  icon?: string;
  running?: boolean | null;
  missing?: boolean;
  target_path?: string;
  arguments?: string;
  app_id?: string;
}

export interface TaskbarAppsConfig {
  mode: 'mirror' | 'custom';
  pinned: TaskbarPinnedApp[];
}

export interface TaskbarAppsState {
  mode: 'mirror' | 'custom';
  pinned: TaskbarPinnedApp[];
  discovered: TaskbarPinnedApp[];
  apps: TaskbarPinnedApp[];
  available: boolean;
  message: string;
}

export type MediaStatus =
  | 'closed'
  | 'opened'
  | 'changing'
  | 'stopped'
  | 'playing'
  | 'paused'
  | 'idle'
  | 'unavailable'
  | 'unknown';

export type MediaControlAction = 'play' | 'pause' | 'play_pause' | 'next' | 'previous';

export interface MediaSnapshot {
  available: boolean;
  has_session: boolean;
  is_playing: boolean;
  status: MediaStatus;
  source: string;
  source_id: string;
  source_label: string;
  is_spotify: boolean;
  title: string;
  artist: string;
  album: string;
  artwork: string | null;
  position_seconds: number;
  duration_seconds: number;
  can_play: boolean;
  can_pause: boolean;
  can_next: boolean;
  can_previous: boolean;
  updated_at: string;
  message: string;
}

export interface TopAppStat {
  name: string;
  ram_mb?: number;
  vram_mb?: number;
  cpu_percent?: number;
  processes: number;
}

export interface SystemStats {
  cpu_percent: number;
  ram_percent: number;
  ram_used_gb?: number;
  ram_total_gb?: number;
  disk_percent: number;
  disk_used_gb?: number;
  disk_total_gb?: number;
  disk_read_mbps?: number;
  disk_write_mbps?: number;
  net_down_mbps?: number;
  net_up_mbps?: number;
  uptime_seconds?: number;
  cpu_cores?: number | null;
  cpu_threads?: number | null;
  top_apps?: TopAppStat[];
  top_apps_vram?: TopAppStat[];
  top_apps_cpu?: TopAppStat[];
  gpu_percent?: number | null;
  gpu_name?: string | null;
  gpu_vram_gb?: number | null;
  gpu_vram_used_gb?: number | null;
  gpu_vram_total_gb?: number | null;
  gpu_temp_c?: number | null;
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

export type SpeedTestState = 'idle' | 'running' | 'done' | 'error';
export type SpeedTestPhase = 'latency' | 'download' | 'upload';

/** One measured window inside the live throughput trace. */
export interface SpeedTestSample {
  phase: 'download' | 'upload';
  mbps: number;
  /** Seconds from the start of the run, when supplied by the backend. */
  t?: number;
}

export interface SpeedTestResult {
  state: SpeedTestState;
  phase?: SpeedTestPhase;
  /** Overall run progress, from 0 to 1. */
  progress?: number;
  /** Latest window speed, used by the live gauge. */
  current_mbps?: number | null;
  jitter_ms?: number | null;
  ping_ms?: number | null;
  download_mbps?: number | null;
  upload_mbps?: number | null;
  samples?: SpeedTestSample[];
  /** Requested wall-clock length of the run, in seconds. */
  duration_seconds?: number;
  message?: string;
  server?: string;
  tested_at?: string;
}

export interface AudioOutputDevice {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

export interface DisplayInfo {
  name: string;
  width: number;
  height: number;
  refresh_hz: number;
  /** Physical active-area size from EDID, when the panel reports it. */
  width_mm?: number;
  height_mm?: number;
}

/** One live screen-color sample from the picker overlay. */
export interface ScreenSample {
  request_id: string;
  available: boolean;
  message: string;
  /** Cursor in physical screen coordinates. */
  x: number;
  y: number;
  hex: string;
  rgb: [number, number, number];
  /** Small PNG data URL used by the magnifier. */
  patch: string;
  patch_width: number;
  patch_height: number;
  cursor_x: number;
  cursor_y: number;
  screen_width: number;
  screen_height: number;
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
  ok?: boolean;
}

/** Label-only attachment metadata kept with a finished chat turn. */
export interface TurnAttachment {
  file_name: string;
  mode: string;
}

/**
 * One live tool-run step streamed while a chat turn is in flight
 * (`TOOL_CALL_STARTED` / `TOOL_CALL_FINISHED`).
 */
export interface ToolCallEvent {
  call_id: string;
  name: string;
  phase: 'started' | 'finished';
  args?: Record<string, unknown>;
  ok?: boolean;
  output?: string;
}

export interface ToolApprovalRequest {
  approval_id: string;
  session_id: string;
  prompt: string;
  name: string;
  args: Record<string, unknown>;
  risk: 'destructive' | 'system';
}

export interface ChatTurn {
  user: string;
  ai: string;
  timestamp?: string;
  reasoning?: string;
  attachments?: TurnAttachment[];
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

export interface CloudProviderEntry {
  api_key: string;
  model: string;
}

export interface SpotifyAuthState {
  connected: boolean;
  pending: boolean;
  display_name: string;
  client_id_set: boolean;
  message: string;
}

export interface AIProviderConfig {
  mode: 'local_gguf' | 'ollama' | 'cloud';
  local_engine?: string;
  gguf_model_path: string;
  ollama_base_url: string;
  ollama_model_name: string;
  cloud_provider: string;
  cloud_providers: Record<string, CloudProviderEntry>;
  cloud_model: string;
  api_key: string;
  tavily_api_key?: string;
  context_length: number;
  gpu_layers: number;
  kv_cache_type?: string;
  thinking_mode: boolean;
  max_tool_rounds?: number;
  memory_local_recent_turns?: number;
  memory_local_semantic_matches?: number;
  memory_cloud_recent_turns?: number;
  memory_cloud_semantic_matches?: number;
}

export interface VoiceConfig {
  stt_engine: string;
  stt_provider: string;
  stt_model: string;
  stt_model_dir: string;
  tts_engine: string;
  tts_provider: string;
  tts_model: string;
  tts_model_path: string;
  tts_voice_id: string;
  tts_speed: number;
  mic_device_index: number | null;
}

export interface HotkeysConfig {
  dictation: string;
  /** Legacy key name; the UI calls this Region to Ask. */
  circle_to_ask: string;
  radial_wheel_modifier: string;
  toggle_drawer: string;
  open_island: string;
}

export interface GeneralConfig {
  /** Register the desktop app in the Windows sign-in startup list. */
  start_on_startup: boolean;
  /** Keep the Aether icon in the Windows notification area. */
  show_tray_icon: boolean;
}

export interface RegionCapture {
  id: number;
  filePath: string;
  width: number;
  height: number;
}

export type ToolRisk = 'read' | 'write' | 'destructive' | 'system';

export interface ToolLoadoutEntry {
  name: string;
  risk: ToolRisk;
  tokens: number;
  enabled: boolean;
}

export interface ToolGroupLoadout {
  id: string;
  label: string;
  hint: string;
  tokens: number;
  enabled: boolean;
  tools: ToolLoadoutEntry[];
}

export interface ToolGroupsState {
  groups: ToolGroupLoadout[];
  total_tools: number;
  total_tokens: number;
  enabled_tools: number;
  enabled_tokens: number;
  lean_groups: string[];
}

export interface ToolsConfig {
  enabled_groups: string[];
  disabled_tools: string[];
}

export interface AppConfig {
  first_run_completed?: boolean;
  brand_name?: string;
  general?: GeneralConfig;
  ai_provider: AIProviderConfig;
  voice: VoiceConfig;
  hotkeys: HotkeysConfig;
  storage?: {
    export_directory?: string;
    auto_session_timeout_minutes?: number;
    notes_directory?: string;
    notes_theme?: string;
  };
  appearance?: AppearanceConfig;
  clock?: ClockConfig;
  taskbar_apps?: TaskbarAppsConfig;
  wallpaper?: WallpaperConfig;
  spotify?: {
    client_id?: string;
  };
  tools?: ToolsConfig;
}

export type OutgoingEvent =
  | { type: 'CHAT_MESSAGE'; payload: { text: string } }
  | {
      type: 'RESOLVE_TOOL_APPROVAL';
      payload: {
        approval_id: string;
        session_id: string;
        prompt: string;
        approved: boolean;
      };
    }
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
  | {
      type: 'CAPTURE_REGION';
      payload: { x: number; y: number; width: number; height: number };
    }
  | { type: 'DELETE_SESSION'; payload: { session_id: string } }
  | { type: 'LIST_TASKS'; payload: Record<string, never> }
  | { type: 'CREATE_TASK'; payload: TaskInput }
  | { type: 'UPDATE_TASK'; payload: TaskInput & { task_id: string } }
  | { type: 'DELETE_TASK'; payload: { task_id: string } }
  | { type: 'COMPLETE_TASK'; payload: { task_id: string } }
  | { type: 'PAUSE_TASK'; payload: { task_id: string } }
  | { type: 'RESUME_TASK'; payload: { task_id: string } }
  | { type: 'GET_WEATHER'; payload: Record<string, never> }
  | { type: 'GET_TASKBAR_APPS'; payload: { refresh?: boolean } }
  | { type: 'LAUNCH_TASKBAR_APP'; payload: { app_id: string } }
  | { type: 'GET_MEDIA_STATE'; payload: Record<string, never> }
  | { type: 'MEDIA_CONTROL'; payload: { action: MediaControlAction } }
  | { type: 'LIST_NOTES'; payload: Record<string, never> }
  | { type: 'READ_NOTE'; payload: { note_id: string } }
  | { type: 'SAVE_NOTE'; payload: NoteSaveInput }
  | { type: 'SET_NOTE_PIN'; payload: { note_id: string; pinned: boolean } }
  | { type: 'DELETE_NOTE'; payload: { note_id: string } }
  | { type: 'ATTACH_NOTE'; payload: { note_id: string } }
  | { type: 'TOGGLE_THINKING_MODE'; payload: { enabled: boolean } }
  | { type: 'GET_CONFIG'; payload: Record<string, never> }
  | { type: 'GET_TOOL_GROUPS'; payload: Record<string, never> }
  | { type: 'GET_SYSTEM_STATE'; payload: Record<string, never> }
  | { type: 'GET_MODEL_STATUS'; payload: Record<string, never> }
  | { type: 'LOAD_MODEL'; payload: Record<string, never> }
  | { type: 'RELEASE_MODEL'; payload: Record<string, never> }
  | { type: 'KILL_APP'; payload: Record<string, never> }
  | { type: 'SAVE_CONFIG'; payload: { config: AppConfig } }
  | { type: 'SET_HOTKEY_CAPTURE'; payload: { enabled: boolean } }
  | { type: 'GET_SPOTIFY_STATUS'; payload: Record<string, never> }
  | { type: 'SPOTIFY_CONNECT'; payload: { client_id: string } }
  | { type: 'SPOTIFY_DISCONNECT'; payload: Record<string, never> }
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
  | { type: 'LIST_AUDIO_DEVICES'; payload: Record<string, never> }
  | { type: 'SET_AUDIO_DEVICE'; payload: { device_id: string } }
  | { type: 'GET_DISPLAY_INFO'; payload: Record<string, never> }
  | { type: 'GET_WALLPAPER_STATE'; payload: Record<string, never> }
  | { type: 'SET_WALLPAPER'; payload: { path: string } }
  | { type: 'CLEAR_WALLPAPER_HISTORY'; payload: Record<string, never> }
  | {
      type: 'POWER_ACTION';
      payload: { action: PowerAction; confirm?: boolean };
    }
  | {
      type: 'SAMPLE_SCREEN';
      payload: { request_id: string; radius?: number };
    }
  | { type: 'RUN_SPEED_TEST'; payload: { duration_seconds?: number } }
  | { type: 'OPEN_SETTINGS_PAGE'; payload: { page: string } };

export interface IncomingEnvelope<T = any> {
  type: string;
  payload: T;
}


