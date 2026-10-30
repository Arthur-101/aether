/**
 * Tool-call labels and icons.
 *
 * One table serves both the live tool-run list and the finished `tools_used`
 * chips, so a new tool needs at most one entry here. Unknown tools fall back to
 * a prettified name instead of disappearing.
 */

import {
  Activity,
  AppWindow,
  AudioLines,
  Bluetooth,
  CalendarClock,
  Cast,
  Clipboard,
  ClipboardPaste,
  ExternalLink,
  FileText,
  Globe,
  Heart,
  Image as ImageIcon,
  ListChecks,
  ListMusic,
  ListPlus,
  MonitorSpeaker,
  MonitorUp,
  NotebookPen,
  Pause,
  Pencil,
  Pin,
  Play,
  Repeat,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  StickyNote,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
  Wifi,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ToolMeta {
  label: string;
  icon: LucideIcon;
}

const TOOL_META: Record<string, ToolMeta> = {
  // Media & files
  convert_image_format: { label: 'Convert image', icon: ImageIcon },
  compress_media: { label: 'Compress media', icon: FileText },
  strip_image_metadata: { label: 'Strip metadata', icon: FileText },
  crop_image: { label: 'Crop image', icon: ImageIcon },
  add_background: { label: 'Add background', icon: ImageIcon },
  convert_document: { label: 'Convert document', icon: FileText },
  search_dropped_file: { label: 'Search attachment', icon: Search },
  // Notes
  list_notes: { label: 'List notes', icon: ListChecks },
  search_notes: { label: 'Search notes', icon: Search },
  read_note: { label: 'Read note', icon: StickyNote },
  create_note: { label: 'Create note', icon: NotebookPen },
  append_to_note: { label: 'Append to note', icon: NotebookPen },
  set_note_pinned: { label: 'Pin note', icon: Pin },
  update_note: { label: 'Replace note body', icon: Pencil },
  delete_note: { label: 'Delete note', icon: Trash2 },
  // Clipboard
  read_clipboard: { label: 'Read clipboard', icon: Clipboard },
  write_clipboard: { label: 'Copy to clipboard', icon: ClipboardPaste },
  // Music transport
  media_play: { label: 'Play', icon: Play },
  media_pause: { label: 'Pause', icon: Pause },
  media_toggle: { label: 'Toggle playback', icon: Play },
  media_next: { label: 'Next track', icon: SkipForward },
  media_previous: { label: 'Previous track', icon: SkipBack },
  now_playing: { label: 'Now playing', icon: AudioLines },
  // Web
  web_search: { label: 'Web search', icon: Globe },
  fetch_url: { label: 'Read page', icon: ExternalLink },
  // System
  get_system_stats: { label: 'System stats', icon: Activity },
  set_volume: { label: 'Set volume', icon: Volume2 },
  set_mute: { label: 'Mute or unmute', icon: VolumeX },
  set_brightness: { label: 'Set brightness', icon: Sun },
  set_wifi: { label: 'Toggle Wi-Fi', icon: Wifi },
  set_bluetooth: { label: 'Toggle Bluetooth', icon: Bluetooth },
  launch_app: { label: 'Launch app', icon: AppWindow },
  focus_window: { label: 'Focus window', icon: MonitorUp },
  // Spotify
  spotify_search: { label: 'Spotify search', icon: Search },
  spotify_play: { label: 'Play on Spotify', icon: Play },
  spotify_queue: { label: 'Queue on Spotify', icon: ListPlus },
  spotify_set_shuffle: { label: 'Spotify shuffle', icon: Shuffle },
  spotify_set_repeat: { label: 'Spotify repeat', icon: Repeat },
  spotify_set_volume: { label: 'Spotify volume', icon: Volume2 },
  spotify_list_devices: { label: 'Spotify devices', icon: MonitorSpeaker },
  spotify_transfer: { label: 'Transfer playback', icon: Cast },
  spotify_like: { label: 'Like on Spotify', icon: Heart },
  spotify_liked_songs: { label: 'Liked songs', icon: ListMusic },
  // Scheduling
  schedule_one_time_task: { label: 'Schedule task', icon: CalendarClock },
  schedule_recurring_routine: { label: 'Schedule routine', icon: CalendarClock },
  schedule_custom_task: { label: 'Schedule task', icon: CalendarClock },
  list_scheduled_tasks: { label: 'List tasks', icon: CalendarClock },
  update_scheduled_task: { label: 'Update task', icon: CalendarClock },
  cancel_scheduled_task: { label: 'Cancel task', icon: CalendarClock },
  complete_scheduled_task: { label: 'Complete task', icon: CalendarClock },
  pause_scheduled_task: { label: 'Pause task', icon: CalendarClock },
  resume_scheduled_task: { label: 'Resume task', icon: CalendarClock },
  schedule_alarm: { label: 'Set alarm', icon: CalendarClock },
};

export function toolMeta(name: string): ToolMeta {
  const known = TOOL_META[name];
  if (known) return known;
  const label = (name || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
  return { label: label || 'Tool', icon: Wrench };
}