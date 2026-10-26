import React, { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from '@tauri-apps/api/core';
import { Info, MonitorUp, PanelTop } from 'lucide-react';
import type { GeneralConfig } from '../../../types/ipc';
import {
  SettingsGroup,
  SettingsToggleRow,
} from '../SettingsControls';
import {
  settingsCardClass,
  settingsHintClass,
  settingsRowClass,
} from '../settingsStyles';

interface GeneralSettingsProps {
  general: GeneralConfig;
  onChange: (patch: Partial<GeneralConfig>) => void;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  general,
  onChange,
}) => {
  const [version, setVersion] = useState('0.1.0');

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
              hint="Adds Aether to your Windows startup apps. You can turn it off at any time."
              checked={general.start_on_startup}
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
