import React, { useLayoutEffect, useRef } from 'react';
import type { DashboardTabId, SpeedTestResult, SystemStats } from '../../types/ipc';
import type { NotesApi } from '../../types/notes';
import { ClockTasksTab } from './ClockTasksTab';
import { DashboardTabs } from './DashboardTabs';
import { IslandControls } from './IslandControls';
import { IslandTabContent } from './IslandTabContent';
import { QuickChat } from './QuickChat';

interface IslandBodyProps {
  tabs: DashboardTabId[];
  activeTab: DashboardTabId;
  onSelectTab: (tab: DashboardTabId) => void;
  systemStats: SystemStats | null;
  speedTest: SpeedTestResult | null;
  controls: React.ComponentProps<typeof IslandControls>;
  chat: React.ComponentProps<typeof QuickChat>;
  clock: React.ComponentProps<typeof ClockTasksTab>;
  notes: NotesApi;
  onRunSpeedTest: () => void;
  /** Reports the natural height of the rendered body so the shell can fit it. */
  onMeasured: (height: number) => void;
  /** Reports the width the tab strip needs, so the shell never clips a label. */
  onTabsWidth: (width: number) => void;
}

/**
 * The tab strip plus the scrolling tab body.
 *
 * The body is measured rather than assumed, which is what lets the island
 * open at the size the active tab actually needs. The strip is measured
 * too: the shell must never be narrower than the tabs, or their labels
 * start wrapping.
 */
export const IslandBody: React.FC<IslandBodyProps> = ({
  tabs,
  activeTab,
  onSelectTab,
  systemStats,
  speedTest,
  controls,
  chat,
  clock,
  notes,
  onRunSpeedTest,
  onMeasured,
  onTabsWidth,
}) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    const measure = () => onMeasured(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [activeTab, onMeasured]);

  useLayoutEffect(() => {
    const strip = tabsRef.current;
    if (!strip) return;
    const measure = () => {
      const buttons = strip.querySelectorAll('button');
      if (buttons.length === 0) return;
      const first = buttons[0].getBoundingClientRect();
      const last = buttons[buttons.length - 1].getBoundingClientRect();
      // The strip is centred, so the first and last button give the natural
      // content width even when the row overflows a narrow shell.
      onTabsWidth(Math.ceil(last.right - first.left) + 44);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [tabs, onTabsWidth]);

  return (
    <>
      <div ref={tabsRef} className="shrink-0">
        <DashboardTabs tabs={tabs} activeTab={activeTab} onSelect={onSelectTab} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div ref={bodyRef} className="w-full">
          <IslandTabContent
            tab={activeTab}
            systemStats={systemStats}
            speedTest={speedTest}
            controls={controls}
            chat={chat}
            clock={clock}
            notes={notes}
            onRunSpeedTest={onRunSpeedTest}
          />
        </div>
      </div>
    </>
  );
};
