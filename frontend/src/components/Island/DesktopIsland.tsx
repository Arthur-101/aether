import React, { useEffect, useState } from 'react';
import type {
  AppearanceConfig,
  AttachmentItem,
  BluetoothDeviceInfo,
  ChatTurn,
  ClockConfig,
  DashboardTabId,
  ModelStatus,
  ScheduledTask,
  SystemStats,
  TaskInput,
  WeatherSnapshot,
  WifiProfile,
} from '../../types/ipc';
import type { NotesApi } from '../../types/notes';
import { pickNativePath } from '../../lib/system';
import { PLACEHOLDER_DOCK_APPS, type DockApp } from './dockApps';
import { DashboardTabs } from './DashboardTabs';
import { IslandTabContent } from './IslandTabContent';
import { NotchShell } from './NotchShell';
import { visibleTabIds } from './appearance';
import { useClockTools } from './useClockTools';

interface DesktopIslandProps {
  systemStats: SystemStats | null;
  chatHistory: ChatTurn[];
  chatPending: string | null;
  attachments: AttachmentItem[];
  askRequest: { id: number; filePath: string } | null;
  tasks: ScheduledTask[];
  weather: WeatherSnapshot | null;
  clockConfig: ClockConfig;
  wifiProfiles: WifiProfile[];
  bluetoothDevices: BluetoothDeviceInfo[];
  notes: NotesApi;
  model: { status: ModelStatus | null; onLoad: () => void; onRelease: () => void };
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onOpenSessions: () => void;
  onOpenSettings: () => void;
  onKillApp: () => void;
  onSendMessage: (msg: string) => void;
  onAskFile: (filePath: string) => void;
  onDetachFile: (filePath: string) => void;
  onRefreshTasks: () => void;
  onCreateTask: (task: TaskInput) => void;
  onUpdateTask: (task: TaskInput & { task_id: string }) => void;
  onDeleteTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  onPauseTask: (taskId: string) => void;
  onResumeTask: (taskId: string) => void;
  onSaveWeather: (patch: Partial<ClockConfig>) => void;
  onRefreshWeather: () => void;
  onSetVolume: (level: number) => void;
  onSetMuted: (muted: boolean) => void;
  onSetBrightness: (level: number) => void;
  onToggleWifi: (enabled?: boolean) => void;
  onToggleBluetooth: (enabled?: boolean) => void;
  onToggleAirplaneMode: (enabled?: boolean) => void;
  onToggleHotspot: (enabled?: boolean) => void;
  onToggleDarkMode: (enabled?: boolean) => void;
  onRefreshWifiProfiles: () => void;
  onConnectWifi: (profile: string) => void;
  onDisconnectWifi: () => void;
  onRefreshBluetoothDevices: () => void;
  onOpenSettingsPage: (page: string) => void;
  appearance: AppearanceConfig;
  peekEnabled?: boolean;
  mediaActive?: boolean;
  mediaSpotify?: boolean;
  dockApps?: DockApp[];
}

export const DesktopIsland: React.FC<DesktopIslandProps> = ({
  systemStats,
  chatHistory,
  chatPending,
  attachments,
  askRequest,
  tasks,
  weather,
  clockConfig,
  wifiProfiles,
  bluetoothDevices,
  notes,
  model,
  isExpanded,
  onExpandedChange,
  onOpenSessions,
  onOpenSettings,
  onKillApp,
  onSendMessage,
  onAskFile,
  onDetachFile,
  onRefreshTasks,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onCompleteTask,
  onPauseTask,
  onResumeTask,
  onSaveWeather,
  onRefreshWeather,
  onSetVolume,
  onSetMuted,
  onSetBrightness,
  onToggleWifi,
  onToggleBluetooth,
  onToggleAirplaneMode,
  onToggleHotspot,
  onToggleDarkMode,
  onRefreshWifiProfiles,
  onConnectWifi,
  onDisconnectWifi,
  onRefreshBluetoothDevices,
  onOpenSettingsPage,
  appearance,
  peekEnabled = true,
  mediaActive = false,
  mediaSpotify = false,
  dockApps = PLACEHOLDER_DOCK_APPS,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTabId>('controls');
  const clockTools = useClockTools();
  const tabs = visibleTabIds(appearance);
  const effectiveTab = tabs.includes(activeTab) ? activeTab : tabs[0] ?? 'controls';

  useEffect(() => {
    if (!askRequest) return;
    onExpandedChange(true);
    setActiveTab('chat');
  }, [askRequest, onExpandedChange]);

  const browseForAsk = async () => {
    const filePath = await pickNativePath('file', 'all');
    if (filePath) onAskFile(filePath);
  };

  const tabNotes: NotesApi = {
    ...notes,
    onAttach: (id) => {
      notes.onAttach(id);
      setActiveTab('chat');
    },
  };

  const selectTab = (tab: DashboardTabId) => {
    setActiveTab(tab);
    if (tab === 'clock') {
      onRefreshTasks();
      onRefreshWeather();
    }
  };

  const askAether = (prompt: string) => {
    setActiveTab('chat');
    onSendMessage(prompt);
  };

  return (
    <div className="fixed top-0 left-1/2 z-50 -translate-x-1/2">
      <NotchShell
        isExpanded={isExpanded}
        onExpandedChange={onExpandedChange}
        appearance={appearance}
        peekEnabled={peekEnabled}
        apps={dockApps}
        mediaActive={mediaActive}
        spotify={mediaSpotify}
        onOpenSettings={onOpenSettings}
        onKill={onKillApp}
      >
        <DashboardTabs tabs={tabs} activeTab={effectiveTab} onSelect={selectTab} />
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <IslandTabContent
            tab={effectiveTab}
            systemStats={systemStats}
            controls={{
              stats: systemStats,
              wifiProfiles,
              bluetoothDevices,
              onSetVolume,
              onSetMuted,
              onSetBrightness,
              onToggleWifi,
              onToggleBluetooth,
              onToggleAirplaneMode,
              onToggleHotspot,
              onToggleDarkMode,
              onRefreshWifiProfiles,
              onConnectWifi,
              onDisconnectWifi,
              onRefreshBluetoothDevices,
              onOpenSettingsPage,
            }}
            chat={{
              history: chatHistory,
              pending: chatPending,
              attachments,
              focusToken: askRequest?.id ?? 0,
              model,
              notes,
              onBrowseFiles: browseForAsk,
              onSend: onSendMessage,
              onDetach: onDetachFile,
              onOpenSessions,
            }}
            clock={{
              tasks,
              weather,
              clockConfig,
              clockTools,
              onRefreshTasks,
              onCreateTask,
              onUpdateTask,
              onDeleteTask,
              onCompleteTask,
              onPauseTask,
              onResumeTask,
              onSaveWeather,
              onRefreshWeather,
              onAskAether: askAether,
            }}
            notes={tabNotes}
          />
        </div>
      </NotchShell>
    </div>
  );
};
