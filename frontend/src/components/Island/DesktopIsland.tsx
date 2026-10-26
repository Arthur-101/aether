import React, { useCallback, useEffect, useState } from 'react';
import type {
  AIProviderConfig,
  AppearanceConfig,
  AttachmentItem,
  AudioOutputDevice,
  BluetoothDeviceInfo,
  ChatTurn,
  ClockConfig,
  DashboardTabId,
  DisplayInfo,
  HotkeysConfig,
  MediaControlAction,
  MediaSnapshot,
  ModelStatus,
  PowerAction,
  PowerActionResult,
  ScheduledTask,
  SessionItem,
  SpeedTestResult,
  SystemStats,
  TaskInput,
  TaskbarPinnedApp,
  WallpaperState,
  WeatherSnapshot,
  WifiProfile,
} from '../../types/ipc';
import type { NotesApi } from '../../types/notes';
import { pickNativePath } from '../../lib/system';
import { IslandBody } from './IslandBody';
import { NotchShell } from './NotchShell';
import { visibleTabIds } from './appearance';
import { TimeFormatContext } from '../../hooks/useTimeFormat';
import {
  useAutoHidePill,
  type AutoHidePillMetrics,
  type MouseSubscriber,
} from '../../hooks/useAutoHidePill';
import type { ScaleUnit } from './scaleUnits';
import type { DesktopWidgetsApi } from '../../hooks/useDesktopWidgets';
import { TAB_WIDTH } from './tabSizes';
import { useClockTools } from './useClockTools';

interface DesktopIslandProps {
  systemStats: SystemStats | null;
  speedTest: SpeedTestResult | null;
  onRunSpeedTest: (durationSeconds: number) => void;
  wallpaperState: WallpaperState | null;
  powerResult: PowerActionResult | null;
  onRefreshWallpaper: () => void;
  onApplyWallpaper: (path: string) => void;
  onSetWallpaperFolder: (folder: string) => void;
  onClearWallpaperRecent: () => void;
  onPowerAction: (action: PowerAction, confirm?: boolean) => void;
  chatHistory: ChatTurn[];
  chatPending: string | null;
  attachments: AttachmentItem[];
  sessions: SessionItem[];
  activeSessionId: string;
  activeSessionTitle: string;
  askRequest: { id: number; filePath: string } | null;
  openIslandRequest: number;
  tasks: ScheduledTask[];
  weather: WeatherSnapshot | null;
  clockConfig: ClockConfig;
  wifiProfiles: WifiProfile[];
  bluetoothDevices: BluetoothDeviceInfo[];
  audioDevices: AudioOutputDevice[];
  displayInfo: DisplayInfo | null;
  notes: NotesApi;
  model: { status: ModelStatus | null; onLoad: () => void; onRelease: () => void };
  aiConfig?: AIProviderConfig | null;
  thinkingMode: boolean;
  vectorReady: boolean;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRefreshSessions: () => void;
  onToggleThinking: (enabled: boolean) => void;
  onCycleBackend: () => void;
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
  autoHideSuspended?: boolean;
  connected: boolean;
  subscribeMouse: MouseSubscriber;
  brandName: string;
  appearance: AppearanceConfig;
  hotkeys?: HotkeysConfig;
  peekEnabled?: boolean;
  media: MediaSnapshot | null;
  taskbarApps: TaskbarPinnedApp[];
  onLaunchTaskbarApp: (app: TaskbarPinnedApp) => void;
  onManageTaskbarApps: () => void;
  onMediaControl: (action: MediaControlAction) => void;
  widgets: DesktopWidgetsApi;
}

