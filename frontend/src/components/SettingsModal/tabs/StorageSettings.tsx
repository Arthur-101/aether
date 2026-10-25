import React from 'react';
import { ExternalLink, FileText, FolderOpen, HardDrive, Image, Monitor, Timer } from 'lucide-react';
import type { AppConfig } from '../../../types/ipc';
import { pickNativePath } from '../../../lib/system';
import { placementBesideSettings } from '../../../lib/externalWindows';
import { NOTE_THEMES } from '../../Island/noteThemes';
import { SettingsGroup, SettingsResetButton } from '../SettingsControls';
import {
  settingsCardClass,
  settingsHintClass,
  settingsInputClass,
  settingsLabelClass,
  settingsMonoInputClass,
  settingsRowClass,
  settingsSecondaryButtonClass,
  settingsSegmentClass,
} from '../settingsStyles';

interface StorageSettingsProps {
  storage: NonNullable<AppConfig['storage']>;
  resolvedNotesDirectory: string;
  onChange: (patch: NonNullable<AppConfig['storage']>) => void;
  onOpenNotesFolder: (path: string) => void;
}

const SAME = 'SAME_AS_SOURCE';
const DESKTOP = 'DESKTOP';

export const StorageSettings: React.FC<StorageSettingsProps> = ({
  storage,
  resolvedNotesDirectory,
  onChange,
  onOpenNotesFolder,
}) => {
  const value = storage.export_directory || SAME;
  const isSame = value === SAME;
  const isDesktop = value === DESKTOP;
  const isCustom = !isSame && !isDesktop;

  const chooseFolder = async () => {
    const folder = await pickNativePath('directory', 'all', placementBesideSettings());
    if (folder) onChange({ ...storage, export_directory: folder });
  };

  const chooseNotesFolder = async () => {
    const folder = await pickNativePath('directory', 'all', placementBesideSettings());
    if (folder) onChange({ ...storage, notes_directory: folder });
  };

  return (
    <div className="flex flex-col gap-4 pb-2">
      <SettingsGroup
        icon={<FolderOpen size={13} />}
        title="Output folder"
        hint="Converted images, documents, and compressed media are saved here. If a custom folder is unavailable, Aether falls back to the source file's folder."
      >
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            aria-pressed={isSame}
            onClick={() => onChange({ ...storage, export_directory: SAME })}
            className={settingsSegmentClass(isSame)}
          >
            <Image size={12} />
            Same as source
          </button>
          <button
            type="button"
            aria-pressed={isDesktop}
            onClick={() => onChange({ ...storage, export_directory: DESKTOP })}
            className={settingsSegmentClass(isDesktop)}
          >
            <Monitor size={12} />
            Desktop
          </button>
          <button
            type="button"
            aria-pressed={isCustom}
            onClick={chooseFolder}
            className={settingsSegmentClass(isCustom)}
          >
            <HardDrive size={12} />
            Custom folder
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span className={settingsLabelClass}>Custom folder</span>
          <div className="flex gap-1.5">
            <input
              readOnly
              value={isCustom ? value : ''}
              placeholder={
                isSame
                  ? 'Same folder as the source file'
                  : 'Windows Desktop folder'
              }
              aria-label="Custom export folder"
              className={`${settingsMonoInputClass} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={chooseFolder}
              className={settingsSecondaryButtonClass}
            >
              <FolderOpen size={12} />
              Browse
            </button>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        icon={<FileText size={13} />}
        title="Notes vault"
        hint="Plain Markdown with images in an assets subfolder. Blank uses the default Aether notes folder."
        action={
          storage.notes_directory ? (
            <SettingsResetButton
              onClick={() => onChange({ ...storage, notes_directory: '' })}
              label="Default"
              title="Reset to the default notes folder"
              ariaLabel="Reset notes folder to default"
            />
          ) : undefined
        }
      >
        <div className="flex flex-col gap-1">
          <span className={settingsLabelClass}>Vault folder</span>
          <div className="flex gap-1.5">
            <input
              readOnly
              value={storage.notes_directory || ''}
              placeholder="Default: %APPDATA%\Aether\notes"
              aria-label="Notes vault folder"
              className={`${settingsMonoInputClass} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={chooseNotesFolder}
              className={settingsSecondaryButtonClass}
            >
              <FolderOpen size={12} />
              Browse
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenNotesFolder(storage.notes_directory || resolvedNotesDirectory)
              }
              title="Open notes folder in Explorer"
              aria-label="Open notes folder in Explorer"
              className={`${settingsSecondaryButtonClass} w-8 px-0`}
            >
              <ExternalLink size={12} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className={settingsLabelClass}>Default note theme</span>
          <select
            value={storage.notes_theme || 'default'}
            onChange={(event) => onChange({ ...storage, notes_theme: event.target.value })}
            aria-label="Default note theme"
            className={`${settingsInputClass} w-44`}
          >
            {NOTE_THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </div>
        <p className={settingsHintClass}>
          Used for new notes. Every note can switch its own theme from the palette button;
          App accent follows the button colour chosen in Appearance.
        </p>
      </SettingsGroup>

      <SettingsGroup
        icon={<Timer size={13} />}
        title="Session memory"
        hint="Inactive sessions roll over to a new memory buffer after this period."
      >
        <div className={settingsCardClass}>
          <div className={settingsRowClass}>
            <label
              htmlFor="aether-session-timeout"
              className="text-[11px] text-[var(--aether-text-2)]"
            >
              Auto-save timeout
            </label>
            <span className="flex items-center gap-1.5">
              <input
                id="aether-session-timeout"
                type="number"
                min={1}
                max={240}
                value={storage.auto_session_timeout_minutes ?? 15}
                onChange={(event) =>
                  onChange({
                    ...storage,
                    auto_session_timeout_minutes: Number(event.target.value) || 15,
                  })
                }
                className={`${settingsMonoInputClass} w-16 text-right`}
              />
              <span className={settingsLabelClass}>min</span>
            </span>
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
};
