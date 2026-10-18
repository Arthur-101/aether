import { useState } from 'react';
import { useBackendSocket } from './hooks/useBackendSocket';
import { DesktopIsland } from './components/Island/DesktopIsland';
import { RadialWheel } from './components/RadialWheel/RadialWheel';
import { SessionDrawer } from './components/SessionDrawer/SessionDrawer';
import { CropModal } from './components/MicroModals/CropModal';
import { AddBgModal } from './components/MicroModals/AddBgModal';
import { SettingsModal } from './components/SettingsModal/SettingsModal';
import { CircleToAsk } from './components/CircleToAsk/CircleToAsk';
import { CheckCircle2, Bell, Mic, WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export function App() {
  const {
    connected,
    voiceState,
    voiceTranscript,
    activeSessionId,
    activeSessionTitle,
    chatHistory,
    sessions,
    systemStats,
    thinkingMode,
    radialWheel,
    clockEvent,
    lastWheelResult,
    sendChatMessage,
    switchSession,
    refreshSessions,
    triggerWheelAction,
    toggleThinking,
    closeRadialWheel,
    clearClockEvent,
  } = useBackendSocket();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCircleOpen, setIsCircleOpen] = useState(false);
  const [cropFile, setCropFile] = useState<string | null>(null);
  const [addBgFile, setAddBgFile] = useState<string | null>(null);

  return (
    <main className="w-screen h-screen relative overflow-hidden bg-transparent select-none font-sans">
      {/* 1. Desktop Island (Top Anchor) */}
      <DesktopIsland
        sessionTitle={activeSessionTitle}
        voiceState={voiceState}
        systemStats={systemStats}
        thinkingMode={thinkingMode}
        onOpenDrawer={() => {
          refreshSessions();
          setIsDrawerOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSendMessage={sendChatMessage}
      />

      {/* 2. Drag + Shift Radial Wheel */}
      {radialWheel && (
        <RadialWheel
          data={radialWheel}
          onAction={triggerWheelAction}
          onOpenCrop={(fp) => setCropFile(fp)}
          onOpenAddBg={(fp) => setAddBgFile(fp)}
          onClose={closeRadialWheel}
        />
      )}

      {/* 3. Session Drawer */}
      <SessionDrawer
        isOpen={isDrawerOpen}
        sessions={sessions}
        activeSessionId={activeSessionId}
        chatHistory={chatHistory}
        onSelectSession={(id) => {
          switchSession(id);
          setIsDrawerOpen(false);
        }}
        onNewSession={() => {
          sendChatMessage('Start new session');
          setIsDrawerOpen(false);
        }}
        onClose={() => setIsDrawerOpen(false)}
      />

      {/* 4. Micro-Modal: Crop */}
      <CropModal
        isOpen={Boolean(cropFile)}
        filePath={cropFile || ''}
        onApply={(fp, w, h, ratio) => {
          triggerWheelAction(fp, 'CROP', `${w}x${h}_${ratio}`);
          setCropFile(null);
        }}
        onClose={() => setCropFile(null)}
      />

      {/* 5. Micro-Modal: Add Background */}
      <AddBgModal
        isOpen={Boolean(addBgFile)}
        filePath={addBgFile || ''}
        onSave={(fp, bg, pad, crn, shd) => {
          triggerWheelAction(fp, 'ADD_BG', JSON.stringify({ bg, pad, crn, shd }));
          setAddBgFile(null);
        }}
        onClose={() => setAddBgFile(null)}
      />

      {/* Disconnected Indicator */}
      {!connected && (
        <div className="fixed bottom-3 left-3 z-50 glass-pill px-3 py-1 rounded-full flex items-center gap-2 text-[10px] text-amber-400 border border-amber-500/30">
          <WifiOff size={12} />
          <span>Daemon Offline (Reconnecting...)</span>
        </div>
      )}

      {/* 6. Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        thinkingMode={thinkingMode}
        onToggleThinking={toggleThinking}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* 7. Circle to Ask Screen Overlay */}
      <CircleToAsk
        isOpen={isCircleOpen}
        onCapture={(bbox) => {
          sendChatMessage(`Circle to ask on region: (${bbox.x1}, ${bbox.y1}) to (${bbox.x2}, ${bbox.y2})`);
        }}
        onClose={() => setIsCircleOpen(false)}
      />

      {/* Voice Transcript Floating Banner */}
      <AnimatePresence>
        {voiceState !== 'idle' && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 glass-pill px-5 py-2.5 rounded-full flex items-center gap-3 text-xs text-white shadow-2xl border border-white/10"
          >
            <Mic
              size={16}
              className={
                voiceState === 'listening'
                  ? 'text-cyan-400 animate-pulse'
                  : voiceState === 'thinking'
                  ? 'text-indigo-400 animate-bounce'
                  : 'text-purple-400'
              }
            />
            <span className="font-medium text-slate-200">
              {voiceTranscript || (voiceState === 'listening' ? 'Listening...' : 'Thinking...')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notification Toast for Clock Reverse-Trigger */}
      <AnimatePresence>
        {clockEvent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-50 glass-panel px-4 py-3 rounded-2xl flex items-center gap-3 shadow-2xl border border-cyan-500/40 text-xs text-white"
          >
            <Bell size={18} className="text-cyan-400 animate-bounce" />
            <div className="flex flex-col">
              <span className="font-semibold text-cyan-300">Clock Alarm Triggered</span>
              <span className="text-slate-300">{clockEvent}</span>
            </div>
            <button
              onClick={clearClockEvent}
              className="ml-2 text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notification Toast for Wheel Action Result */}
      <AnimatePresence>
        {lastWheelResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 glass-panel px-4 py-3 rounded-2xl flex items-center gap-2.5 shadow-2xl border border-emerald-500/40 text-xs text-white"
          >
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span className="text-slate-200">{lastWheelResult}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default App;
