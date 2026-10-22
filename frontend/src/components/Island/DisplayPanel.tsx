import React from 'react';
import { Moon, Sun } from 'lucide-react';
import type { DisplayInfo } from '../../types/ipc';
import { ControlPanel, PanelFooterRow } from './ControlPanel';
import { ToggleCard } from './ToggleCard';
import { ValueSlider } from './ValueSlider';

interface DisplayPanelProps {
  brightness: number | null;
  darkMode: boolean;
  display: DisplayInfo | null;
  onBrightnessChange: (value: number) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  onToggleDarkMode: (next: boolean) => void;
  onOpenDisplaySettings: () => void;
}

const BRIGHTNESS_FILL = 'linear-gradient(90deg, #9ec8ff 0%, #5d8fce 100%)';

/**
 * The DISPLAY panel: panel brightness, the Windows theme switch, and the
 * live mode readout in the footer.
 */
export const DisplayPanel: React.FC<DisplayPanelProps> = ({
  brightness,
  darkMode,
  display,
  onBrightnessChange,
  onInteractionStart,
  onInteractionEnd,
  onToggleDarkMode,
  onOpenDisplaySettings,
}) => {
  const level = brightness ?? 0;
  const resolution =
    display && display.width && display.height
      ? `${display.width} × ${display.height}`
      : '—';
  const refresh = display?.refresh_hz ? ` · ${display.refresh_hz} Hz` : '';

  return (
    <ControlPanel
      label="Display"
      icon={
        <button
          type="button"
          onClick={onOpenDisplaySettings}
          title="Open display settings"
          aria-label="Open display settings"
          className="rounded p-0.5 text-[#9ec8ff] transition hover:bg-[var(--aether-fill-2)]"
        >
          <Sun size={14} />
        </button>
      }
      footer={
        <PanelFooterRow
          left="Display"
          leftClassName="text-[8.5px] text-[var(--aether-text-3)]"
          right={`${resolution}${refresh}`}
        />
      }
    >
      <ValueSlider
        label="Panel brightness"
        icon={<Sun size={15} className="text-[#172334]" />}
        value={level}
        display={brightness == null ? '--' : `${Math.round(level)}%`}
        fill={BRIGHTNESS_FILL}
        onChange={onBrightnessChange}
        onInteractionStart={onInteractionStart}
        onInteractionEnd={onInteractionEnd}
      />

      <div className="mt-2.5">
        <ToggleCard
          compact
          icon={darkMode ? <Moon size={13} /> : <Sun size={13} />}
          title="Dark mode"
          subtitle={darkMode ? 'On · Windows dark theme' : 'Off · Windows light theme'}
          checked={darkMode}
          onToggle={onToggleDarkMode}
        />
      </div>
    </ControlPanel>
  );
};
