import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff } from 'lucide-react';
import type { DashboardTabId } from '../../../types/ipc';
import { DASHBOARD_TABS, tabDefinition } from '../../Island/tabRegistry';

interface DashboardTabsSettingsProps {
  visible: DashboardTabId[];
  onChange: (tabs: DashboardTabId[]) => void;
}

export const DashboardTabsSettings: React.FC<DashboardTabsSettingsProps> = ({
  visible,
  onChange,
}) => {
  const [dragging, setDragging] = useState<DashboardTabId | null>(null);
  const hidden = DASHBOARD_TABS.map((tab) => tab.id).filter(
    (id) => !visible.includes(id)
  );
  const canHide = visible.length > 1;

  const toggle = (id: DashboardTabId) => {
    if (visible.includes(id)) {
      if (!canHide) return;
      onChange(visible.filter((tabId) => tabId !== id));
      return;
    }
    onChange([...visible, id]);
  };

  const move = (id: DashboardTabId, direction: -1 | 1) => {
    const index = visible.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= visible.length) return;
    const next = [...visible];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const dragOver = (
    event: React.DragEvent<HTMLDivElement>,
    target: DashboardTabId
  ) => {
    event.preventDefault();
    if (!dragging || dragging === target) return;
    const from = visible.indexOf(dragging);
    const to = visible.indexOf(target);
    if (from < 0 || to < 0 || !visible.includes(target)) return;
    const next = [...visible];
    next.splice(from, 1);
    next.splice(to, 0, dragging);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        {[...visible, ...hidden].map((id) => {
          const tab = tabDefinition(id);
          const Icon = tab.icon;
          const isVisible = visible.includes(id);
          const currentIndex = visible.indexOf(id);
          return (
            <div
              key={id}
              draggable={isVisible}
              onDragStart={(event) => {
                setDragging(id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => dragOver(event, id)}
              onDrop={() => setDragging(null)}
              title={isVisible ? 'Drag to reorder' : 'Hidden tab'}
              className={`group flex h-7 min-w-0 items-center gap-1 rounded-md border px-1.5 transition ${
                isVisible
                  ? 'cursor-grab border-[var(--aether-line)] bg-white/[0.03] active:cursor-grabbing'
                  : 'border-dashed border-[var(--aether-line)] bg-transparent opacity-55'
              } ${
                dragging === id
                  ? 'border-[var(--aether-accent)] bg-[var(--aether-fill-2)]'
                  : ''
              }`}
            >
              <Icon size={12} className="shrink-0 text-[var(--aether-text-2)]" />
              <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--aether-text-1)]">
                {tab.label}
              </span>
              {isVisible ? (
                <span className="flex w-[28px] shrink-0 items-center justify-end opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => move(id, -1)}
                    disabled={currentIndex === 0}
                    aria-label={`Move ${tab.label} up`}
                    className="rounded p-0.5 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)] disabled:opacity-25"
                  >
                    <ArrowUp size={9} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(id, 1)}
                    disabled={currentIndex === visible.length - 1}
                    aria-label={`Move ${tab.label} down`}
                    className="rounded p-0.5 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)] disabled:opacity-25"
                  >
                    <ArrowDown size={9} />
                  </button>
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => toggle(id)}
                disabled={isVisible && !canHide}
                aria-pressed={isVisible}
                aria-label={isVisible ? `Hide ${tab.label}` : `Show ${tab.label}`}
                title={
                  isVisible
                    ? canHide
                      ? 'Hide tab'
                      : 'At least one tab must stay visible'
                    : 'Show tab'
                }
                className="shrink-0 rounded p-0.5 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)] disabled:cursor-not-allowed disabled:opacity-25"
              >
                {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] leading-snug text-[var(--aether-text-3)]">
        Drag to reorder. Use the eye to hide a tab; at least one stays visible.
      </p>
    </div>
  );
};
