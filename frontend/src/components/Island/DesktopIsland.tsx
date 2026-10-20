import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  AttachmentItem,
  BluetoothDeviceInfo,
  ChatTurn,
  ModelStatus,
  ScheduledTask,
  SystemStats,
  TaskInput,
  VoiceState,
  WifiProfile,
} from '../../types/ipc';
import type { NotesApi } from '../../types/notes';
import { pickNativePath } from '../../lib/system';
import { IslandControls } from './IslandControls';
import { IslandHeader } from './IslandHeader';
import { IslandPill } from './IslandPill';
import { IslandStatusBar } from './IslandStatusBar';
import { QuickChat } from './QuickChat';
import { TaskPanel } from './TaskPanel';

const NotesTab = React.lazy(() =>
  import('./NotesTab').then((module) => ({ default: module.NotesTab }))
);

interface DesktopIslandProps {
  sessionTitle: string;
  voiceState: VoiceState;
  systemStats: SystemStats | null;
  thinkingMode: boolean;
  engineLabel: string;
  chatHistory: ChatTurn[];
  chatPending: string | null;
  attachments: AttachmentItem[];
  askRequest: { id: number; filePath: string } | null;
  tasks: ScheduledTask[];
  wifiProfiles: WifiProfile[];
  bluetoothDevices: BluetoothDeviceInfo[];
  notes: NotesApi;
  model: { status: ModelStatus | null; onLoad: () => void; onRelease: () => void };
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onToggleDrawer: () => void;
  onOpenSettings: () => void;
  onKillApp: () => void;
  onSendMessage: (msg: string) => void;
  onAskFile: (filePath: string) => void;
  onDetachFile: (filePath: string) => void;
  onRefreshTasks: () => void;
  onCreateTask: (task: TaskInput) => void;
  onUpdateTask: (task: TaskInput & { task_id: string }) => void;
  onDeleteTask: (taskId: string) => void;
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
}

export const DesktopIsland: React.FC<DesktopIslandProps> = ({
  sessionTitle,
  voiceState,
  systemStats,
  thinkingMode,
  engineLabel,
  chatHistory,
  chatPending,
  attachments,
  askRequest,
  tasks,
  wifiProfiles,
  bluetoothDevices,
  notes,
  model,
  isExpanded,
  onExpandedChange,
  onToggleDrawer,
  onOpenSettings,
  onKillApp,
  onSendMessage,
  onAskFile,
  onDetachFile,
  onRefreshTasks,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
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
}) => {
  const [activeTab, setActiveTab] = useState<'controls' | 'chat' | 'tasks' | 'notes'>('controls');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
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
  const dotColor = {
    listening: 'bg-[#60cdff] animate-pulse', thinking: 'bg-[#fce100] animate-pulse',
    speaking: 'bg-[#6ccb5f] animate-pulse', idle: 'bg-[#6ccb5f]',
  }[voiceState];

  return (
    <div
      data-aether-interactive
      className="aether-interactive fixed top-3 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center"
    >
      {!isExpanded && (
        <IslandPill
          sessionTitle={sessionTitle}
          dotColor={dotColor}
          onClick={() => onExpandedChange(true)}
        />
      )}

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            layoutId="island-container"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="glass-panel relative flex max-h-[calc(100vh-24px)] w-[540px] flex-col gap-3 overflow-y-auto rounded-xl p-4 shadow-2xl"
          >
            <IslandHeader
              sessionTitle={sessionTitle}
              engineLabel={engineLabel}
              thinkingMode={thinkingMode}
              onToggleDrawer={onToggleDrawer}
              onOpenSettings={onOpenSettings}
              onKillApp={onKillApp}
              onClose={() => onExpandedChange(false)}
            />

            <IslandStatusBar systemStats={systemStats} now={now} />

            <div className="grid grid-cols-4 gap-1 rounded-lg bg-black/25 p-1 text-xs font-medium">
              {[
                { id: 'controls', label: 'Controls' },
                { id: 'chat', label: 'Quick Chat' },
                { id: 'tasks', label: 'Tasks' },
                { id: 'notes', label: 'Notes' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as typeof activeTab);
                    if (tab.id === 'tasks') onRefreshTasks();
                  }}
                  className={`rounded-md py-1.5 transition ${
                    activeTab === tab.id
                      ? 'bg-[#383838] text-white'
                      : 'text-[#8b8b8b] hover:text-[#f3f3f3]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'controls' && (
              <IslandControls
                stats={systemStats}
                wifiProfiles={wifiProfiles}
                bluetoothDevices={bluetoothDevices}
                onSetVolume={onSetVolume}
                onSetMuted={onSetMuted}
                onSetBrightness={onSetBrightness}
                onToggleWifi={onToggleWifi}
                onToggleBluetooth={onToggleBluetooth}
                onToggleAirplaneMode={onToggleAirplaneMode}
                onToggleHotspot={onToggleHotspot}
                onToggleDarkMode={onToggleDarkMode}
                onRefreshWifiProfiles={onRefreshWifiProfiles}
                onConnectWifi={onConnectWifi}
                onDisconnectWifi={onDisconnectWifi}
                onRefreshBluetoothDevices={onRefreshBluetoothDevices}
                onOpenSettingsPage={onOpenSettingsPage}
              />
            )}

            {activeTab === 'chat' && (
              <QuickChat
                history={chatHistory}
                pending={chatPending}
                attachments={attachments}
                focusToken={askRequest?.id ?? 0}
                model={model}
                notes={notes}
                onBrowseFiles={browseForAsk}
                onSend={onSendMessage}
                onDetach={onDetachFile}
              />
            )}

            {activeTab === 'tasks' && (
              <TaskPanel
                tasks={tasks}
                onRefresh={onRefreshTasks}
                onCreate={onCreateTask}
                onUpdate={onUpdateTask}
                onDelete={onDeleteTask}
              />
            )}

            {activeTab === 'notes' && (
              <React.Suspense
                fallback={
                  <div className="flex items-center justify-center py-8 text-[10px] text-[#8b8b8b]">
                    Loading notes…
                  </div>
                }
              >
                <NotesTab notes={tabNotes} />
              </React.Suspense>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
