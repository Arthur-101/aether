import React from 'react';
import type { DashboardTabId, SpeedTestResult, SystemStats } from '../../types/ipc';
import type { NotesApi } from '../../types/notes';
import { ClockTasksTab } from './ClockTasksTab';
import { IslandControls } from './IslandControls';
import { PowerTab } from './PowerTab';
import { QuickChat } from './QuickChat';
import { StatsTab } from './StatsTab';
import { WallpaperTab } from './WallpaperTab';

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
  wallpaper: React.ComponentProps<typeof WallpaperTab>;
  power: React.ComponentProps<typeof PowerTab>;
  notes: NotesApi;
  onRunSpeedTest: (durationSeconds: number) => void;
}

export const IslandTabContent: React.FC<IslandTabContentProps> = ({
  tab,
  systemStats,
  speedTest,
  controls,
  chat,
  clock,
  wallpaper,
  power,
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

  if (tab === 'wallpaper') return <WallpaperTab {...wallpaper} />;

  return <PowerTab {...power} />;
};
