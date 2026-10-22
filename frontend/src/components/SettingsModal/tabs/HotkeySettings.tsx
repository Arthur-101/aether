import React, { useEffect, useState } from 'react';
import { Keyboard, RotateCcw } from 'lucide-react';
import type { HotkeysConfig } from '../../../types/ipc';

interface HotkeySettingsProps {
  hotkeys: HotkeysConfig;
  onChange: (patch: Partial<HotkeysConfig>) => void;
  onRecordingChange: (enabled: boolean) => void;
}

const rows = [
  { label: 'Smart Dictation (Hold)', key: 'dictation' as const },
  { label: 'Voice Assistant (Hold)', key: 'toggle_drawer' as const },
  { label: 'Circle to Ask (Hold)', key: 'circle_to_ask' as const },
  { label: 'Context Radial Wheel', key: 'radial_wheel_modifier' as const },
];

const DEFAULTS: HotkeysConfig = {
  dictation: 'Ctrl + Win',
  toggle_drawer: 'Alt + Space',
  circle_to_ask: 'Ctrl + Shift',
  radial_wheel_modifier: 'shift',
};

function humanize(value: string): string {
  const tokens = (value || '')
    .replace(/[<>]/g, '')
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens
    .map((token) => {
      const lower = token.toLowerCase();
      if (lower === 'ctrl' || lower === 'control') return 'Ctrl';
      if (lower === 'cmd' || lower === 'win' || lower === 'meta') return 'Win';
      if (lower === 'shift') return 'Shift';
      if (lower === 'alt') return 'Alt';
      if (lower === 'space') return 'Space';
      if (lower === 'esc' || lower === 'escape') return 'Esc';
      return token.length === 1 ? token.toUpperCase() : token;
    })
    .join(' + ');
}

function displayValue(key: keyof HotkeysConfig, value: string): string {
  if (key === 'radial_wheel_modifier') {
    return `Drag + ${humanize(value || 'shift')}`;
  }
  return humanize(value);
}

function mainKey(event: KeyboardEvent): string | null {
  if (/^[a-zA-Z]$/.test(event.key)) return event.key.toUpperCase();
  if (/^[0-9]$/.test(event.key)) return event.key;
  if (/^F([1-9]|1[0-2])$/.test(event.key)) return event.key.toUpperCase();
  if (event.code === 'Space' || event.key === ' ') return 'Space';
  if (event.key === 'Enter') return 'Enter';
  if (event.key === 'Tab') return 'Tab';
  return null;
}

export const HotkeySettings: React.FC<HotkeySettingsProps> = ({
  hotkeys,
  onChange,
  onRecordingChange,
}) => {
  const [recording, setRecording] = useState<keyof HotkeysConfig | null>(null);

  useEffect(() => {
    onRecordingChange(recording !== null);
    return () => onRecordingChange(false);
  }, [recording, onRecordingChange]);

  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setRecording(null);
        return;
      }

      if (recording === 'radial_wheel_modifier') {
        const modifier = event.key;
        if (modifier === 'Control' || modifier === 'Shift' || modifier === 'Alt') {
          onChange({ radial_wheel_modifier: modifier.toLowerCase() });
          setRecording(null);
        }
        return;
      }

      const key = mainKey(event);
      if (!key) return;

      const modifiers: string[] = [];
      if (event.ctrlKey) modifiers.push('Ctrl');
      if (event.metaKey) modifiers.push('Win');
      if (event.altKey) modifiers.push('Alt');
      if (event.shiftKey) modifiers.push('Shift');
      onChange({ [recording]: [...modifiers, key].join(' + ') });
      setRecording(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recording, onChange]);

  const reset = () => onChange(DEFAULTS);

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="mb-1 flex items-start justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-[var(--aether-text-3)]">
          Click a shortcut, then press the new keys. Changes take effect immediately after
          Save &amp; Apply.
        </p>
        <button
          onClick={reset}
          className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-2 py-1 text-[10px] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-surface-5)] hover:text-[var(--aether-text-1)]"
        >
          <RotateCcw size={11} />
          Reset
        </button>
      </div>

      {rows.map((row) => {
        const isRecording = recording === row.key;
        return (
          <div
            key={row.key}
            className="flex items-center justify-between rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-1)] p-2.5"
          >
            <span className="font-medium text-[var(--aether-text-1)]">{row.label}</span>
            <button
              onClick={() => setRecording(isRecording ? null : row.key)}
              className={`flex min-w-[138px] items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 font-mono text-[11px] transition ${
                isRecording
                  ? 'border-[var(--aether-accent)] bg-[var(--aether-accent)]/15 text-[var(--aether-accent-text)]'
                  : 'border-[var(--aether-line)] bg-[var(--aether-surface-3)] text-[var(--aether-accent-text)] hover:border-[var(--aether-accent)]/60'
              }`}
            >
              {isRecording ? (
                <>
                  <Keyboard size={12} className="animate-pulse" />
                  Press keys… (Esc)
                </>
              ) : (
                displayValue(row.key, hotkeys[row.key])
              )}
            </button>
          </div>
        );
      })}

      <p className="mt-1 text-[10px] text-[var(--aether-text-3)]">
        Tip: Radial Wheel accepts Ctrl, Shift, or Alt as the drag modifier. Other actions
        require a main key such as Space, A–Z, or F1–F12.
      </p>
    </div>
  );
};

