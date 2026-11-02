import React, { useEffect } from 'react';
import {
  AlertTriangle,
  Check,
  Download,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ComponentInfo,
  ComponentPhase,
  ComponentProgress,
  ComponentResult,
} from '../../../types/ipc';
import { SettingsGroup } from '../SettingsControls';
import {
  settingsCardClass,
  settingsHintClass,
  settingsLabelClass,
  settingsSecondaryButtonClass,
} from '../settingsStyles';

interface ComponentsSettingsProps {
  components: ComponentInfo[] | null;
  progress: ComponentProgress | null;
  result: ComponentResult | null;
  onRefresh: () => void;
  onInstall: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}

const KIND_LABEL: Record<string, string> = {
  engine: 'Inference engine',
  voice: 'Voice',
  stt: 'Speech to text',
  component: 'Components',
};

const PHASE_LABEL: Record<ComponentPhase, string> = {
  downloading: 'Downloading',
  verifying: 'Verifying',
  extracting: 'Installing',
  installed: 'Installed',
};

function formatSize(bytes: number): string {
  if (!bytes) return '';
  const mb = bytes / 1_000_000;
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

const accentButtonClass =
  'accent-fill inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[10px] font-semibold transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)]';

const ComponentRow: React.FC<{
  component: ComponentInfo;
  progress: ComponentProgress | null;
  busy: boolean;
  onInstall: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}> = ({ component, progress, busy, onInstall, onCancel, onRemove }) => {
  const active = progress?.id === component.id ? progress : null;
  const size = formatSize(component.size || component.installed_size);

  let action: React.ReactNode;
  if (active) {
    action =
      active.phase === 'downloading' ? (
        <button
          type="button"
          onClick={() => onCancel(component.id)}
          className={settingsSecondaryButtonClass}
        >
          <X size={12} />
          Cancel
        </button>
      ) : (
        <span className="inline-flex h-7 items-center gap-1.5 px-2 text-[10px] text-[var(--aether-text-3)]">
          <Loader2 size={12} className="animate-spin" />
          {PHASE_LABEL[active.phase]}
        </span>
      );
  } else if (component.state === 'installed') {
    action = (
      <button
        type="button"
        onClick={() => onRemove(component.id)}
        disabled={busy}
        className={settingsSecondaryButtonClass}
      >
        <Trash2 size={12} />
        Remove
      </button>
    );
  } else if (component.state === 'requires_newer_app') {
    action = (
      <span className="px-2 text-[10px] text-[var(--aether-text-3)]">
        Needs Aether {component.min_app_version}
      </span>
    );
  } else if (component.state === 'unavailable') {
    action = (
      <span className="px-2 text-[10px] text-[var(--aether-text-3)]">
        Not published yet
      </span>
    );
  } else {
    const update = component.state === 'update_available';
    action = (
      <button
        type="button"
        onClick={() => onInstall(component.id)}
        disabled={busy}
        className={accentButtonClass}
      >
        <Download size={12} />
        {update ? 'Update' : 'Install'}
      </button>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--aether-line-soft)] px-2.5 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-[var(--aether-text-1)]">
            {component.name}
          </span>
          {component.recommended && component.state !== 'installed' ? (
            <span className="rounded-full border border-[var(--aether-accent)] px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-[var(--aether-accent)]">
              Recommended
            </span>
          ) : null}
          {component.installed_version ? (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-[var(--aether-text-3)]">
              <Check size={10} />
              {component.installed_version}
            </span>
          ) : null}
        </div>
        {component.description ? (
          <p className="mt-0.5 text-[9px] leading-snug text-[var(--aether-text-3)]">
            {component.description}
          </p>
        ) : null}
        {size ? (
          <p className="mt-0.5 text-[9px] text-[var(--aether-text-3)]">
            {size} download
          </p>
        ) : null}
        {active ? (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 w-40 overflow-hidden rounded-full bg-[var(--aether-fill-3)]">
              <div
                className="h-full rounded-full bg-[var(--aether-accent)] transition-[width]"
                style={{
                  width: `${active.phase === 'downloading' ? active.percent : 100}%`,
                }}
              />
            </div>
            <span className={settingsLabelClass}>
              {active.phase === 'downloading'
                ? `${active.percent}%`
                : PHASE_LABEL[active.phase]}
            </span>
          </div>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5">{action}</div>
    </div>
  );
};

export const ComponentsSettings: React.FC<ComponentsSettingsProps> = ({
  components,
  progress,
  result,
  onRefresh,
  onInstall,
  onCancel,
  onRemove,
}) => {
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const list = components ?? [];
  const busy = progress !== null;

  const groups: { kind: string; items: ComponentInfo[] }[] = [];
  for (const component of list) {
    const kind = component.kind || 'component';
    const group = groups.find((entry) => entry.kind === kind);
    if (group) group.items.push(component);
    else groups.push({ kind, items: [component] });
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      <SettingsGroup
        icon={<Download size={13} />}
        title="Optional components"
        hint="Aether ships without an inference engine so the base app stays small. Download only what you use; packs install under your local app data and never need administrator rights."
        action={
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            title="Refresh component list"
            aria-label="Refresh component list"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)]"
          >
            <RefreshCw size={10} />
            Refresh
          </button>
        }
      >
        {result && !result.ok ? (
          <div className="flex items-start gap-1.5 rounded-md border border-[var(--aether-danger-line)] bg-[var(--aether-danger-soft)] px-2.5 py-2 text-[10px] text-[var(--aether-text-2)]">
            <AlertTriangle size={12} className="mt-px shrink-0 text-[var(--aether-danger)]" />
            <span>{result.message || 'The component action failed.'}</span>
          </div>
        ) : null}

        {components === null ? (
          <p className={settingsHintClass}>Waiting for the Aether daemon...</p>
        ) : list.length === 0 ? (
          <p className={settingsHintClass}>
            No components are available for this build.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.kind} className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--aether-text-3)]">
                {KIND_LABEL[group.kind] ?? group.kind}
              </span>
              <div className={settingsCardClass}>
                {group.items.map((component) => (
                  <ComponentRow
                    key={component.id}
                    component={component}
                    progress={progress}
                    busy={busy}
                    onInstall={onInstall}
                    onCancel={onCancel}
                    onRemove={onRemove}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </SettingsGroup>
    </div>
  );
};
