/** Small, dependency-free color math for the Color Picker card. */

export type Rgb = [number, number, number];

export const DEFAULT_COLOR = '#5B8CFF';

export interface ColorShade {
  label: string;
  hex: string;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

const toHexPart = (value: number) =>
  Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0').toUpperCase();

export function normalizeHex(value: string, fallback = DEFAULT_COLOR): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  return match ? `#${match[1].toUpperCase()}` : fallback;
}

export function hexToRgb(hex: string): Rgb {
  const value = normalizeHex(hex).slice(1);
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

export function rgbToHex(red: number, green: number, blue: number): string {
  return `#${toHexPart(red)}${toHexPart(green)}${toHexPart(blue)}`;
}

export function formatRgb(hex: string): string {
  const [red, green, blue] = hexToRgb(hex);
  return `rgb(${red}, ${green}, ${blue})`;
}

export function rgbToHsl(hex: string): [number, number, number] {
  const [red, green, blue] = hexToRgb(hex).map((part) => part / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;

  if (delta === 0) {
    return [0, 0, Math.round(lightness * 100)];
  }

  const saturation =
    delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (maximum === red) hue = ((green - blue) / delta) % 6;
  else if (maximum === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;

  return [
    Math.round((hue * 60 + 360) % 360),
    Math.round(saturation * 100),
    Math.round(lightness * 100),
  ];
}

export function formatHsl(hex: string): string {
  const [hue, saturation, lightness] = rgbToHsl(hex);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

const HEX_INPUT = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_INPUT =
  /^(?:rgba?\s*\(\s*)?([\d.]+)\s*(?:,|\s)\s*([\d.]+)\s*(?:,|\s)\s*([\d.]+)/i;
const HSL_INPUT =
  /^hsla?\s*\(\s*(-?[\d.]+)(?:deg)?\s*(?:,|\s)\s*([\d.]+)%\s*(?:,|\s)\s*([\d.]+)%/i;

/** Parse a pasted HEX, RGB or HSL value into the card's canonical hex form. */
export function parseColorInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const hex = HEX_INPUT.exec(value);
  if (hex) {
    const expanded =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((part) => `${part}${part}`)
            .join('')
        : hex[1];
    return `#${expanded.toUpperCase()}`;
  }

  const rgb = RGB_INPUT.exec(value);
  if (rgb) {
    return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  }

  const hsl = HSL_INPUT.exec(value);
  if (hsl) {
    return hslToHex(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));
  }

  return null;
}

export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation, 0, 100) / 100;
  const l = clamp(lightness, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = h / 60;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  const offset = l - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;
  if (section < 1) [red, green] = [chroma, secondary];
  else if (section < 2) [red, green] = [secondary, chroma];
  else if (section < 3) [green, blue] = [chroma, secondary];
  else if (section < 4) [green, blue] = [secondary, chroma];
  else if (section < 5) [red, blue] = [secondary, chroma];
  else [red, blue] = [chroma, secondary];

  return rgbToHex(
    (red + offset) * 255,
    (green + offset) * 255,
    (blue + offset) * 255
  );
}

/**
 * Four related swatches: a tint, the exact pick, and two deeper readings.
 * Lightness is moved rather than mixed with grey so the hue stays intact.
 */
export function buildColorShades(hex: string): ColorShade[] {
  const [hue, saturation, lightness] = rgbToHsl(normalizeHex(hex));
  const stops: Array<[string, number]> = [
    ['Light', lightness + (100 - lightness) * 0.38],
    ['Base', lightness],
    ['Dark', Math.max(4, lightness * 0.7)],
    ['Deep', Math.max(2, lightness * 0.46)],
  ];
  return stops.map(([label, stop]) => ({
    label,
    hex: hslToHex(hue, saturation, stop),
  }));
}
