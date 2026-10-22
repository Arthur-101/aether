import type { DisplayInfo } from '../../types/ipc';

/**
 * Shared units for the Controls scale card and the floating screen ruler.
 *
 * CSS pixels are the measured unit; physical millimetres come from the
 * panel's EDID width when Windows reports it. If it does not, the browser's
 * standard 96-CSS-px inch is the fallback calibration.
 */

export type ScaleUnit = 'px' | 'mm' | 'cm' | 'in' | 'pt';

export const SCALE_UNITS: Array<{ id: ScaleUnit; label: string; title: string }> = [
  { id: 'px', label: 'PX', title: 'Pixels' },
  { id: 'mm', label: 'MM', title: 'Millimetres' },
  { id: 'cm', label: 'CM', title: 'Centimetres' },
  { id: 'in', label: 'IN', title: 'Inches' },
  { id: 'pt', label: 'PT', title: 'Points (1/72 inch)' },
];

const FALLBACK_MM_PER_CSS_PX = 25.4 / 96;

export function mmPerCssPixel(display: DisplayInfo | null): number {
  const widthMm = display?.width_mm ?? 0;
  const widthPx = display?.width ?? 0;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  if (widthMm > 0 && widthPx > 0) return (widthMm / widthPx) * dpr;
  return FALLBACK_MM_PER_CSS_PX;
}

export function cssPxPerUnit(unit: ScaleUnit, mmPerCssPx: number): number {
  switch (unit) {
    case 'px':
      return 1;
    case 'mm':
      return 1 / mmPerCssPx;
    case 'cm':
      return 10 / mmPerCssPx;
    case 'in':
      return 25.4 / mmPerCssPx;
    case 'pt':
      return 25.4 / 72 / mmPerCssPx;
  }
}

export interface ScaleReading {
  value: number;
  text: string;
}

export function readScale(
  cssPixels: number,
  unit: ScaleUnit,
  mmPerCssPx: number
): ScaleReading {
  const value = cssPixels / cssPxPerUnit(unit, mmPerCssPx);
  const digits = unit === 'px' || unit === 'pt' ? 0 : value < 10 ? 2 : 1;
  return { value, text: `${value.toFixed(digits)} ${unit}` };
}

export interface TickSpec {
  /** Distance between minor ticks, in the selected unit. */
  minor: number;
  /** Minor-tick count between the taller marks. */
  majorEvery: number;
  /** Minor-tick count between numbered labels. */
  labelEvery: number;
}

export const TICK_SPECS: Record<ScaleUnit, TickSpec> = {
  px: { minor: 10, majorEvery: 5, labelEvery: 10 },
  mm: { minor: 1, majorEvery: 5, labelEvery: 10 },
  cm: { minor: 1, majorEvery: 1, labelEvery: 1 },
  in: { minor: 1 / 8, majorEvery: 8, labelEvery: 8 },
  pt: { minor: 6, majorEvery: 6, labelEvery: 12 },
};

export interface RulerTick {
  index: number;
  position: number;
  major: boolean;
  label: string | null;
}

export function buildTicks(
  lengthPx: number,
  unit: ScaleUnit,
  mmPerCssPx: number
): RulerTick[] {
  const spec = TICK_SPECS[unit];
  const step = spec.minor * cssPxPerUnit(unit, mmPerCssPx);
  if (!Number.isFinite(step) || step <= 0) return [];
  const count = Math.floor(lengthPx / step);
  const ticks: RulerTick[] = [];
  for (let index = 0; index <= count; index += 1) {
    const value = index * spec.minor;
    ticks.push({
      index,
      position: index * step,
      major: index % spec.majorEvery === 0,
      label:
        index % spec.labelEvery === 0
          ? `${Number(value.toFixed(2))}`
          : null,
    });
  }
  return ticks;
}

export function displayPpi(display: DisplayInfo | null): number | null {
  if (!display?.width_mm || !display.width) return null;
  return (display.width / display.width_mm) * 25.4;
}
