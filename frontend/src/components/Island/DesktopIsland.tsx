import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Settings, Brain, UploadCloud, FolderOpen } from 'lucide-react';
import type {
  AttachmentItem,
  ChatTurn,
  SystemStats,
  VoiceState,
} from '../../types/ipc';
import { pickNativePath } from '../../lib/system';
import { IslandControls } from './IslandControls';
import { QuickChat } from './QuickChat';

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
  onOpenDrawer: () => void;
  onOpenSettings: () => void;
  onSendMessage: (msg: string) => void;
  onAskFile: (filePath: string) => void;
  onDetachFile: (filePath: string) => void;
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
  onOpenDrawer,
  onOpenSettings,
  onSendMessage,
  onAskFile,
  onDetachFile,
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
  const [activeTab, setActiveTab] = useState<'controls' | 'chat' | 'tasks' | 'drop'>('controls');

  useEffect(() => {
    if (!askRequest) return;
    setIsExpanded(true);
    setActiveTab('chat');
  }, [askRequest]);

  const browseForAsk = async () => {
    const filePath = await pickNativePath('file', 'all');
    if (filePath) onAskFile(filePath);
  };

  const dotColor = {
    listening: 'bg-[#60cdff] animate-pulse',
    thinking: 'bg-[#fce100] animate-pulse',
    speaking: 'bg-[#6ccb5f] animate-pulse',
    idle: 'bg-[#6ccb5f]',
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
                  onClick={onOpenDrawer}
                  className="rounded-md bg-white/5 p-1.5 text-[#c7c7c7] transition hover:bg-white/10"
                  title="Open Session Drawer"
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
                { id: 'drop', label: 'Drop Zone' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
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
                onSend={onSendMessage}
                onDetach={onDetachFile}
              />
            )}

            {activeTab === 'tasks' && (
              <div className="p-6 text-center text-xs text-[#8b8b8b]">
                <p>No pending clock alarms or routines.</p>
                <p className="mt-1 text-[10px] text-[#6f6f6f]">
                  Ask Aether to remind you, or use the scheduler tools in Quick Chat.
                </p>
              </div>
            )}

            {activeTab === 'drop' && (
              <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 p-6 text-center">
                <UploadCloud size={24} className="mb-1 text-[#60cdff]" />
                <span className="text-xs font-medium text-[#f3f3f3]">
                  Drop a document, image, or code file
                </span>
                <span className="text-[10px] text-[#8b8b8b]">
                  It attaches to Quick Chat, indexes large files, and is ready to ask.
                </span>
                <button
                  onClick={browseForAsk}
                  className="mt-2 flex items-center gap-1.5 rounded-md bg-[#0067c0] px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#0078d4]"
                >
                  <FolderOpen size={12} />
                  Browse files
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
