import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FolderOpen,
  Gauge,
  Plus,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import type { AppConfig, ToolGroupsState, ToolRisk } from '../../../types/ipc';
import { pickNativePath } from '../../../lib/system';
import { SettingsGroup, SettingsToggleRow } from '../SettingsControls';
import {
  settingsCardClass,
  settingsHintClass,
  settingsRowClass,
  settingsSecondaryButtonClass,
} from '../settingsStyles';

interface ToolsSettingsProps {
  enabledGroups: string[];
  disabledTools: string[];
  state: ToolGroupsState | null;
  filesystem: NonNullable<AppConfig['filesystem']>;
  onChange: (next: { enabled_groups: string[]; disabled_tools: string[] }) => void;
  onFilesystemChange: (next: NonNullable<AppConfig['filesystem']>) => void;
  onRefresh: () => void;
}

const presetButtonClass =
  'rounded border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-1 text-[9px] font-medium text-[var(--aether-text-2)] transition hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)]';

const riskClass: Record<ToolRisk, string> = {
  read: 'text-emerald-300',
  write: 'text-sky-300',
  destructive: 'text-rose-300',
  system: 'text-amber-300',
};

/**
 * Per-group and per-tool loadout. Only enabled schemas are sent to the model;
 * the backend also rejects direct calls to anything switched off here.
 */
