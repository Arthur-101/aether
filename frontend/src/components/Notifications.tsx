import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlarmClock,
  Bell,
  CheckCircle2,
  Mic,
  WifiOff,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { ClockAlert, VoiceState } from '../types/ipc';

interface NotificationsProps {
  connected: boolean;
  voiceState: VoiceState;
  voiceTranscript: string;
  clockAlert: ClockAlert | null;
  wheelResult: string | null;
  errorMessage: string | null;
  onClearClock: () => void;
  onSnoozeAlarm: () => void;
  onClearWheelResult: () => void;
  onClearError: () => void;
}

export const Notifications: React.FC<NotificationsProps> = ({
  connected,
  voiceState,
  voiceTranscript,
  clockAlert,
  wheelResult,
  errorMessage,
  onClearClock,
  onSnoozeAlarm,
  onClearWheelResult,
  onClearError,
}) => {
  useEffect(() => {
    if (!clockAlert || clockAlert.kind === 'alarm') return;
    const timer = window.setTimeout(onClearClock, 6000);
    return () => window.clearTimeout(timer);
  }, [clockAlert, onClearClock]);

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

  const isAlarm = clockAlert?.kind === 'alarm';

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
        {clockAlert && (
          <motion.div
            data-aether-interactive
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className={`glass-panel pointer-events-auto flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-xs text-white ${
              isAlarm
                ? 'border-[#fce100]/45 shadow-[0_0_32px_rgba(252,225,0,0.12)]'
                : 'border-[var(--aether-accent)]/40'
            }`}
          >
            {isAlarm ? (
              <AlarmClock size={18} className="shrink-0 animate-pulse text-[#fce100]" />
            ) : (
              <Bell size={18} className="shrink-0 accent-text" />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className={`font-semibold ${
                  isAlarm ? 'text-[#fce100]' : 'accent-text'
                }`}
              >
                {isAlarm ? 'Alarm' : 'Task finished'}
              </span>
              {isAlarm ? (
                <span className="truncate text-[#e5e5e5]">{clockAlert.title}</span>
              ) : (
                <>
                  <span className="truncate text-[#e5e5e5]">{clockAlert.title}</span>
                  <span className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-[#8b8b8b]">
                    {clockAlert.event}
                  </span>
                </>
              )}
              {isAlarm ? (
                <span className="mt-0.5 text-[9px] text-[#8b8b8b]">
                  Tap Snooze or Dismiss to stop the ring.
                </span>
              ) : null}
            </div>
            {isAlarm ? (
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  onClick={onSnoozeAlarm}
                  className="rounded-md bg-white/10 px-2 py-1 text-[9px] font-medium text-white transition hover:bg-white/20"
                >
                  Snooze 5m
                </button>
                <button
                  onClick={onClearClock}
                  className="rounded-md px-2 py-1 text-[9px] text-[#c7c7c7] transition hover:bg-white/10 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            ) : (
              <button
                onClick={onClearClock}
                className="ml-auto shrink-0 text-[#8b8b8b] hover:text-white"
              >
                <X size={13} />
              </button>
            )}
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
