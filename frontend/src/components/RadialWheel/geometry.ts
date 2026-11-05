/**
 * Radial wheel geometry and live cursor hit-testing.
 * Slices start at 0° (right) and advance clockwise, matching atan2.
 */

export const WHEEL_SIZE = 372;
export const WHEEL_RADIUS = 150;
export const WHEEL_INNER_RADIUS = 56;
export const WHEEL_CORE_RADIUS = 42;
export const WHEEL_DETECT_RADIUS = 160;

export type WheelHit =
  | { type: 'core' }
  | { type: 'slice'; index: number }
  | null;

export function hitTestWheel(
  cursorX: number,
  cursorY: number,
  centerX: number,
  centerY: number,
  sliceCount: number
): WheelHit {
  const dx = cursorX - centerX;
  const dy = cursorY - centerY;
  const distance = Math.hypot(dx, dy);
  if (distance < WHEEL_CORE_RADIUS) return { type: 'core' };
  if (distance > WHEEL_DETECT_RADIUS || sliceCount === 0) return null;

  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return { type: 'slice', index: Math.floor(angle / (360 / sliceCount)) % sliceCount };
}

export function sliceActionLabel(label: string, isPdf: boolean): string {
  if (label === 'ASK') return 'Ask AI';
  if (label === 'CROP') return 'Crop Image';
  if (label === 'ADD BG') return 'Add Background';
  if (label === 'COMPRESS') return 'Compress';
  if (label === 'METADATA') return 'Strip Metadata';
  if (label === 'B&W') return 'Black & White';
  if (['MP3', 'WAV', 'M4A', 'OGG'].includes(label)) return `Audio → ${label}`;
  if (['MP4', 'WEBM', 'GIF'].includes(label)) return `Video → ${label}`;
  if (label === 'TXT') return 'Convert → TXT';
  return isPdf ? `Convert → ${label}` : `Convert → .${label}`;
}

export type WheelSliceKind = 'convert' | 'utility' | 'ask';

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'heic', 'avif', 'bmp', 'tiff', 'tif', 'gif',
]);

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv', 'flv',
]);

const AUDIO_EXTENSIONS = new Set([
  'mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wma',
]);

const DOC_EXTENSIONS = new Set(['docx']);

const UTILITY_ACTIONS = new Set(['COMPRESS', 'CROP', 'ADD BG', 'METADATA', 'B&W']);

/** Groups a slice for the wheel's tinting: conversions, edits, or Ask AI. */
export function sliceKind(label: string): WheelSliceKind {
  if (label === 'ASK') return 'ask';
  return UTILITY_ACTIONS.has(label) ? 'utility' : 'convert';
}

/** Slices for the file's real type; the source format is never a target. */
export function buildSlices(ext: string, askEligible: boolean): string[] {
  let format: string[];
  let edits: string[];

  if (IMAGE_EXTENSIONS.has(ext)) {
    const targets = ['WEBP', 'PNG', 'JPG', 'PDF', 'HEIC', 'AVIF'];
    format = targets.filter(
      (target) => target.toLowerCase() !== ext && !(ext === 'jpeg' && target === 'JPG')
    );
    // FFmpeg-less compression keeps only the first GIF frame.
    edits = ['COMPRESS', 'CROP', 'ADD BG', 'METADATA', 'B&W'].filter(
      (slice) => !(ext === 'gif' && slice === 'COMPRESS')
    );
  } else if (VIDEO_EXTENSIONS.has(ext)) {
    format = ['MP4', 'WEBM', 'GIF', 'MP3'].filter(
      (target) => target.toLowerCase() !== ext
    );
    edits = ['COMPRESS'];
  } else if (AUDIO_EXTENSIONS.has(ext)) {
    format = ['MP3', 'WAV', 'M4A', 'OGG'].filter(
      (target) => target.toLowerCase() !== ext
    );
    edits = ['COMPRESS'];
  } else if (ext === 'pdf') {
    format = ['JPG', 'PNG', 'TXT'];
    edits = ['COMPRESS'];
  } else if (DOC_EXTENSIONS.has(ext)) {
    format = ['TXT'];
    edits = [];
  } else {
    format = [];
    edits = [];
  }

  const slices = [...format, ...edits.filter((slice) => !format.includes(slice))];
  if (askEligible) slices.push('ASK');
  return slices;
}
