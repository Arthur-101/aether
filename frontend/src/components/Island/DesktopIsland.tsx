import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu,
  Settings,
  Wifi,
  Bluetooth,
  Volume2,
  VolumeX,
  Cpu,
  HardDrive,
  Send,
  UploadCloud,
  Brain,
  Sparkles,
} from 'lucide-react';
import type { SystemStats, VoiceState } from '../../types/ipc';

interface DesktopIslandProps {
  sessionTitle: string;
  voiceState: VoiceState;
  systemStats: SystemStats | null;
  thinkingMode: boolean;
  onOpenDrawer: () => void;
  onOpenSettings: () => void;
  onSendMessage: (msg: string) => void;
}

export const DesktopIsland: React.FC<DesktopIslandProps> = ({
  sessionTitle,
  voiceState,
  systemStats,
  thinkingMode,
  onOpenDrawer,
  onOpenSettings,
  onSendMessage,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'controls' | 'tasks' | 'drop' | 'chat'>('controls');
  const [inputMessage, setInputMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);

  const getDotColor = () => {
    switch (voiceState) {
      case 'listening':
        return 'bg-cyan-400 shadow-[0_0_12px_#38bdf8] animate-pulse';
      case 'thinking':
        return 'bg-indigo-500 shadow-[0_0_12px_#6366f1] animate-bounce';
      case 'speaking':
        return 'bg-purple-500 shadow-[0_0_12px_#a855f7] animate-pulse';
      default:
        return 'bg-emerald-400 shadow-[0_0_8px_#10b981]';
    }
  };

  const handleSend = () => {
    if (!inputMessage.trim()) return;
    onSendMessage(inputMessage);
    setInputMessage('');
  };

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
      {/* Collapsed Pill */}
      {!isExpanded && (
        <motion.div
          layoutId="island-container"
          onClick={() => setIsExpanded(true)}
          className="glass-pill h-9 px-4 rounded-full flex items-center gap-3 cursor-pointer select-none transition-all duration-200 hover:border-cyan-500/40 hover:shadow-cyan-500/10"
        >
          <div className={`w-2.5 h-2.5 rounded-full ${getDotColor()}`} />
          <span className="text-xs text-slate-200 font-medium max-w-[200px] truncate">
            {sessionTitle || 'New Session'}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </motion.div>
      )}

      {/* Expanded Bento Grid Panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            layoutId="island-container"
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="glass-panel w-[540px] rounded-2xl p-4 flex flex-col gap-3 shadow-2xl relative"
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <button onClick={onOpenDrawer} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition" title="Open Session Drawer">
                  <Menu size={16} />
                </button>
                <div>
                  <h2 className="text-sm font-semibold text-white tracking-wide">Aether</h2>
                  <p className="text-[10px] text-slate-400 truncate max-w-[260px]">{sessionTitle}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[11px] text-cyan-300">
                  <Brain size={12} />
                  <span>Bonsai 9B {thinkingMode ? '(Thinking)' : '(Normal)'}</span>
                </div>
                <button onClick={onOpenSettings} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition" title="Settings">
                  <Settings size={16} />
                </button>
                <button onClick={() => setIsExpanded(false)} className="px-2 py-0.5 rounded text-xs text-slate-400 hover:text-white hover:bg-white/10 transition">
                  ✕
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-black/30 rounded-lg text-xs font-medium">
              {[
                { id: 'controls', label: 'Controls' },
                { id: 'chat', label: 'Quick Chat' },
                { id: 'tasks', label: 'Tasks' },
                { id: 'drop', label: 'Drop Zone' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-1.5 rounded-md transition ${activeTab === tab.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab 1: Controls Bento */}
            {activeTab === 'controls' && (
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                {/* Tile 1: Wi-Fi & BT */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <Wifi size={18} className="text-cyan-400" />
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">ON</span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">Aether_5G</div>
                    <div className="text-[10px] text-slate-400">Connected</div>
                  </div>
                </div>

                {/* Tile 2: Bluetooth */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <Bluetooth size={18} className="text-indigo-400" />
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">ON</span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">Headphones</div>
                    <div className="text-[10px] text-slate-400">Paradee TTS ready</div>
                  </div>
                </div>

                {/* Tile 3: Volume & Audio */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setIsMuted(!isMuted)} className="text-slate-300 hover:text-white">
                      {isMuted ? <VolumeX size={18} className="text-red-400" /> : <Volume2 size={18} className="text-cyan-400" />}
                    </button>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {isMuted ? 'Muted' : `${Math.round((systemStats?.volume ?? 0.5) * 100)}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    defaultValue="0.5"
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>

                {/* System Stats Bar (Span 3) */}
                <div className="col-span-3 p-3 rounded-xl bg-slate-900/60 border border-white/5 flex items-center justify-around text-xs font-mono">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Cpu size={14} className="text-cyan-400" />
                    <span>CPU: {systemStats?.cpu_percent ?? 0}%</span>
                  </div>
                  <div className="w-[1px] h-4 bg-white/10" />
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <HardDrive size={14} className="text-indigo-400" />
                    <span>RAM: {systemStats?.ram_percent ?? 0}%</span>
                  </div>
                  <div className="w-[1px] h-4 bg-white/10" />
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Sparkles size={14} className="text-purple-400" />
                    <span>VRAM: {systemStats?.gpu_vram_gb ? `${systemStats.gpu_vram_gb} GB` : 'Ternary 2-bit'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Quick Chat */}
            {activeTab === 'chat' && (
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Ask Aether or trigger a tool..."
                    className="flex-1 bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleSend}
                    className="px-3 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 rounded-xl text-white hover:opacity-90 transition flex items-center justify-center"
                  >
                    <Send size={14} />
                  </button>
                </div>
                <div className="text-[11px] text-slate-400 text-center">
                  Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">Ctrl+Win</kbd> for Dictation or <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">Alt+Space</kbd> for Voice Assistant
                </div>
              </div>
            )}

            {/* Tab 3: Tasks */}
            {activeTab === 'tasks' && (
              <div className="p-4 text-center text-xs text-slate-400">
                <p>No pending clock alarms or routines.</p>
                <p className="text-[10px] text-slate-500 mt-1">Speak &quot;Remind me at 5 PM to check email&quot; to schedule via FastMCP.</p>
              </div>
            )}

            {/* Tab 4: Drop Zone */}
            {activeTab === 'drop' && (
              <div className="border-2 border-dashed border-white/15 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-cyan-500/50 transition">
                <UploadCloud size={24} className="text-cyan-400 mb-2" />
                <span className="text-xs text-slate-200 font-medium">Drop document or media here</span>
                <span className="text-[10px] text-slate-500 mt-0.5">Auto-ingested into current session memory</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
