import React, { useMemo } from 'react';
import { buildTicks, type ScaleUnit } from './scaleUnits';

interface RulerFaceProps {
  lengthPx: number;
  unit: ScaleUnit;
  mmPerCssPx: number;
  orientation?: 'horizontal' | 'vertical';
  compact?: boolean;
  /** Stretch across the parent instead of the explicit measured length. */
  fill?: boolean;
  /** Mirror the tick face across the ruler's long axis, like an upside-down ruler. */
  flipFace?: boolean;
}

/**
 * The tick face shared by the Controls preview and the floating screen ruler.
 * Ticks are generated in CSS pixels so the labels stay tied to the selected
 * unit even when the ruler is resized.
 */
export const RulerFace: React.FC<RulerFaceProps> = ({
  lengthPx,
  unit,
  mmPerCssPx,
  orientation = 'horizontal',
  compact = false,
  fill = false,
  flipFace = false,
}) => {
  const ticks = useMemo(
    () => buildTicks(lengthPx, unit, mmPerCssPx),
    [lengthPx, unit, mmPerCssPx]
  );
  const vertical = orientation === 'vertical';
  const majorLength = compact ? 12 : 16;
  const minorLength = compact ? 6 : 8;
  const labelOffset = compact ? 14 : 18;

  return (
    <div
      className="relative overflow-hidden"
      style={
        vertical
          ? { width: compact ? 34 : 56, height: fill ? '100%' : lengthPx }
          : { width: fill ? '100%' : lengthPx, height: compact ? 38 : 56 }
      }
      aria-hidden
    >
      {ticks.map((tick) => {
        const length = tick.major ? majorLength : minorLength;
        const position = tick.position;
        const labelTop = Math.min(
          Math.max(position - 4, 0),
          Math.max(lengthPx - 10, 0)
        );
        return (
          <React.Fragment key={tick.index}>
            <span
              className={`absolute ${
                tick.major
                  ? 'bg-[var(--aether-text-2)]'
                  : 'bg-[var(--aether-text-3)] opacity-60'
              }`}
              style={
                vertical
                  ? {
                      top: position,
                      ...(flipFace ? { right: 0 } : { left: 0 }),
                      width: length,
                      height: 1,
                    }
                  : {
                      ...(flipFace ? { top: 0 } : { bottom: 0 }),
                      left: position,
                      width: 1,
                      height: length,
                    }
              }
            />
            {tick.label ? (
              <span
                className={`absolute whitespace-nowrap font-mono ${
                  compact ? 'text-[7px]' : 'text-[8px]'
                } text-[var(--aether-text-3)]`}
                style={
                  vertical
                    ? {
                        top: labelTop,
                        ...(flipFace
                          ? { right: labelOffset }
                          : { left: labelOffset }),
                      }
                    : {
                        ...(flipFace
                          ? { top: labelOffset }
                          : { bottom: labelOffset }),
                        left: position + 2,
                      }
                }
              >
                {tick.label}
              </span>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};
