import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  ExternalLink,
  FileText,
  FolderOpen,
  HardDrive,
  Image,
  Monitor,
  Timer,
  X,
} from 'lucide-react';
import type { AppConfig, ComponentDirResult } from '../../../types/ipc';
import { pickNativePath } from '../../../lib/system';
import {
  openExternalTarget,
  placementBesideSettings,
} from '../../../lib/externalWindows';
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
  /** Effective pack folder (resolved by the backend). */
  componentsDirectory: string;
  /** Built-in pack folder, shown when no custom one is set. */
  componentsDefaultDirectory: string;
  componentDirResult: ComponentDirResult | null;
  hasInstalledComponents: boolean;
  onChange: (patch: NonNullable<AppConfig['storage']>) => void;
  onChangeComponentsDirectory: (path: string, move: boolean) => void;
  onOpenNotesFolder: (path: string) => void;
}

const SAME = 'SAME_AS_SOURCE';
const DESKTOP = 'DESKTOP';

export const StorageSettings: React.FC<StorageSettingsProps> = ({
  storage,
  resolvedNotesDirectory,
  componentsDirectory,
  componentsDefaultDirectory,
  componentDirResult,
  hasInstalledComponents,
  onChange,
  onChangeComponentsDirectory,
  onOpenNotesFolder,
}) => {
  const value = storage.export_directory || SAME;
  const isSame = value === SAME;
  const isDesktop = value === DESKTOP;
  const isCustom = !isSame && !isDesktop;

  // A picked folder that awaits the move-or-switch choice.
  const [pendingDir, setPendingDir] = useState<string | null>(null);

  // The backend persists the pack folder itself (it has to move files), so keep
  // the draft in step: otherwise a later Save would rewrite it back to the old
  // value and undo the move.
  useEffect(() => {
    if (!componentDirResult?.ok || !componentDirResult.directory) return;
    const next =
      componentDirResult.directory === componentsDefaultDirectory
        ? ''
        : componentDirResult.directory;
    if ((storage.components_directory || '') !== next) {
      onChange({ ...storage, components_directory: next });
    }
    // Only react to a fresh result; `storage`/`onChange` are intentionally not
    // dependencies so this never loops on the update it just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentDirResult]);

  const chooseFolder = async () => {
    const folder = await pickNativePath('directory', 'all', placementBesideSettings());
    if (folder) onChange({ ...storage, export_directory: folder });
  };

  const chooseNotesFolder = async () => {
    const folder = await pickNativePath('directory', 'all', placementBesideSettings());
    if (folder) onChange({ ...storage, notes_directory: folder });
  };

  const requestComponentsDir = (folder: string) => {
    if (!folder) return;
    if (folder === (storage.components_directory || componentsDirectory)) return;
    // Nothing to relocate, so skip the choice and just switch.
    if (!hasInstalledComponents) {
      onChangeComponentsDirectory(folder, false);
      return;
    }
    setPendingDir(folder);
  };

  const chooseComponentsFolder = async () => {
    const folder = await pickNativePath('directory', 'all', placementBesideSettings());
    if (folder) requestComponentsDir(folder);
  };

  const confirmComponentsDir = (move: boolean) => {
    if (!pendingDir) return;
    onChangeComponentsDirectory(pendingDir, move);
    setPendingDir(null);
  };

  const moveSummary = (result: ComponentDirResult): string => {
    const moved = result.moved?.length ?? 0;
    const remaining = result.remaining?.length ?? 0;
    const parts: string[] = [];
    if (moved) parts.push(`Moved ${moved} pack${moved === 1 ? '' : 's'}`);
    if (remaining) {
      parts.push(`${remaining} left in the old folder`);
    }
    if (!parts.length) {
      return `Component packs now save to ${result.directory ?? componentsDirectory}.`;
    }
    return `${parts.join('; ')}. New downloads use ${
      result.directory ?? componentsDirectory
    }.`;
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
        icon={<Boxes size={13} />}
        title="Component packs"
        hint="Optional engine, voice, speech, and media packs download here. Blank uses the default Aether folder."
        action={
          storage.components_directory ? (
            <SettingsResetButton
              onClick={() => requestComponentsDir(componentsDefaultDirectory)}
              label="Default"
              title="Move packs back to the default folder"
              ariaLabel="Reset component packs folder to default"
            />
          ) : undefined
        }
      >
        <div className="flex flex-col gap-1">
          <span className={settingsLabelClass}>Packs folder</span>
          <div className="flex gap-1.5">
            <input
              readOnly
              value={storage.components_directory || ''}
              placeholder={`Default: ${componentsDefaultDirectory}`}
              aria-label="Component packs folder"
              className={`${settingsMonoInputClass} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={chooseComponentsFolder}
              className={settingsSecondaryButtonClass}
            >
              <FolderOpen size={12} />
              Browse
            </button>
            <button
              type="button"
              onClick={() =>
                void openExternalTarget(
                  storage.components_directory || componentsDirectory,
                  placementBesideSettings()
                )
              }
              title="Open packs folder in Explorer"
              aria-label="Open packs folder in Explorer"
              className={`${settingsSecondaryButtonClass} w-8 px-0`}
            >
              <ExternalLink size={12} />
            </button>
          </div>
        </div>

        {pendingDir ? (
          <div className="flex flex-col gap-1.5 rounded-md border border-[var(--aether-border)] bg-[var(--aether-surface-2)] px-2.5 py-2">
            <span className="text-[10px] leading-snug text-[var(--aether-text-2)]">
              Use <span className="font-mono">{pendingDir}</span> for component packs?
              Move the packs you already installed, or leave them and use the new
              folder for future downloads.
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => confirmComponentsDir(true)}
                className={`${settingsSecondaryButtonClass} flex-1 justify-center`}
              >
                Move packs
              </button>
              <button
                type="button"
                onClick={() => confirmComponentsDir(false)}
                className={`${settingsSecondaryButtonClass} flex-1 justify-center`}
              >
                New downloads only
              </button>
              <button
                type="button"
                onClick={() => setPendingDir(null)}
                title="Cancel"
                aria-label="Cancel folder change"
                className={`${settingsSecondaryButtonClass} w-8 px-0`}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        ) : null}

        {componentDirResult && !componentDirResult.ok ? (
          <div className="flex items-start gap-2 rounded-md border border-[#ff99a4]/40 bg-[#442726] px-2.5 py-2 text-[10px] leading-snug text-[#ffd7d9]">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{componentDirResult.message}</span>
          </div>
        ) : componentDirResult?.ok ? (
          <p className={settingsHintClass}>{moveSummary(componentDirResult)}</p>
        ) : null}
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
