import React from 'react';
import { FolderOpen, Image, Monitor, HardDrive } from 'lucide-react';
import type { AppConfig } from '../../../types/ipc';
import { pickNativePath } from '../../../lib/system';

interface StorageSettingsProps {
  storage: NonNullable<AppConfig['storage']>;
  onChange: (patch: NonNullable<AppConfig['storage']>) => void;
}

const SAME = 'SAME_AS_SOURCE';
const DESKTOP = 'DESKTOP';

export const StorageSettings: React.FC<StorageSettingsProps> = ({ storage, onChange }) => {
  const value = storage.export_directory || SAME;
  const isSame = value === SAME;
  const isDesktop = value === DESKTOP;
  const isCustom = !isSame && !isDesktop;

  const chooseFolder = async () => {
    const folder = await pickNativePath('directory', 'all');
    if (folder) onChange({ ...storage, export_directory: folder });
  };

  const optionClass = (active: boolean) =>
    `flex flex-1 flex-col gap-1 rounded-md border p-3 text-left transition ${
      active
        ? 'border-[#0067C0] bg-[#0067C0]/12 text-white'
        : 'border-white/10 bg-[#2b2b2b] text-[#c7c7c7] hover:border-white/20'
    }`;

  return (
    <div className="flex flex-col gap-4 text-xs">
      <div>
        <label className="mb-1.5 block text-[11px] font-medium text-[#c7c7c7]">
          Default Output Directory
        </label>
        <p className="mb-2 text-[10px] text-[#8b8b8b]">
          Converted images, documents, and compressed media are saved here.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ ...storage, export_directory: SAME })}
            className={optionClass(isSame)}
          >
            <Image size={16} className="mb-1 text-[#60cdff]" />
            <span className="font-semibold">Same as source</span>
            <span className="text-[10px] text-[#8b8b8b]">Next to the original file</span>
          </button>
          <button
            onClick={() => onChange({ ...storage, export_directory: DESKTOP })}
            className={optionClass(isDesktop)}
          >
            <Monitor size={16} className="mb-1 text-[#60cdff]" />
            <span className="font-semibold">Desktop</span>
            <span className="text-[10px] text-[#8b8b8b]">Windows Desktop folder</span>
          </button>
          <button onClick={chooseFolder} className={optionClass(isCustom)}>
            <HardDrive size={16} className="mb-1 text-[#60cdff]" />
            <span className="font-semibold">Custom folder</span>
            <span className="truncate text-[10px] text-[#8b8b8b]">
              {isCustom ? value : 'Choose a folder'}
            </span>
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-[#c7c7c7]">
          Custom Export Folder
        </label>
        <div className="flex gap-2">
          <input
            readOnly
            value={isCustom ? value : ''}
            placeholder="No custom folder selected"
            className="w-full rounded-md border border-white/10 bg-[#2b2b2b] px-3 py-2 font-mono text-[11px] text-[#f3f3f3] outline-none"
          />
          <button
            onClick={chooseFolder}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-[#383838] px-3 py-2 text-[11px] font-medium text-white transition hover:bg-[#444]"
          >
            <FolderOpen size={13} />
            Browse
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-[#8b8b8b]">
          If the custom folder is unavailable, Aether falls back to the source file's folder.
        </p>
      </div>

      <div className="border-t border-white/10 pt-3">
        <label className="mb-1 block text-[11px] font-medium text-[#c7c7c7]">
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
          className="w-32 rounded-md border border-white/10 bg-[#2b2b2b] px-3 py-2 font-mono text-[11px] text-[#f3f3f3] outline-none focus:border-[#0067c0]"
        />
        <p className="mt-1.5 text-[10px] text-[#8b8b8b]">
          Inactive sessions roll over to a new memory buffer after this period.
        </p>
      </div>
    </div>
  );
};
