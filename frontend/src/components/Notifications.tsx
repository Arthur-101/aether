import React, { useEffect, useRef } from 'react';
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
  /**
   * True while the overlay window is the small strip under the pill. The
   * notifications dock directly below the pill so they fit that strip; while a
   * full-screen panel is open they keep their original bottom-of-screen spots.
   */
  compact: boolean;
  /** Reports the compact column's rendered height in CSS pixels. */
  onHeightChange?: (height: number) => void;
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
  compact,
  onHeightChange,
}) => {
  const columnRef = useRef<HTMLDivElement>(null);

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
    const timer = window.setTimeout(onClearError, 4000);
    return () => window.clearTimeout(timer);
  }, [errorMessage, onClearError]);

  // The bounds hook sizes the strip around this column. Measuring the column
  // itself keeps the window tight for a one-line toast and still fits an alarm
  // card with buttons.
  useEffect(() => {
    if (!compact) {
      onHeightChange?.(0);
      return;
    }
    const element = columnRef.current;
    if (!element) return;
    const report = () => onHeightChange?.(element.getBoundingClientRect().height);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => {
      observer.disconnect();
      onHeightChange?.(0);
    };
  }, [compact, onHeightChange]);

  const isAlarm = clockAlert?.kind === 'alarm';

  const offline = !connected ? (
    <div className="glass-pill flex items-center gap-2 rounded-full border border-[#fce100]/30 px-3 py-1 text-[10px] text-[#fce100]">
      <WifiOff size={12} />
      <span>Daemon offline — reconnecting…</span>
    </div>
  ) : null;

  const voice =
    voiceState !== 'idle' ? (
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        role="status"
        aria-live="polite"
        className="glass-pill aether-grain aether-pop flex max-w-full items-center gap-3 rounded-full border border-[var(--aether-line)] px-5 py-2.5 text-xs text-[var(--aether-text-1)]"
      >
        <Mic
          size={16}
          className={
            voiceState === 'listening'
              ? 'animate-pulse text-[var(--aether-accent-text)] motion-reduce:animate-none'
              : voiceState === 'thinking'
                ? 'animate-bounce text-[#fce100] motion-reduce:animate-none'
                : 'text-[#6ccb5f]'
          }
        />
        <span className="truncate font-medium text-[var(--aether-text-1)]">
          {voiceTranscript ||
            (voiceState === 'listening' ? 'Listening…' : 'Thinking…')}
        </span>
      </motion.div>
    ) : null;

  const alerts = (
    <AnimatePresence>
      {clockAlert && (
        <motion.div
          data-aether-interactive
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          role={isAlarm ? 'alert' : 'status'}
          aria-live={isAlarm ? 'assertive' : 'polite'}
          className={`glass-panel pointer-events-auto flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-xs text-[var(--aether-text-1)] ${
            isAlarm
              ? 'border-[#fce100]/45 shadow-[0_0_32px_rgba(252,225,0,0.12)]'
              : 'border-[var(--aether-accent)]/40'
          }`}
        >
          {isAlarm ? (
            <AlarmClock
              size={18}
              className="shrink-0 animate-pulse text-[#fce100] motion-reduce:animate-none"
            />
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
              <span className="truncate text-[var(--aether-text-1)]">{clockAlert.title}</span>
            ) : (
              <>
                <span className="truncate text-[var(--aether-text-1)]">{clockAlert.title}</span>
                <span className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-[var(--aether-text-3)]">
                  {clockAlert.event}
                </span>
              </>
            )}
            {isAlarm ? (
              <span className="mt-0.5 text-[9px] text-[var(--aether-text-3)]">
                Tap Snooze or Dismiss to stop the ring.
              </span>
            ) : null}
          </div>
          {isAlarm ? (
            <div className="flex shrink-0 flex-col gap-1">
              <button
                onClick={onSnoozeAlarm}
                className="rounded-md bg-[var(--aether-fill-2)] px-2 py-1 text-[9px] font-medium text-[var(--aether-text-1)] transition hover:bg-white/20"
              >
                Snooze 5m
              </button>
              <button
                onClick={onClearClock}
                className="rounded-md px-2 py-1 text-[9px] text-[var(--aether-text-2)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
              >
                Dismiss
              </button>
            </div>
          ) : (
            <button
              onClick={onClearClock}
              className="ml-auto shrink-0 text-[var(--aether-text-3)] hover:text-[var(--aether-text-1)]"
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
          className="glass-panel pointer-events-auto flex w-full items-center gap-2.5 rounded-lg border border-[#6ccb5f]/35 px-4 py-3 text-xs text-[var(--aether-text-1)]"
        >
          <CheckCircle2 size={16} className="shrink-0 text-[#6ccb5f]" />
          <span className="min-w-0 flex-1 break-words text-[var(--aether-text-1)]">{wheelResult}</span>
          <button
            onClick={onClearWheelResult}
            className="text-[var(--aether-text-3)] hover:text-[var(--aether-text-1)]"
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
          <button onClick={onClearError} className="text-[var(--aether-text-2)] hover:text-[var(--aether-text-1)]">
            <X size={13} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (compact) {
    return (
      <div
        ref={columnRef}
        className="pointer-events-none fixed left-1/2 top-[52px] z-50 flex w-[320px] -translate-x-1/2 flex-col items-center gap-2"
      >
        {offline}
        <AnimatePresence>{voice}</AnimatePresence>
        {alerts}
      </div>
    );
  }

  return (
    <>
      {offline ? (
        <div className="pointer-events-none fixed bottom-3 left-3 z-50">{offline}</div>
      ) : null}

      <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
        <AnimatePresence>{voice}</AnimatePresence>
      </div>

      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-[320px] flex-col items-end gap-2">
        {alerts}
      </div>
    </>
  );
};
