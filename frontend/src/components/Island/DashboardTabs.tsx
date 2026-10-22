import React from 'react';
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
}) => (
  <div
    role="tablist"
    aria-label="Aether dashboard"
    className="flex shrink-0 items-center justify-center gap-1 border-b border-white/[0.035] px-5 py-3"
  >
    {tabs.map((id) => {
      const tab = tabDefinition(id);
      const Icon = tab.icon;
      const active = activeTab === id;
      return (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onSelect(id)}
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
