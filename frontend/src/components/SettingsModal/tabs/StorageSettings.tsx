import React from 'react';
import { ExternalLink, FolderOpen, Image, Monitor, HardDrive } from 'lucide-react';
import type { AppConfig } from '../../../types/ipc';
import { pickNativePath } from '../../../lib/system';
import { placementBesideSettings } from '../../../lib/externalWindows';
import { NOTE_THEMES } from '../../Island/noteThemes';

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

  const optionClass = (active: boolean) =>
    `flex flex-1 flex-col gap-1 rounded-md border p-3 text-left transition ${
      active
        ? 'border-[var(--aether-accent)] bg-[var(--aether-accent)]/12 text-[var(--aether-text-1)]'
        : 'border-[var(--aether-line)] bg-[var(--aether-surface-1)] text-[var(--aether-text-2)] hover:border-[var(--aether-line-strong)]'
    }`;

  return (
    <div className="flex flex-col gap-4 text-xs">
      <div>
        <label className="mb-1.5 block text-[11px] font-medium text-[var(--aether-text-2)]">
          Default Output Directory
        </label>
        <p className="mb-2 text-[10px] text-[var(--aether-text-3)]">
          Converted images, documents, and compressed media are saved here.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ ...storage, export_directory: SAME })}
            className={optionClass(isSame)}
          >
            <Image size={16} className="mb-1 text-[var(--aether-accent-text)]" />
            <span className="font-semibold">Same as source</span>
            <span className="text-[10px] text-[var(--aether-text-3)]">Next to the original file</span>
          </button>
          <button
            onClick={() => onChange({ ...storage, export_directory: DESKTOP })}
            className={optionClass(isDesktop)}
          >
            <Monitor size={16} className="mb-1 text-[var(--aether-accent-text)]" />
            <span className="font-semibold">Desktop</span>
            <span className="text-[10px] text-[var(--aether-text-3)]">Windows Desktop folder</span>
          </button>
          <button onClick={chooseFolder} className={optionClass(isCustom)}>
            <HardDrive size={16} className="mb-1 text-[var(--aether-accent-text)]" />
            <span className="font-semibold">Custom folder</span>
            <span className="truncate text-[10px] text-[var(--aether-text-3)]">
              {isCustom ? value : 'Choose a folder'}
            </span>
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-[var(--aether-text-2)]">
          Custom Export Folder
        </label>
        <div className="flex gap-2">
          <input
            readOnly
            value={isCustom ? value : ''}
            placeholder="No custom folder selected"
            className="w-full rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-3 py-2 font-mono text-[11px] text-[var(--aether-text-1)] outline-none"
          />
          <button
            onClick={chooseFolder}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-5)] px-3 py-2 text-[11px] font-medium text-[var(--aether-text-1)] transition hover:bg-[#444]"
          >
            <FolderOpen size={13} />
            Browse
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-[var(--aether-text-3)]">
          If the custom folder is unavailable, Aether falls back to the source file's folder.
        </p>
      </div>

      <div className="border-t border-[var(--aether-line)] pt-3">
        <label className="mb-1 block text-[11px] font-medium text-[var(--aether-text-2)]">
          Notes Vault Folder
        </label>
        <p className="mb-2 text-[10px] text-[var(--aether-text-3)]">
          Notes are plain Markdown files with their images kept in an `assets` subfolder.
          Leave blank to use the default Aether notes folder.
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={storage.notes_directory || ''}
            placeholder="Default: %APPDATA%\Aether\notes"
            className="w-full rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-3 py-2 font-mono text-[11px] text-[var(--aether-text-1)] outline-none"
          />
          <button
            onClick={chooseNotesFolder}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-5)] px-3 py-2 text-[11px] font-medium text-[var(--aether-text-1)] transition hover:bg-[#444]"
          >
            <FolderOpen size={13} />
            Browse
          </button>
          <button
            onClick={() => onOpenNotesFolder(storage.notes_directory || resolvedNotesDirectory)}
            title="Open notes folder in Explorer"
            className="flex shrink-0 items-center justify-center rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-5)] px-2.5 py-2 text-[var(--aether-text-1)] transition hover:bg-[#444]"
          >
            <ExternalLink size={13} />
          </button>
        </div>
        {storage.notes_directory ? (
          <button
            onClick={() => onChange({ ...storage, notes_directory: '' })}
            className="mt-1 text-[10px] text-[var(--aether-accent-text)] transition hover:text-[var(--aether-accent-text)]"
          >
            Reset to default folder
          </button>
        ) : null}

        <label className="mb-1 mt-3 block text-[11px] font-medium text-[var(--aether-text-2)]">
          Default Note Theme
        </label>
        <select
          value={storage.notes_theme || 'default'}
          onChange={(event) => onChange({ ...storage, notes_theme: event.target.value })}
          className="w-48 rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-3 py-2 text-[11px] text-[var(--aether-text-1)] outline-none focus:border-[var(--aether-accent)]"
        >
          {NOTE_THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[10px] text-[var(--aether-text-3)]">
          Used for new notes. Every note can switch its own theme from the palette button;
          App accent follows the button colour chosen in Appearance.
        </p>
      </div>

      <div className="border-t border-[var(--aether-line)] pt-3">
        <label className="mb-1 block text-[11px] font-medium text-[var(--aether-text-2)]">
          Auto-Save Session Timeout (Minutes)
        </label>
        <input
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
          className="w-32 rounded-md border border-[var(--aether-line)] bg-[var(--aether-surface-1)] px-3 py-2 font-mono text-[11px] text-[var(--aether-text-1)] outline-none focus:border-[var(--aether-accent)]"
        />
        <p className="mt-1.5 text-[10px] text-[var(--aether-text-3)]">
          Inactive sessions roll over to a new memory buffer after this period.
        </p>
      </div>
    </div>
  );
};

