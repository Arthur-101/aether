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
  return isPdf ? `Convert → ${label}` : `Convert → .${label}`;
}

export type WheelSliceKind = 'convert' | 'utility' | 'ask';

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'heic', 'avif', 'bmp', 'tiff', 'gif',
]);

const UTILITY_ACTIONS = new Set(['COMPRESS', 'CROP', 'ADD BG', 'METADATA', 'B&W']);

/** Groups a slice for the wheel's tinting: conversions, edits, or Ask AI. */
export function sliceKind(label: string): WheelSliceKind {
  if (label === 'ASK') return 'ask';
  return UTILITY_ACTIONS.has(label) ? 'utility' : 'convert';
}

export function buildSlices(ext: string, askEligible: boolean): string[] {
  const isPdf = ext === 'pdf';
  const isVideo = ['mp4', 'mov', 'mkv', 'avi'].includes(ext);
  const format = isPdf
    ? ['DOCX', 'JPG', 'PNG', 'TXT']
    : isVideo
      ? ['MP3', 'GIF', 'COMPRESS', 'WEBM']
      : ['WEBP', 'PNG', 'JPG', 'PDF', 'HEIC', 'AVIF'];
  // Edits share one ring with conversions; dedupe keeps video's COMPRESS once.
  const edits = ['COMPRESS', 'CROP', 'ADD BG', 'METADATA'];
  // Black & white only makes sense for raster images.
  if (IMAGE_EXTENSIONS.has(ext)) edits.push('B&W');
  const slices = [...format, ...edits.filter((slice) => !format.includes(slice))];
  if (askEligible) slices.push('ASK');
  return slices;
}
