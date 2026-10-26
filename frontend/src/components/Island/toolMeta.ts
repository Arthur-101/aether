/**
 * Tool-call labels and icons.
 *
 * One table serves both the live tool-run list and the finished `tools_used`
 * chips, so a new tool needs at most one entry here. Unknown tools fall back to
 * a prettified name instead of disappearing.
 */

import {
  CalendarClock,
  FileText,
  Image as ImageIcon,
  ListChecks,
  NotebookPen,
  Pin,
  Search,
  StickyNote,
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