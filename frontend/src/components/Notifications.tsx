import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCircle2, Mic, WifiOff, AlertTriangle, X } from 'lucide-react';
import type { VoiceState } from '../types/ipc';

interface NotificationsProps {
  connected: boolean;
  voiceState: VoiceState;
  voiceTranscript: string;
  clockEvent: string | null;
  wheelResult: string | null;
  errorMessage: string | null;
  onClearClock: () => void;
  onClearWheelResult: () => void;
  onClearError: () => void;
}

export const Notifications: React.FC<NotificationsProps> = ({
  connected,
  voiceState,
  voiceTranscript,
  clockEvent,
  wheelResult,
  errorMessage,
  onClearClock,
  onClearWheelResult,
  onClearError,
}) => {
  useEffect(() => {
    if (!clockEvent) return;
    const timer = window.setTimeout(onClearClock, 1800);
    return () => window.clearTimeout(timer);
  }, [clockEvent, onClearClock]);

  useEffect(() => {
    if (!wheelResult) return;
    const timer = window.setTimeout(onClearWheelResult, 1800);
    return () => window.clearTimeout(timer);
  }, [wheelResult, onClearWheelResult]);

  useEffect(() => {
    if (!errorMessage) return;
    const timer = window.setTimeout(onClearError, 1800);
    return () => window.clearTimeout(timer);
  }, [errorMessage, onClearError]);

  return (
  <>
    {!connected && (
      <div className="glass-pill fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-full border border-[#fce100]/30 px-3 py-1 text-[10px] text-[#fce100]">
        <WifiOff size={12} />
        <span>Daemon offline — reconnecting…</span>
      </div>
    )}

    <AnimatePresence>
      {voiceState !== 'idle' && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="glass-pill fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 px-5 py-2.5 text-xs text-white"
        >
          <Mic
            size={16}
            className={
              voiceState === 'listening'
                ? 'animate-pulse text-[#60cdff]'
                : voiceState === 'thinking'
                  ? 'animate-bounce text-[#fce100]'
                  : 'text-[#6ccb5f]'
            }
          />
          <span className="font-medium text-[#e5e5e5]">
            {voiceTranscript ||
              (voiceState === 'listening' ? 'Listening…' : 'Thinking…')}
          </span>
        </motion.div>
      )}
    </AnimatePresence>

    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-[320px] flex-col items-end gap-2">
      <AnimatePresence>
        {clockEvent && (
          <motion.div
            data-aether-interactive
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="glass-panel pointer-events-auto flex w-full items-center gap-3 rounded-lg border border-[#0067c0]/40 px-4 py-3 text-xs text-white"
          >
            <Bell size={18} className="text-[#60cdff]" />
            <div className="flex min-w-0 flex-col">
              <span className="font-semibold text-[#9dd5ff]">Clock alarm</span>
              <span className="truncate text-[#c7c7c7]">{clockEvent}</span>
            </div>
            <button onClick={onClearClock} className="ml-auto text-[#8b8b8b] hover:text-white">
              <X size={13} />
            </button>
          </motion.div>
        )}

        {wheelResult && (
          <motion.div
            data-aether-interactive
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="glass-panel pointer-events-auto flex w-full items-center gap-2.5 rounded-lg border border-[#6ccb5f]/35 px-4 py-3 text-xs text-white"
          >
            <CheckCircle2 size={16} className="shrink-0 text-[#6ccb5f]" />
            <span className="min-w-0 flex-1 break-words text-[#e5e5e5]">{wheelResult}</span>
            <button
              onClick={onClearWheelResult}
              className="text-[#8b8b8b] hover:text-white"
            >
              <X size={13} />
            </button>
          </motion.div>
        )}

        {errorMessage && (
          <motion.div
            data-aether-interactive
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="glass-panel pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border border-[#ff99a4]/35 px-4 py-3 text-xs text-[#ffd7d9]"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#ff99a4]" />
            <span className="min-w-0 flex-1 break-words">{errorMessage}</span>
            <button onClick={onClearError} className="text-[#c7c7c7] hover:text-white">
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </>
  );
};
