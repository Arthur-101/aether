import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Pencil, Pipette, RotateCcw, X } from 'lucide-react';
import { ControlPanel } from './ControlPanel';
import {
  buildColorShades,
  formatHsl,
  formatRgb,
  hexToRgb,
  normalizeHex,
  parseColorInput,
} from './colorUtils';

const RESET_COLOR = '#FFFFFF';

interface ColorPanelProps {
  color: string;
  connected: boolean;
  onPick: () => void;
  onSetColor: (hex: string) => void;
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
  onSetColor,
  className = '',
}) => {
  const value = normalizeHex(color);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const resetTimer = useRef<number | null>(null);
  const shades = useMemo(() => buildColorShades(value), [value]);
  const rgb = useMemo(() => formatRgb(value), [value]);
  const hsl = useMemo(() => formatHsl(value), [value]);
  const parsed = useMemo(() => parseColorInput(draft), [draft]);
  const invalid = draft.trim().length > 0 && !parsed;
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

  const openEditor = () => {
    setDraft(value);
    setEditing(true);
  };

  const closeEditor = () => {
    setEditing(false);
    setDraft(value);
  };

  const applyDraft = () => {
    if (!parsed) return;
    onSetColor(parsed);
    setDraft(parsed);
    setEditing(false);
  };

  const resetColor = () => {
    onSetColor(RESET_COLOR);
    setDraft(RESET_COLOR);
    setEditing(false);
  };

  return (
    <ControlPanel
      label="Color Picker"
      icon={<Pipette size={14} />}
      action={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={resetColor}
            disabled={value === RESET_COLOR}
            title={`Reset to ${RESET_COLOR}`}
            aria-label="Reset color to white"
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[7px] font-semibold uppercase tracking-[0.08em] text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <RotateCcw size={9} />
            Reset
          </button>
          <button
            type="button"
            onClick={editing ? closeEditor : openEditor}
            title={
              editing
                ? 'Close custom color input'
                : 'Enter a custom HEX, RGB or HSL color'
            }
            aria-label={
              editing
                ? 'Close custom color input'
                : 'Enter a custom HEX, RGB or HSL color'
            }
            className="rounded p-0.5 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
          >
            <Pencil size={10} />
          </button>
        </div>
      }
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

        {editing ? (
          <div className="mt-2.5 flex min-w-0 items-center gap-1.5">
            <span
              className="h-7 w-7 shrink-0 rounded-md border border-black/15"
              style={{ backgroundColor: parsed ?? 'transparent' }}
              title={parsed ?? 'No color parsed yet'}
            />
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyDraft();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  closeEditor();
                }
              }}
              placeholder="#5B8CFF / rgb(...) / hsl(...)"
              title="HEX #RRGGBB, rgb(91, 140, 255) or hsl(222, 73%, 68%)"
              aria-label="Custom HEX, RGB or HSL color"
              aria-invalid={invalid}
              spellCheck={false}
              className={`h-7 min-w-0 flex-1 rounded-md border bg-[var(--aether-fill)] px-2 font-mono text-[9px] text-[var(--aether-text-1)] outline-none transition placeholder:text-[var(--aether-text-3)] focus:border-[var(--aether-accent)] ${
                invalid
                  ? 'border-red-400/70'
                  : 'border-[var(--aether-line-soft)]'
              }`}
            />
            <button
              type="button"
              onClick={applyDraft}
              disabled={!parsed}
              title="Apply custom color"
              className="accent-fill h-7 shrink-0 rounded-md px-2 text-[8px] font-semibold transition enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Set
            </button>
            <button
              type="button"
              onClick={closeEditor}
              title="Close custom color input"
              aria-label="Close custom color input"
              className="flex h-7 w-5 shrink-0 items-center justify-center rounded text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
            >
              <X size={10} />
            </button>
          </div>
        ) : (
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
        )}
      </div>
    </ControlPanel>
  );
};