export const ToolsSettings: React.FC<ToolsSettingsProps> = ({
  enabledGroups,
  disabledTools,
  state,
  filesystem,
  onChange,
  onFilesystemChange,
  onRefresh,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pickingRoot, setPickingRoot] = useState(false);

  // Settings mounts this tab on demand, so ask the daemon for live counts.
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const groups = useMemo(() => state?.groups ?? [], [state]);
  const allGroupIds = useMemo(() => groups.map((group) => group.id), [groups]);
  const enabledSet = useMemo(() => new Set(enabledGroups), [enabledGroups]);
  const disabledSet = useMemo(() => new Set(disabledTools), [disabledTools]);

  const activeTools = useMemo(
    () =>
      groups.flatMap((group) =>
        enabledSet.has(group.id)
          ? group.tools.filter((tool) => !disabledSet.has(tool.name))
          : []
      ),
    [groups, enabledSet, disabledSet]
  );
  const activeTokens = activeTools.reduce((sum, tool) => sum + tool.tokens, 0);
  const totalTokens = state?.total_tokens ?? 0;
  const totalTools = state?.total_tools ?? 0;
  const percent =
    totalTokens > 0
      ? Math.min(100, Math.round((activeTokens / totalTokens) * 100))
      : 0;

  const setGroups = (next: string[]) =>
    onChange({ enabled_groups: next, disabled_tools: disabledTools });
  const setDisabled = (next: string[]) =>
    onChange({ enabled_groups: enabledGroups, disabled_tools: next });

  const toggleGroup = (id: string, on: boolean) => {
    setGroups(
      allGroupIds.filter((groupId) =>
        groupId === id ? on : enabledSet.has(groupId)
      )
    );
  };

  const toggleTool = (name: string, on: boolean) => {
    setDisabled(
      on
        ? disabledTools.filter((tool) => tool !== name)
        : [...disabledTools, name]
    );
  };

  const toggleExpanded = (id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const extraRoots = filesystem.allowed_roots ?? [];
  const addRoot = async () => {
    if (pickingRoot || extraRoots.length >= 10) return;
    setPickingRoot(true);
    try {
      const picked = await pickNativePath('directory');
      if (!picked) return;
      const normalized = picked.replace(/[\\/]+$/, '');
      if (extraRoots.some((root) => root.toLowerCase() === normalized.toLowerCase())) {
        return;
      }
      onFilesystemChange({ allowed_roots: [...extraRoots, normalized] });
    } finally {
      setPickingRoot(false);
    }
  };

  const removeRoot = (path: string) => {
    onFilesystemChange({
      allowed_roots: extraRoots.filter((root) => root !== path),
    });
  };

  if (!state) {
    return (
      <div className="py-16 text-center text-xs text-[var(--aether-text-3)]">
        Reading the tool registry…
      </div>
    );
  }

  const leanGroups = state.lean_groups.filter((id) => allGroupIds.includes(id));
  const isLean =
    leanGroups.length > 0 &&
    leanGroups.length === enabledGroups.length &&
    leanGroups.every((id) => enabledSet.has(id));

  return (
    <div className="flex flex-col gap-4 pb-2">
      <SettingsGroup
        icon={<Gauge size={13} />}
        title="Prompt budget"
        hint="Every enabled tool schema is sent on every model call. Trimming the loadout leaves more context for the conversation and helps small models choose correctly."
      >
        <div className={settingsCardClass}>
          <div className="px-2.5 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] text-[var(--aether-text-1)]">
                {activeTools.length} of {totalTools} tools enabled
              </span>
              <span className="font-mono text-[10px] text-[var(--aether-text-2)]">
                ~{activeTokens.toLocaleString()} / {totalTokens.toLocaleString()}{' '}
                tokens
              </span>
            </div>
            <div
              className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--aether-fill-3)]"
              role="presentation"
            >
              <div
                className="h-full rounded-full bg-[var(--aether-accent)] transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className={`mt-2 ${settingsHintClass}`}>
              Changes apply to the next message after Save &amp; Apply.
            </p>
          </div>
          <div className="border-t border-[var(--aether-line-soft)] px-2.5 py-2">
            <SettingsToggleRow
              label="Lean loadout"
              hint="Send notes, media, web, and clock tools only. Turn this off to enable every group."
              checked={isLean}
              onChange={(on) => setGroups(on ? leanGroups : allGroupIds)}
            />
          </div>
          {activeTools.length === 0 ? (
            <div className="flex items-start gap-2 border-t border-[var(--aether-line-soft)] px-2.5 py-2 text-[10px] leading-snug text-[#ffd7d9]">
              <CircleAlert size={13} className="mt-0.5 shrink-0 text-[#ff99a4]" />
              <span>
                Aether can chat, but it will not be able to run any tools.
              </span>
            </div>
          ) : null}
        </div>
      </SettingsGroup>

      <SettingsGroup
        icon={<Wrench size={13} />}
        title="Tool groups"
        hint="Turn a group off to remove every tool in it. Expand a group to disable individual tools without losing the rest."
        action={
          disabledTools.length > 0 ? (
            <button
              type="button"
              onClick={() => setDisabled([])}
              className={presetButtonClass}
              title="Re-enable every individually disabled tool"
            >
              Reset {disabledTools.length} tool
              {disabledTools.length === 1 ? '' : 's'}
            </button>
          ) : undefined
        }
      >
        <div className={settingsCardClass}>
          {groups.map((group) => {
            const groupOn = enabledSet.has(group.id);
            const groupActive = group.tools.filter(
              (tool) => groupOn && !disabledSet.has(tool.name)
            ).length;
            const isExpanded = expanded.has(group.id);
            const Chevron = isExpanded ? ChevronDown : ChevronRight;
            return (
              <div
                key={group.id}
                className="border-b border-[var(--aether-line-soft)] last:border-b-0"
              >
                <div className={`${settingsRowClass} border-b-0`}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(group.id)}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${group.label}`}
                    title={isExpanded ? 'Hide tools' : 'Show tools'}
                    className="rounded p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)]"
                  >
                    <Chevron size={13} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <SettingsToggleRow
                      label={group.label}
                      hint={`${group.hint} · ${groupActive} of ${group.tools.length} tools · ~${group.tokens} tokens`}
                      checked={groupOn}
                      onChange={(on) => toggleGroup(group.id, on)}
                    />
                  </div>
                </div>
                {isExpanded ? (
                  <div className="border-t border-[var(--aether-line-soft)] bg-black/10 px-2.5 py-1.5 pl-7">
                    {group.tools.map((tool) => (
                      <div key={tool.name} className="py-1">
                        <SettingsToggleRow
                          label={
                            <span className="font-mono text-[10px]">
                              {tool.name}
                            </span>
                          }
                          badge={
                            <span
                              className={`font-mono text-[8px] uppercase tracking-wide ${riskClass[tool.risk]}`}
                            >
                              {tool.risk}
                            </span>
                          }
                          hint={`~${tool.tokens} tokens`}
                          checked={groupOn && !disabledSet.has(tool.name)}
                          onChange={(on) => toggleTool(tool.name, on)}
                          disabled={!groupOn}
                        />
                      </div>
                    ))}
                    {!groupOn ? (
                      <p className={`pb-1 ${settingsHintClass}`}>
                        Enable {group.label} to change individual tools.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SettingsGroup>

      <SettingsGroup
        icon={<FolderOpen size={13} />}
        title="File System roots"
        hint="Aether can read and change files only inside these folders. Every subfolder is included automatically."
        action={
          <span className={`font-mono text-[9px] ${settingsHintClass}`}>
            {extraRoots.length}/10 added
          </span>
        }
      >
        <div className={settingsCardClass}>
          {['Desktop', 'Downloads', 'Documents'].map((label) => (
            <div key={label} className={settingsRowClass}>
              <div className="flex min-w-0 items-center gap-2">
                <ShieldCheck size={13} className="shrink-0 text-emerald-300" />
                <div className="min-w-0">
                  <p className="text-[11px] text-[var(--aether-text-1)]">{label}</p>
                  <p className={settingsHintClass}>
                    Included by default · all subfolders
                  </p>
                </div>
              </div>
              <span className="font-mono text-[8px] uppercase tracking-wide text-emerald-300">
                default
              </span>
            </div>
          ))}
          {extraRoots.map((root) => (
            <div key={root} className={settingsRowClass}>
              <div className="flex min-w-0 items-center gap-2">
                <FolderOpen
                  size={13}
                  className="shrink-0 text-[var(--aether-accent-text)]"
                />
                <div className="min-w-0">
                  <p className="truncate font-mono text-[10px] text-[var(--aether-text-1)]" title={root}>
                    {root}
                  </p>
                  <p className={settingsHintClass}>All subfolders included</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeRoot(root)}
                aria-label={`Remove ${root}`}
                title="Stop allowing this folder"
                className="rounded p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-rose-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)]"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-2.5 py-2">
            <p className={settingsHintClass}>
              Add a folder to grant its entire subtree. Profile, AppData,
              Windows, Program Files, ProgramData, and drive roots are rejected.
            </p>
            <button
              type="button"
              onClick={addRoot}
              disabled={pickingRoot || extraRoots.length >= 10}
              className={settingsSecondaryButtonClass}
            >
              <Plus size={12} />
              {pickingRoot ? 'Choosing…' : 'Add folder'}
            </button>
          </div>
        </div>
        {!enabledSet.has('filesystem') ? (
          <p className={`flex items-start gap-1.5 ${settingsHintClass}`}>
            <CircleAlert size={11} className="mt-0.5 shrink-0 text-amber-300" />
            The File System group is off, so these roots are not used until you
            enable it above.
          </p>
        ) : null}
      </SettingsGroup>
    </div>
  );
};
