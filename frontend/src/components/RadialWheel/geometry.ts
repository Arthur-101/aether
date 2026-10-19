/**
 * Radial wheel geometry and live cursor hit-testing.
 * Slices start at 0° (right) and advance clockwise, matching atan2.
 */

export const WHEEL_SIZE = 340;
export const WHEEL_RADIUS = 135;
export const WHEEL_INNER_RADIUS = 56;
export const WHEEL_CORE_RADIUS = 42;
export const WHEEL_DETECT_RADIUS = 145;

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
  if (label === 'REM BG') return 'Remove Background';
  if (label === 'COMPRESS') return 'Compress';
  if (label === 'METADATA') return 'Strip Metadata';
  return isPdf ? `Convert → ${label}` : `Convert → .${label}`;
}

export function buildSlices(
  ext: string,
  ring: 'format' | 'utility',
  askEligible: boolean
): string[] {
  const isPdf = ext === 'pdf';
  const isVideo = ['mp4', 'mov', 'mkv', 'avi'].includes(ext);
  const format = isPdf
    ? ['DOCX', 'JPG', 'PNG', 'TXT']
    : isVideo
      ? ['MP3', 'GIF', 'COMPRESS', 'WEBM']
      : ['WEBP', 'PNG', 'JPG', 'PDF', 'HEIC', 'AVIF'];
  const utility = ['COMPRESS', 'CROP', 'ADD BG', 'REM BG', 'METADATA'];
  const slices = ring === 'format' ? [...format] : [...utility];
  if (askEligible) slices.push('ASK');
  return slices;
}
