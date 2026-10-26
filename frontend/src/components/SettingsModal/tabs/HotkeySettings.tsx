import React, { useEffect, useState } from 'react';
import { Keyboard } from 'lucide-react';
import type { HotkeysConfig } from '../../../types/ipc';
import { SettingsGroup, SettingsResetButton } from '../SettingsControls';
import {
  settingsCardClass,
  settingsHintClass,
  settingsRowClass,
} from '../settingsStyles';

interface HotkeySettingsProps {
  hotkeys: HotkeysConfig;
  onChange: (patch: Partial<HotkeysConfig>) => void;
  onRecordingChange: (enabled: boolean) => void;
}

const rows = [
  { label: 'Open Aether Island', key: 'open_island' as const },
  { label: 'Voice Assistant (Hold)', key: 'toggle_drawer' as const },
  { label: 'Smart Dictation (Hold)', key: 'dictation' as const },
  { label: 'Region to Ask (Hold)', key: 'circle_to_ask' as const },
  { label: 'Context Radial Wheel', key: 'radial_wheel_modifier' as const },
];

const DEFAULTS: HotkeysConfig = {
  dictation: 'Ctrl + Win',
  toggle_drawer: 'Alt + Space',
  circle_to_ask: 'Ctrl + Shift',
  radial_wheel_modifier: 'shift',
  open_island: 'Ctrl + Space',
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
    <div className="flex flex-col gap-4 pb-2">
      <SettingsGroup
        icon={<Keyboard size={13} />}
        title="Shortcuts"
        action={
          <SettingsResetButton
            onClick={reset}
            title="Restore default shortcuts"
            ariaLabel="Reset shortcuts"
          />
        }
        hint="Click a shortcut, then press the new keys. Changes take effect after Save & Apply."
      >
        <div className={settingsCardClass}>
          {rows.map((row) => {
            const isRecording = recording === row.key;
            return (
              <div key={row.key} className={settingsRowClass}>
                <span className="min-w-0 truncate text-[11px] text-[var(--aether-text-1)]">
                  {row.label}
                </span>
                <button
                  type="button"
                  onClick={() => setRecording(isRecording ? null : row.key)}
                  aria-label={`Change ${row.label} shortcut`}
                  className={`flex h-7 min-w-[138px] shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 font-mono text-[10px] transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)] ${
                    isRecording
                      ? 'border-[var(--aether-accent)] bg-[var(--aether-accent)]/12 text-[var(--aether-text-1)]'
                      : 'border-[var(--aether-line)] bg-black/15 text-[var(--aether-text-1)] hover:border-[var(--aether-line-strong)]'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Keyboard size={11} className="animate-pulse" />
                      Press keys… (Esc)
                    </>
                  ) : (
                    displayValue(row.key, hotkeys[row.key])
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <p className={settingsHintClass}>
          Tip: Radial Wheel accepts Ctrl, Shift, or Alt as the drag modifier. Other actions
          require a main key such as Space, A–Z, or F1–F12. If Open and Voice use the same
          shortcut, tap to open and hold to talk.
        </p>
      </SettingsGroup>
    </div>
  );
};