export const DesktopIsland: React.FC<DesktopIslandProps> = ({
  systemStats,
  speedTest,
  onRunSpeedTest,
  wallpaperState,
  powerResult,
  onRefreshWallpaper,
  onApplyWallpaper,
  onSetWallpaperFolder,
  onClearWallpaperRecent,
  onPowerAction,
  chatHistory,
  chatPending,
  attachments,
  sessions,
  activeSessionId,
  activeSessionTitle,
  askRequest,
  openIslandRequest,
  tasks,
  weather,
  clockConfig,
  wifiProfiles,
  bluetoothDevices,
  audioDevices,
  displayInfo,
  notes,
  model,
  aiConfig,
  thinkingMode,
  vectorReady,
  isExpanded,
  onExpandedChange,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRefreshSessions,
  onToggleThinking,
  onCycleBackend,
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
  autoHideSuspended = false,
  connected,
  subscribeMouse,
  brandName,
  appearance,
  hotkeys,
  peekEnabled = true,
  media,
  taskbarApps,
  onLaunchTaskbarApp,
  onManageTaskbarApps,
  onMediaControl,
  widgets,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTabId>('controls');
  const clockTools = useClockTools();
  const tabs = visibleTabIds(appearance);
  const effectiveTab = tabs.includes(activeTab) ? activeTab : tabs[0] ?? 'controls';
  const [contentHeight, setContentHeight] = useState(0);
  const [tabsWidth, setTabsWidth] = useState(0);
  const [focusWithin, setFocusWithin] = useState(false);
  const [shellMetrics, setShellMetrics] = useState<AutoHidePillMetrics>({
    compactWidth: 140,
    activeWidth: 140,
    activeHeight: 36,
  });
  const handleMeasured = useCallback((height: number) => {
    setContentHeight((previous) => (Math.abs(previous - height) > 0.5 ? height : previous));
  }, []);
  const handleTabsWidth = useCallback((width: number) => {
    setTabsWidth((previous) => (Math.abs(previous - width) > 0.5 ? width : previous));
  }, []);
  const handleShellMetrics = useCallback((next: AutoHidePillMetrics) => {
    setShellMetrics((previous) =>
      previous.compactWidth === next.compactWidth &&
      previous.activeWidth === next.activeWidth &&
      previous.activeHeight === next.activeHeight
        ? previous
        : next
    );
  }, []);
  const handleFocusWithinChange = useCallback((focused: boolean) => {
    setFocusWithin(focused);
  }, []);
  // Keep the pill out while a keyboard user is somewhere inside it.
  const suspendAutoHide = hidden || autoHideSuspended || isExpanded || focusWithin;
  const { tucked } = useAutoHidePill({
    enabled: appearance.auto_hide_pill && connected,
    suspended: suspendAutoHide,
    subscribeMouse,
    metrics: shellMetrics,
  });
  const showRevealSensor = tucked && appearance.auto_hide_pill && connected && !suspendAutoHide;

  useEffect(() => {
    if (!askRequest) return;
    onExpandedChange(true);
    setActiveTab('chat');
  }, [askRequest, onExpandedChange]);

  useEffect(() => {
    if (!openIslandRequest) return;
    onExpandedChange(true);
    setActiveTab('chat');
  }, [openIslandRequest, onExpandedChange]);

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
    if (tab === 'wallpaper') {
      onRefreshWallpaper();
    }
  };

  const askAether = (prompt: string) => {
    setActiveTab('chat');
    onSendMessage(prompt);
  };

  return (
    <TimeFormatContext.Provider value={appearance.time_format}>
      {showRevealSensor ? (
        <div
          data-aether-interactive
          data-aether-interactive-strict
          aria-hidden="true"
          className="aether-interactive fixed top-0 left-1/2 z-[51] h-[6px] -translate-x-1/2"
          style={{ width: shellMetrics.compactWidth }}
        />
      ) : null}
      <div
        className={`fixed top-0 left-1/2 z-50 -translate-x-1/2 ${
          hidden ? 'invisible' : ''
        }`}
      >
        <NotchShell
          isExpanded={isExpanded}
          onExpandedChange={onExpandedChange}
          brandName={brandName}
          appearance={appearance}
          peekEnabled={peekEnabled}
          apps={taskbarApps}
          media={media}
          clockTools={clockTools}
          onLaunchApp={onLaunchTaskbarApp}
          onManageApps={onManageTaskbarApps}
          onOpenSettings={onOpenSettings}
          onKill={onKillApp}
          tabWidth={TAB_WIDTH[effectiveTab] ?? 960}
          tabsWidth={tabsWidth}
          contentHeight={contentHeight}
          tucked={tucked}
          onMetricsChange={handleShellMetrics}
          onFocusWithinChange={handleFocusWithinChange}
        >
          <IslandBody
            tabs={tabs}
            activeTab={effectiveTab}
            onSelectTab={selectTab}
            systemStats={systemStats}
            speedTest={speedTest}
            onRunSpeedTest={onRunSpeedTest}
            wallpaper={{
              state: wallpaperState,
              onRefresh: onRefreshWallpaper,
              onApply: onApplyWallpaper,
              onSetFolder: onSetWallpaperFolder,
              onClearRecent: onClearWallpaperRecent,
            }}
            power={{
              result: powerResult,
              onAction: onPowerAction,
            }}
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
              widgets,
            }}
            chat={{
              history: chatHistory,
              pending: chatPending,
              attachments,
              focusToken: askRequest?.id ?? 0,
              openFocusToken: openIslandRequest,
              hotkeys,
              model,
              notes,
              ai: aiConfig,
              thinkingMode,
              onToggleThinking,
              onCycleBackend,
              sessions,
              activeSessionId,
              activeSessionTitle,
              vectorReady,
              onSelectSession,
              onNewSession,
              onDeleteSession,
              onRefreshSessions,
              onBrowseFiles: browseForAsk,
              onSend: onSendMessage,
              onDetach: onDetachFile,
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
    </TimeFormatContext.Provider>
  );
};

