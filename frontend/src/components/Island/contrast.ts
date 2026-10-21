export type AccentTextColor = '#111318' | '#ffffff';

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHex(value: string, fallback: string): string {
  const raw = value.trim();
  if (!HEX_RE.test(raw)) return fallback;
  if (raw.length === 4) {
    return `#${raw
      .slice(1)
      .split('')
      .map((char) => char + char)
      .join('')}`.toLowerCase();
  }
  return raw.toLowerCase();
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex, '#000000').slice(1);
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [red, green, blue] = hexToRgb(hex);
  return (
    0.2126 * channelLuminance(red) +
    0.7152 * channelLuminance(green) +
    0.0722 * channelLuminance(blue)
  );
}

export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Picks black or white for text that remains readable across both gradient
 * stops (or a single solid accent).
 */
export function accentTextColor(primary: string, secondary = primary): AccentTextColor {
  const dark = '#111318';
  const light = '#ffffff';
  const darkScore = Math.min(contrastRatio(primary, dark), contrastRatio(secondary, dark));
  const lightScore = Math.min(
    contrastRatio(primary, light),
    contrastRatio(secondary, light)
  );
  return darkScore >= lightScore ? dark : light;
}

export function accentBackground(
  primary: string,
  secondary: string,
  gradient: boolean
): string {
  return gradient
    ? `linear-gradient(135deg, ${primary}, ${secondary})`
    : primary;
}
