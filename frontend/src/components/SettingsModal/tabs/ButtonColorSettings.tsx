import React, { useEffect, useState } from 'react';
import type { AppearanceConfig } from '../../../types/ipc';
import {
  ACCENT_PRESETS,
  DEFAULT_APPEARANCE,
  accentGradientSuppressed,
  accentStyle,
} from '../../Island/appearance';
import { normalizeHex } from '../../Island/contrast';
import { SettingsResetButton } from '../SettingsControls';

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
  const gradientSuppressed = accentGradientSuppressed(appearance);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--aether-text-3)]">Accent</span>
        <SettingsResetButton
          onClick={() =>
            onChange({
              ...appearance,
              button_primary: DEFAULT_APPEARANCE.button_primary,
              button_secondary: DEFAULT_APPEARANCE.button_secondary,
              button_gradient: DEFAULT_APPEARANCE.button_gradient,
            })
          }
          title="Reset accent colour"
          ariaLabel="Reset accent colour"
        />
      </div>

      <div className="flex items-center gap-1.5">
        {ACCENT_PRESETS.map((item) => {
          const active = preset?.id === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                update({
                  button_primary: item.primary,
                  button_secondary: item.secondary,
                })
              }
              aria-label={`${item.label} accent`}
              aria-pressed={active}
              title={item.label}
              className={`h-5 w-5 shrink-0 rounded-full transition ${
                active
                  ? 'ring-2 ring-[var(--aether-text-1)] ring-offset-1 ring-offset-[var(--aether-surface-1)]'
                  : 'ring-1 ring-white/20 hover:ring-white/50'
              }`}
              style={{
                background: `linear-gradient(135deg, ${item.primary}, ${item.secondary})`,
              }}
            />
          );
        })}
        <span className="ml-1 truncate text-[10px] text-[var(--aether-text-2)]">
          {preset?.label ?? 'Custom'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 items-center gap-1.5 rounded-md border border-[var(--aether-line)] bg-black/15 px-1.5 py-1">
          <span className="shrink-0 text-[9px] text-[var(--aether-text-3)]">Primary</span>
          <input
            type="color"
            value={appearance.button_primary}
            onChange={(event) => setPrimary(event.target.value)}
            className="h-5 w-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
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
            className="min-w-0 flex-1 rounded border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-1.5 py-0.5 font-mono text-[9.5px] text-[var(--aether-text-1)] outline-none focus:border-[var(--aether-accent)]"
            aria-label="Primary color hex"
          />
        </label>
        <label className="flex min-w-0 items-center gap-1.5 rounded-md border border-[var(--aether-line)] bg-black/15 px-1.5 py-1">
          <span className="shrink-0 text-[9px] text-[var(--aether-text-3)]">Secondary</span>
          <input
            type="color"
            value={appearance.button_secondary}
            onChange={(event) => setSecondary(event.target.value)}
            className="h-5 w-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
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
            className="min-w-0 flex-1 rounded border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-1.5 py-0.5 font-mono text-[9.5px] text-[var(--aether-text-1)] outline-none focus:border-[var(--aether-accent)]"
            aria-label="Secondary color hex"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-[var(--aether-text-2)]">
          <input
            type="checkbox"
            checked={appearance.button_gradient}
            onChange={(event) => update({ button_gradient: event.target.checked })}
            className="accent-[var(--aether-accent)]"
          />
          Gradient
        </label>
        <span className="flex items-center gap-1.5">
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-semibold"
            style={preview}
          >
            Preview
          </span>
          <span className="rounded-full border border-[var(--aether-line)] px-2 py-0.5 text-[9px] text-[var(--aether-text-3)]">
            Inactive
          </span>
        </span>
      </div>
      {gradientSuppressed ? (
        <p className="text-[9px] leading-relaxed text-[var(--aether-text-3)]">
          Gradient is off: the two colours are too far apart to keep labels readable.
        </p>
      ) : null}
    </div>
  );
};
