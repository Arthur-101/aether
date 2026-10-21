/**
 * Timer and stopwatch ownership for the Clock & Tasks tab.
 *
 * Lives above the tab content so switching tabs never resets a running timer or
 * stopwatch. Uses absolute timestamps to avoid interval drift.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export const TIMER_PRESETS = [5, 15, 25, 45] as const;

function chime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const notes = [880, 1174.66, 880];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.22);
      gain.gain.exponentialRampToValueAtTime(
        0.18,
        context.currentTime + index * 0.22 + 0.02
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + index * 0.22 + 0.18
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + index * 0.22);
      oscillator.stop(context.currentTime + index * 0.22 + 0.2);
    });
    window.setTimeout(() => void context.close(), 1200);
  } catch {
    // Audio is a nicety; the visual completion state still works.
  }
}

export interface ClockTools {
  timer: {
    durationSec: number;
    remainingMs: number;
    running: boolean;
    finished: boolean;
  };
  stopwatch: {
    elapsedMs: number;
    running: boolean;
    laps: number[];
  };
  setTimerDuration: (seconds: number) => void;
  toggleTimer: () => void;
  resetTimer: () => void;
  dismissTimerFinished: () => void;
  toggleStopwatch: () => void;
  resetStopwatch: () => void;
  lapStopwatch: () => void;
}

export function useClockTools(): ClockTools {
  const [durationSec, setDurationSec] = useState(25 * 60);
  const [remainingMs, setRemainingMs] = useState(durationSec * 1000);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerFinished, setTimerFinished] = useState(false);
  const timerEndRef = useRef<number | null>(null);

  const [elapsedMs, setElapsedMs] = useState(0);
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const stopwatchStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!timerRunning) return;
    const tick = () => {
      const end = timerEndRef.current;
      if (end === null) return;
      const next = Math.max(0, end - Date.now());
      setRemainingMs(next);
      if (next > 0) return;
      timerEndRef.current = null;
      setTimerRunning(false);
      setTimerFinished(true);
      chime();
    };
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  useEffect(() => {
    if (!stopwatchRunning) return;
    const tick = () => {
      const start = stopwatchStartRef.current;
      if (start !== null) setElapsedMs(Date.now() - start);
    };
    tick();
    const interval = window.setInterval(tick, 50);
    return () => window.clearInterval(interval);
  }, [stopwatchRunning]);

  const setTimerDuration = useCallback((seconds: number) => {
    const safe = Math.max(1, Math.round(seconds));
    setDurationSec(safe);
    if (!timerRunning) {
      timerEndRef.current = null;
      setRemainingMs(safe * 1000);
      setTimerFinished(false);
    }
  }, [timerRunning]);

  const toggleTimer = useCallback(() => {
    setTimerFinished(false);
    if (timerRunning) {
      const end = timerEndRef.current;
      const next = end === null ? remainingMs : Math.max(0, end - Date.now());
      timerEndRef.current = null;
      setRemainingMs(next);
      setTimerRunning(false);
      return;
    }
    const next = remainingMs > 0 ? remainingMs : durationSec * 1000;
    timerEndRef.current = Date.now() + next;
    setRemainingMs(next);
    setTimerRunning(true);
  }, [durationSec, remainingMs, timerRunning]);

  const resetTimer = useCallback(() => {
    timerEndRef.current = null;
    setTimerRunning(false);
    setTimerFinished(false);
    setRemainingMs(durationSec * 1000);
  }, [durationSec]);

  const dismissTimerFinished = useCallback(() => setTimerFinished(false), []);

  const toggleStopwatch = useCallback(() => {
    if (stopwatchRunning) {
      const start = stopwatchStartRef.current;
      if (start !== null) setElapsedMs(Date.now() - start);
      stopwatchStartRef.current = null;
      setStopwatchRunning(false);
      return;
    }
    stopwatchStartRef.current = Date.now() - elapsedMs;
    setStopwatchRunning(true);
  }, [elapsedMs, stopwatchRunning]);

  const resetStopwatch = useCallback(() => {
    stopwatchStartRef.current = null;
    setStopwatchRunning(false);
    setElapsedMs(0);
    setLaps([]);
  }, []);

  const lapStopwatch = useCallback(() => {
    setLaps((prev) => [elapsedMs, ...prev].slice(0, 5));
  }, [elapsedMs]);

  return {
    timer: {
      durationSec,
      remainingMs,
      running: timerRunning,
      finished: timerFinished,
    },
    stopwatch: { elapsedMs, running: stopwatchRunning, laps },
    setTimerDuration,
    toggleTimer,
    resetTimer,
    dismissTimerFinished,
    toggleStopwatch,
    resetStopwatch,
    lapStopwatch,
  };
}
