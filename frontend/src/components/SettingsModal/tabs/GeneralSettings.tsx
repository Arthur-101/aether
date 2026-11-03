import React, { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from '@tauri-apps/api/core';
import { Info, MonitorUp, PanelTop, SlidersHorizontal, Timer } from 'lucide-react';
import type { AIProviderConfig, AppearanceConfig, GeneralConfig } from '../../../types/ipc';
import {
  SettingsGroup,
  SettingsToggleRow,
} from '../SettingsControls';
import {
  settingsCardClass,
  settingsHintClass,
  settingsLabelClass,
  settingsMonoInputClass,
  settingsRowClass,
} from '../settingsStyles';

interface GeneralSettingsProps {
  general: GeneralConfig;
  appearance: AppearanceConfig;
  ai: AIProviderConfig;
  onChange: (patch: Partial<GeneralConfig>) => void;
  onAppearanceChange: (patch: Partial<AppearanceConfig>) => void;
  onAiChange: (patch: Partial<AIProviderConfig>) => void;
}

const MAX_IDLE_MINUTES = 24 * 60;

const IdleMinutesRow: React.FC<{
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ id, label, hint, value, onChange }) => (
  <div className={settingsCardClass}>
    <div className={settingsRowClass}>
      <span className="flex flex-col gap-0.5 pr-3">
        <label htmlFor={id} className="text-[11px] text-[var(--aether-text-2)]">
          {label}
        </label>
        <span className="text-[10px] leading-snug text-[var(--aether-text-3)]">
          {hint}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <input
          id={id}
          type="number"
          min={0}
          max={MAX_IDLE_MINUTES}
          value={value}
          onChange={(event) =>
            onChange(
              Math.max(
                0,
                Math.min(MAX_IDLE_MINUTES, Number(event.target.value) || 0)
              )
            )
          }
          className={`${settingsMonoInputClass} w-16 text-right`}
        />
        <span className={settingsLabelClass}>min</span>
      </span>
    </div>
  </div>
);

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  general,
  appearance,
  ai,
  onChange,
  onAppearanceChange,
  onAiChange,
}) => {
  const [version, setVersion] = useState('0.1.0');
  // `tauri dev` serves the UI from Vite, so the debug executable cannot boot
  // without the dev server. Only a packaged build can start with Windows.
  const autostartSupported = !import.meta.env.DEV;

  useEffect(() => {
    if (!isTauri()) return;
    void getVersion()
      .then(setVersion)
      .catch(() => undefined);
  }, []);

  return (
    <div className="flex flex-col gap-4 pb-2">
      <SettingsGroup
        icon={<MonitorUp size={13} />}
        title="Startup"
        hint="Aether starts with Windows and keeps the island ready without opening another window."
      >
        <div className={settingsCardClass}>
          <div className={settingsRowClass}>
            <SettingsToggleRow
              label="Start Aether when I sign in"
              hint={
                autostartSupported
                  ? 'Adds Aether to your Windows startup apps. You can turn it off at any time.'
                  : 'Available in the packaged app. The dev build needs the local dev server, so it cannot start on its own.'
              }
              checked={autostartSupported && general.start_on_startup}
              disabled={!autostartSupported}
              onChange={(value) => onChange({ start_on_startup: value })}
            />
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        icon={<PanelTop size={13} />}
        title="System tray"
        hint="The tray icon keeps Aether reachable while the overlay is hidden."
      >
        <div className={settingsCardClass}>
          <div className={settingsRowClass}>
            <SettingsToggleRow
              label="Show Aether in the system tray"
              hint="Left-click to show or hide the island. Right-click for Settings and Quit."
              checked={general.show_tray_icon}
              onChange={(value) => onChange({ show_tray_icon: value })}
            />
          </div>
        </div>
        <p className={settingsHintClass}>
          Hiding the island does not stop voice shortcuts or Region to Ask. Use the
          tray menu to bring it back.
        </p>
      </SettingsGroup>

      <SettingsGroup
        icon={<SlidersHorizontal size={13} />}
        title="Behaviour"
        hint="How the island responds while you work."
      >
        <SettingsToggleRow
          label="Auto-hide the pill"
          hint="Tuck it into the top bezel; touch the centre band to reveal it."
          checked={appearance.auto_hide_pill}
          onChange={(auto_hide_pill) => onAppearanceChange({ auto_hide_pill })}
        />
        <SettingsToggleRow
          label="Close when clicking outside"
          hint="Collapse the island when you click anywhere else."
          checked={appearance.close_on_outside_click}
          onChange={(close_on_outside_click) =>
            onAppearanceChange({ close_on_outside_click })
          }
        />
      </SettingsGroup>

      <SettingsGroup
        icon={<Timer size={13} />}
        title="Idle unload"
        hint="Free memory by unloading models left unused. They reload on the next request. Set 0 to keep them resident."
      >
        <IdleMinutesRow
          id="aether-llm-idle"
          label="Unload the local model after"
          hint="Applies to the local GGUF model. Cloud and Ollama are unaffected."
          value={ai.llm_idle_unload_minutes ?? 15}
          onChange={(llm_idle_unload_minutes) =>
            onAiChange({ llm_idle_unload_minutes })
          }
        />
        <IdleMinutesRow
          id="aether-embedding-idle"
          label="Unload the memory index after"
          hint="Frees the embedding model used for semantic memory search."
          value={ai.embedding_idle_unload_minutes ?? 10}
          onChange={(embedding_idle_unload_minutes) =>
            onAiChange({ embedding_idle_unload_minutes })
          }
        />
      </SettingsGroup>

      <SettingsGroup icon={<Info size={13} />} title="About">
        <div className={settingsCardClass}>
          <div className={settingsRowClass}>
            <span className="text-[11px] text-[var(--aether-text-2)]">Version</span>
            <span className="font-mono text-[10px] text-[var(--aether-text-1)]">
              {version}
            </span>
          </div>
          <div className={settingsRowClass}>
            <span className="text-[11px] text-[var(--aether-text-2)]">
              Data folder
            </span>
            <span className="max-w-[270px] truncate font-mono text-[10px] text-[var(--aether-text-3)]">
              %APPDATA%\Aether
            </span>
          </div>
          <div className={settingsRowClass}>
            <span className="text-[11px] text-[var(--aether-text-2)]">
              Privacy
            </span>
            <span className="text-[10px] text-[var(--aether-text-3)]">
              Local-first by default
            </span>
          </div>
        </div>
        <p className={settingsHintClass}>
          Region to Ask saves its screenshots here too, in the
          <span className="font-mono"> captures</span> folder. They stay on your PC
          until you delete them.
        </p>
      </SettingsGroup>
    </div>
  );
};
