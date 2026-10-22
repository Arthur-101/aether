import React, { useEffect, useState } from 'react';
import { ChevronRight, RotateCcw, Wifi } from 'lucide-react';
import type { AppearanceConfig } from '../../../types/ipc';
import {
  ACCENT_PRESETS,
  DEFAULT_APPEARANCE,
  accentStyle,
} from '../../Island/appearance';
import { normalizeHex } from '../../Island/contrast';

interface ButtonColorSettingsProps {
  appearance: AppearanceConfig;
  onChange: (appearance: AppearanceConfig) => void;
}

export const ButtonColorSettings: React.FC<ButtonColorSettingsProps> = ({
  appearance,
  onChange,
}) => {
  const [primaryText, setPrimaryText] = useState(appearance.button_primary);
  const [secondaryText, setSecondaryText] = useState(appearance.button_secondary);

  useEffect(() => {
    setPrimaryText(appearance.button_primary);
    setSecondaryText(appearance.button_secondary);
  }, [appearance.button_primary, appearance.button_secondary]);

  const update = (patch: Partial<AppearanceConfig>) =>
    onChange({ ...appearance, ...patch });

  const setPrimary = (value: string) => {
    const normalized = normalizeHex(value, appearance.button_primary);
    setPrimaryText(normalized);
    update({ button_primary: normalized });
  };

  const setSecondary = (value: string) => {
    const normalized = normalizeHex(value, appearance.button_secondary);
    setSecondaryText(normalized);
    update({ button_secondary: normalized });
  };

  const preset = ACCENT_PRESETS.find(
    (item) => item.primary.toLowerCase() === appearance.button_primary
  );
  const preview = accentStyle(appearance);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <h5 className="text-xs font-semibold text-[var(--aether-text-1)]">Button color</h5>
          <p className="mt-0.5 text-[10px] text-[var(--aether-text-3)]">
            Applies to buttons and the active tab. Gauges stay semantic.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...appearance,
              button_primary: DEFAULT_APPEARANCE.button_primary,
              button_secondary: DEFAULT_APPEARANCE.button_secondary,
              button_gradient: DEFAULT_APPEARANCE.button_gradient,
            })
          }
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
        >
          <RotateCcw size={11} />
          Reset
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ACCENT_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() =>
              update({
                button_primary: item.primary,
                button_secondary: item.secondary,
              })
            }
            title={item.label}
            className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] transition ${
              preset?.id === item.id
                ? 'border-[var(--aether-line-strong)] bg-[var(--aether-fill-2)] text-[var(--aether-text-1)]'
                : 'border-[var(--aether-line)] text-[var(--aether-text-2)] hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]'
            }`}
          >
            <span
              className="h-3.5 w-3.5 rounded-full ring-1 ring-white/20"
              style={{
                background: `linear-gradient(135deg, ${item.primary}, ${item.secondary})`,
              }}
            />
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="rounded-lg border border-[var(--aether-line)] bg-black/15 p-2">
          <span className="mb-1 block text-[9px] uppercase tracking-wider text-[var(--aether-text-3)]">
            Primary
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={appearance.button_primary}
              onChange={(event) => setPrimary(event.target.value)}
              className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
              aria-label="Primary button color"
            />
            <input
              value={primaryText}
              onChange={(event) => setPrimaryText(event.target.value)}
              onBlur={() => setPrimary(primaryText)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              maxLength={7}
              className="min-w-0 flex-1 rounded border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-2 py-1 font-mono text-[10px] text-[var(--aether-text-1)] outline-none focus:border-[var(--aether-accent)]"
              aria-label="Primary color hex"
            />
          </div>
        </label>
        <label className="rounded-lg border border-[var(--aether-line)] bg-black/15 p-2">
          <span className="mb-1 block text-[9px] uppercase tracking-wider text-[var(--aether-text-3)]">
            Secondary
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={appearance.button_secondary}
              onChange={(event) => setSecondary(event.target.value)}
              className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
              aria-label="Secondary button color"
            />
            <input
              value={secondaryText}
              onChange={(event) => setSecondaryText(event.target.value)}
              onBlur={() => setSecondary(secondaryText)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              maxLength={7}
              className="min-w-0 flex-1 rounded border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-2 py-1 font-mono text-[10px] text-[var(--aether-text-1)] outline-none focus:border-[var(--aether-accent)]"
              aria-label="Secondary color hex"
            />
          </div>
        </label>
      </div>

      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--aether-line)] bg-black/15 px-2.5 py-2">
        <span className="text-[11px] text-[var(--aether-text-2)]">Use a gradient</span>
        <input
          type="checkbox"
          checked={appearance.button_gradient}
          onChange={(event) => update({ button_gradient: event.target.checked })}
          className="accent-[var(--aether-accent)]"
        />
      </label>

      <div className="rounded-lg border border-[var(--aether-line)] bg-black/15 p-2.5">
        <p className="mb-2 text-[9px] uppercase tracking-wider text-[var(--aether-text-3)]">
          Preview
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold"
            style={preview}
          >
            <Wifi size={12} />
            Wi-Fi on
            <ChevronRight size={10} />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--aether-line)] bg-[var(--aether-fill)] px-3 py-1.5 text-[10px] font-semibold text-[var(--aether-text-2)]"
          >
            <Wifi size={12} className="text-[var(--aether-text-3)]" />
            Bluetooth off
            <ChevronRight size={10} />
          </button>
          <span
            className="rounded-full px-3 py-1.5 text-[10px] font-bold"
            style={preview}
          >
            Controls
          </span>
        </div>
      </div>
    </section>
  );
};

