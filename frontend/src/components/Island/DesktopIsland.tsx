import React, { useCallback, useEffect, useState } from 'react';
import type {
  AppearanceConfig,
  AttachmentItem,
  AudioOutputDevice,
  BluetoothDeviceInfo,
  ChatTurn,
  ClockConfig,
  DashboardTabId,
  DisplayInfo,
  MediaControlAction,
  MediaSnapshot,
  ModelStatus,
  ScheduledTask,
  SpeedTestResult,
  SystemStats,
  TaskInput,
  TaskbarPinnedApp,
  WeatherSnapshot,
  WifiProfile,
} from '../../types/ipc';
import type { NotesApi } from '../../types/notes';
import { pickNativePath } from '../../lib/system';
import { IslandBody } from './IslandBody';
import { NotchShell } from './NotchShell';
import { visibleTabIds } from './appearance';
import type { ScaleUnit } from './scaleUnits';
import { TAB_WIDTH } from './tabSizes';
import { useClockTools } from './useClockTools';

interface DesktopIslandProps {
  systemStats: SystemStats | null;
  speedTest: SpeedTestResult | null;
  onRunSpeedTest: () => void;
  chatHistory: ChatTurn[];
  chatPending: string | null;
  attachments: AttachmentItem[];
  askRequest: { id: number; filePath: string } | null;
  tasks: ScheduledTask[];
  weather: WeatherSnapshot | null;
  clockConfig: ClockConfig;
  wifiProfiles: WifiProfile[];
  bluetoothDevices: BluetoothDeviceInfo[];
  audioDevices: AudioOutputDevice[];
  displayInfo: DisplayInfo | null;
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
  onRefreshAudioDevices: () => void;
  onSelectAudioDevice: (deviceId: string) => void;
  onOpenSettingsPage: (page: string) => void;
  onOpenScale: (unit: ScaleUnit) => void;
  pickedColor: string;
  colorPickerConnected: boolean;
  onOpenColorPicker: () => void;
  onSetColor: (hex: string) => void;
  hidden?: boolean;
  appearance: AppearanceConfig;
  peekEnabled?: boolean;
  media: MediaSnapshot | null;
  taskbarApps: TaskbarPinnedApp[];
  onLaunchTaskbarApp: (app: TaskbarPinnedApp) => void;
  onManageTaskbarApps: () => void;
  onMediaControl: (action: MediaControlAction) => void;
}

export const DesktopIsland: React.FC<DesktopIslandProps> = ({
  systemStats,
  speedTest,
  onRunSpeedTest,
  chatHistory,
  chatPending,
  attachments,
  askRequest,
  tasks,
  weather,
  clockConfig,
  wifiProfiles,
  bluetoothDevices,
  audioDevices,
  displayInfo,
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
  onRefreshAudioDevices,
  onSelectAudioDevice,
  onOpenSettingsPage,
  onOpenScale,
  pickedColor,
  colorPickerConnected,
  onOpenColorPicker,
  onSetColor,
  hidden = false,
  appearance,
  peekEnabled = true,
  media,
  taskbarApps,
  onLaunchTaskbarApp,
  onManageTaskbarApps,
  onMediaControl,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTabId>('controls');
  const clockTools = useClockTools();
  const tabs = visibleTabIds(appearance);
  const effectiveTab = tabs.includes(activeTab) ? activeTab : tabs[0] ?? 'controls';
  const [contentHeight, setContentHeight] = useState(0);
  const [tabsWidth, setTabsWidth] = useState(0);
  const handleMeasured = useCallback((height: number) => {
    setContentHeight((previous) => (Math.abs(previous - height) > 0.5 ? height : previous));
  }, []);
  const handleTabsWidth = useCallback((width: number) => {
    setTabsWidth((previous) => (Math.abs(previous - width) > 0.5 ? width : previous));
  }, []);

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
    <div
      className={`fixed top-0 left-1/2 z-50 -translate-x-1/2 ${
        hidden ? 'invisible' : ''
      }`}
    >
      <NotchShell
        isExpanded={isExpanded}
        onExpandedChange={onExpandedChange}
        appearance={appearance}
        peekEnabled={peekEnabled}
        apps={taskbarApps}
        media={media}
        onLaunchApp={onLaunchTaskbarApp}
        onManageApps={onManageTaskbarApps}
        onOpenSettings={onOpenSettings}
        onKill={onKillApp}
        tabWidth={TAB_WIDTH[effectiveTab] ?? 960}
        tabsWidth={tabsWidth}
        contentHeight={contentHeight}
      >
        <IslandBody
          tabs={tabs}
          activeTab={effectiveTab}
          onSelectTab={selectTab}
          systemStats={systemStats}
          speedTest={speedTest}
          onRunSpeedTest={onRunSpeedTest}
          controls={{
            stats: systemStats,
            wifiProfiles,
            bluetoothDevices,
            audioDevices,
            displayInfo,
            glowStyle: appearance.glow_style,
            glowColor: appearance.glow_color,
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
            onRefreshAudioDevices,
            onSelectAudioDevice,
            onOpenSettingsPage,
            onOpenScale,
            pickedColor,
            colorPickerConnected,
            onOpenColorPicker,
            onSetColor,
            media,
            onMediaControl,
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
          onMeasured={handleMeasured}
          onTabsWidth={handleTabsWidth}
        />
      </NotchShell>
    </div>
  );
};


