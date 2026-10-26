import React, { useRef } from 'react';
import type { DashboardTabId } from '../../types/ipc';
import { tabDefinition } from './tabRegistry';

interface DashboardTabsProps {
  tabs: DashboardTabId[];
  activeTab: DashboardTabId;
  onSelect: (tab: DashboardTabId) => void;
}

export const DashboardTabs: React.FC<DashboardTabsProps> = ({
  tabs,
  activeTab,
  onSelect,
}) => {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const key = event.key;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
    event.preventDefault();

    const nextIndex =
      key === 'Home'
        ? 0
        : key === 'End'
          ? tabs.length - 1
          : key === 'ArrowLeft'
            ? (index - 1 + tabs.length) % tabs.length
            : (index + 1) % tabs.length;

    onSelect(tabs[nextIndex]);
    // Keep focus on the newly selected tab; selecting does not remount it.
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Aether dashboard"
      className="flex shrink-0 items-center justify-center gap-1 border-b border-white/[0.035] px-5 py-3"
    >
      {tabs.map((id, index) => {
        const tab = tabDefinition(id);
        const Icon = tab.icon;
        const active = activeTab === id;
        return (
          <button
            key={id}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`aether-tab-${id}`}
            aria-selected={active}
            aria-controls="aether-tabpanel"
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11.5px] transition ${
              active
                ? 'accent-fill font-bold shadow-[0_6px_18px_rgba(0,0,0,0.2)]'
                : 'font-medium text-[var(--aether-text-2)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]'
            }`}
          >
            <Icon size={13} strokeWidth={active ? 2.1 : 1.8} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};
