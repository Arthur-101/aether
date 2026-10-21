import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
} from 'lucide-react';
import type { DashboardTabId } from '../../../types/ipc';
import {
  DASHBOARD_TABS,
  DEFAULT_TAB_IDS,
  tabDefinition,
} from '../../Island/tabRegistry';

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
    <section>
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h5 className="text-xs font-semibold text-white">Dashboard tabs</h5>
          <p className="mt-0.5 text-[10px] text-[#8b8b8b]">
            Drag visible tabs to reorder. At least one must stay visible.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...DEFAULT_TAB_IDS])}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-[#8b8b8b] transition hover:bg-white/5 hover:text-white"
          title="Reset tab order and visibility"
        >
          <RotateCcw size={11} />
          Reset
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10">
        {[...visible, ...hidden].map((id, index) => {
          const tab = tabDefinition(id);
          const Icon = tab.icon;
          const isVisible = index < visible.length;
          const currentIndex = visible.indexOf(id);
          return (
            <div
              key={id}
              draggable={isVisible}
              onDragStart={() => setDragging(id)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => dragOver(event, id)}
              onDrop={() => setDragging(null)}
              className={`flex items-center gap-2 border-b border-white/[0.06] px-2 py-1.5 last:border-b-0 ${
                isVisible ? 'bg-white/[0.025]' : 'bg-transparent opacity-60'
              }`}
            >
              <GripVertical
                size={13}
                className={isVisible ? 'cursor-grab text-[#777]' : 'text-[#444]'}
              />
              <Icon size={13} className="shrink-0 text-[#c7c7c7]" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-[#e5e2da]">
                {tab.label}
              </span>
              {isVisible ? (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(id, -1)}
                    disabled={currentIndex === 0}
                    className="rounded p-0.5 text-[#777] transition hover:bg-white/10 hover:text-white disabled:opacity-25"
                    title="Move tab up"
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(id, 1)}
                    disabled={currentIndex === visible.length - 1}
                    className="rounded p-0.5 text-[#777] transition hover:bg-white/10 hover:text-white disabled:opacity-25"
                    title="Move tab down"
                  >
                    <ArrowDown size={11} />
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => toggle(id)}
                disabled={isVisible && !canHide}
                aria-pressed={isVisible}
                className="rounded p-1 text-[#8b8b8b] transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                title={
                  isVisible
                    ? canHide
                      ? 'Hide tab'
                      : 'At least one tab must stay visible'
                    : 'Show tab'
                }
              >
                {isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
