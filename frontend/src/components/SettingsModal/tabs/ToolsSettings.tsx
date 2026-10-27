import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Gauge,
  Wrench,
} from 'lucide-react';
import type { ToolGroupsState, ToolRisk } from '../../../types/ipc';
import { SettingsGroup, SettingsToggleRow } from '../SettingsControls';
import {
  settingsCardClass,
  settingsHintClass,
  settingsRowClass,
} from '../settingsStyles';

interface ToolsSettingsProps {
  enabledGroups: string[];
  disabledTools: string[];
  state: ToolGroupsState | null;
  onChange: (next: { enabled_groups: string[]; disabled_tools: string[] }) => void;
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
  onChange,
  onRefresh,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

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
    </div>
  );
};
