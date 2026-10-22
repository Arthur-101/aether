import React from 'react';
import type { DashboardTabId, SpeedTestResult, SystemStats } from '../../types/ipc';
import type { NotesApi } from '../../types/notes';
import { ClockTasksTab } from './ClockTasksTab';
import { IslandControls } from './IslandControls';
import { PlaceholderPanel } from './PlaceholderPanel';
import { QuickChat } from './QuickChat';
import { StatsTab } from './StatsTab';
import { tabDefinition } from './tabRegistry';

const NotesTab = React.lazy(() =>
  import('./NotesTab').then((module) => ({ default: module.NotesTab }))
);

interface IslandTabContentProps {
  tab: DashboardTabId;
  systemStats: SystemStats | null;
  speedTest: SpeedTestResult | null;
  controls: React.ComponentProps<typeof IslandControls>;
  chat: React.ComponentProps<typeof QuickChat>;
  clock: React.ComponentProps<typeof ClockTasksTab>;
  notes: NotesApi;
  onRunSpeedTest: () => void;
}

export const IslandTabContent: React.FC<IslandTabContentProps> = ({
  tab,
  systemStats,
  speedTest,
  controls,
  chat,
  clock,
  notes,
  onRunSpeedTest,
}) => {
  if (tab === 'controls') return <IslandControls {...controls} />;
  if (tab === 'chat') return <QuickChat {...chat} />;

  if (tab === 'clock') return <ClockTasksTab {...clock} />;

  if (tab === 'stats') {
    return (
      <StatsTab
        stats={systemStats}
        speedTest={speedTest}
        onRunSpeedTest={onRunSpeedTest}
      />
    );
  }

  if (tab === 'notes') {
    return (
      <React.Suspense
        fallback={
          <div className="flex items-center justify-center py-8 text-[10px] text-[var(--aether-text-3)]">
            Loading notes…
          </div>
        }
      >
        <NotesTab notes={notes} />
      </React.Suspense>
    );
  }

  if (tab === 'wallpaper') {
    return (
      <PlaceholderPanel
        icon={tabDefinition('wallpaper').icon}
        eyebrow="Personalize"
        title="Wallpaper carousel"
        description="Recent and folder-based wallpapers, a tilted preview carousel, and apply-to-desktop controls arrive in Phase 6."
      />
    );
  }

  return (
    <PlaceholderPanel
      icon={tabDefinition('power').icon}
      eyebrow="Session"
      title="Power controls"
      description="Lock, Sleep, Restart, and Shut down cards with confirmation for destructive actions arrive in Phase 6."
    />
  );
};
