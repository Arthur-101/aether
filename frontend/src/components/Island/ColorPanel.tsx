import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Pipette } from 'lucide-react';
import { ControlPanel } from './ControlPanel';
import {
  buildColorShades,
  formatHsl,
  formatRgb,
  hexToRgb,
  normalizeHex,
} from './colorUtils';

interface ColorPanelProps {
  color: string;
  connected: boolean;
  onPick: () => void;
  className?: string;
}

/**
 * The COLOR PICKER panel. Picking happens in a full-screen overlay in App,
 * because the selected color must survive this panel collapsing with the
 * Island. The card only owns its row layout and copy feedback.
 */
export const ColorPanel: React.FC<ColorPanelProps> = ({
  color,
  connected,
  onPick,
  className = '',
}) => {
  const value = normalizeHex(color);
  const [copied, setCopied] = useState<string | null>(null);
  const resetTimer = useRef<number | null>(null);
  const shades = useMemo(() => buildColorShades(value), [value]);
  const rgb = useMemo(() => formatRgb(value), [value]);
  const hsl = useMemo(() => formatHsl(value), [value]);
  const [red, green, blue] = hexToRgb(value);

  useEffect(
    () => () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    },
    []
  );

  const copy = (key: string, text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => setCopied(key))
      .catch(() => undefined);
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(null), 1200);
  };

  const copyIcon = (key: string) =>
    copied === key ? (
      <Check size={9} className="text-[var(--aether-accent)]" />
    ) : (
      <Copy
        size={9}
        className="text-[var(--aether-text-3)] opacity-0 transition group-hover:opacity-100"
      />
    );

  return (
    <ControlPanel
      label="Color Picker"
      icon={<Pipette size={14} />}
      className={className}
    >
      <div className="flex min-h-0 flex-1 flex-col justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onPick}
            disabled={!connected}
            title={
              connected
                ? 'Pick a color from anywhere on screen'
                : 'Connect to Aether to pick a screen color'
            }
            aria-label="Pick a color from the screen"
            className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/35 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              backgroundColor: value,
              boxShadow:
                'inset 0 0 0 1px rgba(0,0,0,0.14), 0 4px 14px rgba(0,0,0,0.18)',
            }}
          >
            <span
              className={`absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--aether-line)] bg-[var(--aether-surface-2)] text-[var(--aether-text-2)] ${
                connected ? '' : 'opacity-50'
              }`}
            >
              <Pipette size={8} />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => copy('hex', value)}
              title={`Copy ${value}`}
              className="group flex max-w-full items-center gap-1.5"
            >
              <span className="truncate font-mono text-[13px] font-semibold tracking-[0.02em] text-[var(--aether-text-1)]">
                {value}
              </span>
              {copyIcon('hex')}
            </button>
            <div className="mt-1 flex min-w-0 flex-col gap-0.5 text-[8.5px] text-[var(--aether-text-2)]">
              <button
                type="button"
                onClick={() => copy('rgb', rgb)}
                title={`Copy ${rgb}`}
                className="group flex min-w-0 items-center gap-1.5 hover:text-[var(--aether-text-1)]"
              >
                <span className="w-[18px] shrink-0 text-[7px] font-semibold tracking-[0.08em] text-[var(--aether-text-3)]">
                  RGB
                </span>
                <span className="truncate font-mono">
                  {red}, {green}, {blue}
                </span>
                {copyIcon('rgb')}
              </button>
              <button
                type="button"
                onClick={() => copy('hsl', hsl)}
                title={`Copy ${hsl}`}
                className="group flex min-w-0 items-center gap-1.5 hover:text-[var(--aether-text-1)]"
              >
                <span className="w-[18px] shrink-0 text-[7px] font-semibold tracking-[0.08em] text-[var(--aether-text-3)]">
                  HSL
                </span>
                <span className="truncate font-mono">{hsl.replace('hsl(', '').replace(')', '')}</span>
                {copyIcon('hsl')}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onPick}
            disabled={!connected}
            title="Pick a color from the screen"
            className="accent-fill flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[9px] font-semibold transition enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Pipette size={11} />
            Pick
          </button>
        </div>

        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          {shades.map((shade) => (
            <button
              key={shade.label}
              type="button"
              onClick={() => copy(shade.label, shade.hex)}
              title={`Copy ${shade.label.toLowerCase()} ${shade.hex}`}
              className="group flex min-w-0 flex-col items-center gap-1"
            >
              <span
                className="relative flex h-6 w-full items-center justify-center rounded-md border border-black/10"
                style={{ backgroundColor: shade.hex }}
              >
                {copied === shade.label ? (
                  <Check
                    size={9}
                    className={
                      shade.label === 'Light'
                        ? 'text-black/65'
                        : 'text-white/80'
                    }
                  />
                ) : null}
              </span>
              <span className="w-full truncate font-mono text-[8px] tracking-[0.01em] text-[var(--aether-text-2)]">
                {shade.hex}
              </span>
            </button>
          ))}
        </div>
      </div>
    </ControlPanel>
  );
};
