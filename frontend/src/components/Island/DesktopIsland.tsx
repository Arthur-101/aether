import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Settings, Brain } from 'lucide-react';
import type {
  AttachmentItem,
  ChatTurn,
  ModelStatus,
  ScheduledTask,
  SystemStats,
  TaskInput,
  VoiceState,
} from '../../types/ipc';
import type { NotesApi } from '../../types/notes';
import { pickNativePath } from '../../lib/system';
import { IslandControls } from './IslandControls';
import { KillAppButton } from './KillAppButton';
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
  notes: NotesApi;
  model: { status: ModelStatus | null; onLoad: () => void; onRelease: () => void };
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
  notes,
  model,
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
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'controls' | 'chat' | 'tasks' | 'notes'>('controls');

  useEffect(() => {
    if (!askRequest) return;
    setIsExpanded(true);
    setActiveTab('chat');
  }, [askRequest]);
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
        <motion.div
          layoutId="island-container"
          onClick={() => setIsExpanded(true)}
          className="glass-pill flex h-9 cursor-pointer select-none items-center gap-3 rounded-full px-4 transition hover:border-white/25"
        >
          <div className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
          <span className="max-w-[220px] truncate text-xs font-medium text-[#f3f3f3]">
            {sessionTitle || 'New Session'}
          </span>
          <span className="font-mono text-[10px] text-[#8b8b8b]">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </motion.div>
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
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={onToggleDrawer}
                  className="rounded-md bg-white/5 p-1.5 text-[#c7c7c7] transition hover:bg-white/10"
                  title="Toggle Session Drawer"
                >
                  <Menu size={16} />
                </button>
                <div>
                  <h2 className="text-sm font-semibold tracking-wide text-white">Aether</h2>
                  <p className="max-w-[250px] truncate text-[10px] text-[#8b8b8b]">
                    {sessionTitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex max-w-[190px] items-center gap-1.5 rounded-full border border-[#0067c0]/40 bg-[#0067c0]/15 px-2.5 py-1 text-[10px] text-[#9dd5ff]">
                  <Brain size={12} className="shrink-0" />
                  <span className="truncate">
                    {engineLabel} {thinkingMode ? '· Thinking' : ''}
                  </span>
                </div>
                <KillAppButton onKill={onKillApp} />
                <button
                  onClick={onOpenSettings}
                  className="rounded-md bg-white/5 p-1.5 text-[#c7c7c7] transition hover:bg-white/10"
                  title="Settings"
                >
                  <Settings size={16} />
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="rounded px-2 py-0.5 text-xs text-[#8b8b8b] transition hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

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
                onSetVolume={onSetVolume}
                onSetMuted={onSetMuted}
                onSetBrightness={onSetBrightness}
                onToggleWifi={onToggleWifi}
                onToggleBluetooth={onToggleBluetooth}
                onToggleAirplaneMode={onToggleAirplaneMode}
                onToggleHotspot={onToggleHotspot}
                onToggleDarkMode={onToggleDarkMode}
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
