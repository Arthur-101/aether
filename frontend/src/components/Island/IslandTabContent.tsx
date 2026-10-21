import React from 'react';
import type { DashboardTabId, SystemStats } from '../../types/ipc';
import type { NotesApi } from '../../types/notes';
import { ClockTasksTab } from './ClockTasksTab';
import { IslandControls } from './IslandControls';
import { PlaceholderPanel } from './PlaceholderPanel';
import { QuickChat } from './QuickChat';
import { tabDefinition } from './tabRegistry';

const NotesTab = React.lazy(() =>
  import('./NotesTab').then((module) => ({ default: module.NotesTab }))
);

interface IslandTabContentProps {
  tab: DashboardTabId;
  systemStats: SystemStats | null;
  controls: React.ComponentProps<typeof IslandControls>;
  chat: React.ComponentProps<typeof QuickChat>;
  clock: React.ComponentProps<typeof ClockTasksTab>;
  notes: NotesApi;
}

export const IslandTabContent: React.FC<IslandTabContentProps> = ({
  tab,
  systemStats,
  controls,
  chat,
  clock,
  notes,
}) => {
  const liveStats = systemStats ?? {
    cpu_percent: 0,
    ram_percent: 0,
    disk_percent: 0,
  };

  if (tab === 'controls') return <IslandControls {...controls} />;
  if (tab === 'chat') return <QuickChat {...chat} />;

  if (tab === 'clock') return <ClockTasksTab {...clock} />;

  if (tab === 'stats') {
    return (
      <PlaceholderPanel
        icon={tabDefinition('stats').icon}
        eyebrow="Telemetry"
        title="Stats are moving into the notch"
        description="The full CPU, GPU, and RAM gauges, top apps, network throughput, and speed test land in Phase 3. Current system values remain available to the rest of the dashboard."
      >
        <div className="grid grid-cols-3 gap-2">
          {[
            ['CPU', liveStats.cpu_percent, '#7dd3fc'],
            ['RAM', liveStats.ram_percent, '#c4b5fd'],
            ['Disk', liveStats.disk_percent, '#f0c36a'],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-xl bg-white/[0.035] p-3">
              <p className="text-[9px] uppercase tracking-wider text-[#8b857a]">{label}</p>
              <p className="mt-1 font-mono text-lg text-white">
                {Math.round(Number(value) || 0)}%
              </p>
              <div className="mt-2 h-1 rounded-full bg-white/10">
                <div
                  className="h-1 rounded-full"
                  style={{
                    width: `${Math.min(100, Number(value) || 0)}%`,
                    backgroundColor: String(color),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </PlaceholderPanel>
    );
  }

  if (tab === 'notes') {
    return (
      <React.Suspense
        fallback={
          <div className="flex items-center justify-center py-8 text-[10px] text-[#8b8b8b]">
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
        description="Recent and folder-based wallpapers, a tilted preview carousel, and apply-to-desktop controls arrive in Phase 5."
      />
    );
  }

  return (
    <PlaceholderPanel
      icon={tabDefinition('power').icon}
      eyebrow="Session"
      title="Power controls"
      description="Lock, Sleep, Restart, and Shut down cards with confirmation for destructive actions arrive in Phase 5."
    />
  );
};
