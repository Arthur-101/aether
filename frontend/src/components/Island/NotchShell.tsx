import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { AppearanceConfig, MediaSnapshot, TaskbarPinnedApp } from '../../types/ipc';
import type { AutoHidePillMetrics } from '../../hooks/useAutoHidePill';
import { appearanceCssVars } from './appearance';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { formatClockTime } from './timeFormat';
import { NotchHeader } from './NotchHeader';
import { NotchIdle } from './NotchIdle';
import { NotchPeek } from './NotchPeek';
import { computePeekLayout } from './peekLayout';
import { compactPillWidth } from './pillTools';
import type { ClockTools } from './useClockTools';
import {
  CONTENT_PADDING,
  HEADER_HEIGHT,
  MAX_ISLAND_WIDTH,
  MIN_ISLAND_HEIGHT,
  MIN_ISLAND_WIDTH,
  SHELL_BORDER,
  TABS_HEIGHT,
} from './tabSizes';

interface NotchShellProps {
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  brandName: string;
  appearance: AppearanceConfig;
  peekEnabled: boolean;
  apps: TaskbarPinnedApp[];
  media: MediaSnapshot | null;
  clockTools: ClockTools;
  onLaunchApp: (app: TaskbarPinnedApp) => void;
  onManageApps: () => void;
  onOpenSettings: () => void;
  onKill: () => void;
  /** Width the active tab wants, in pixels. */
  tabWidth: number;
  /** Width the tab strip needs, so the shell never clips a tab label. */
  tabsWidth: number;
  /** Height of the rendered tab body, in pixels. */
  contentHeight: number;
  tucked: boolean;
  onMetricsChange: (metrics: AutoHidePillMetrics) => void;
  /** Tracks keyboard focus inside the shell so auto-hide can pause. */
  onFocusWithinChange?: (focused: boolean) => void;
  children: React.ReactNode;
}

export const NotchShell: React.FC<NotchShellProps> = ({
  isExpanded,
  onExpandedChange,
  brandName,
  appearance,
  peekEnabled,
  apps,
  media,
  clockTools,
  onLaunchApp,
  onManageApps,
  onOpenSettings,
  onKill,
  tabWidth,
  tabsWidth,
  contentHeight,
  tucked,
  onMetricsChange,
  onFocusWithinChange,
  children,
}) => {
  const [now, setNow] = useState(() => new Date());
  const [peek, setPeek] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const focusWithinRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const timeFormat = useTimeFormat();
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1200 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const mediaActive = Boolean(media?.is_playing);
  const spotify = Boolean(media?.is_spotify);
  // Expanding must win immediately, even before the auto-hide controller's
  // suspension effect runs, so the island can never animate above the screen.
  const isTucked = tucked && !isExpanded;
  const clearTimers = useCallback(() => {
    if (enterTimer.current !== null) {
      window.clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isExpanded) return;
    setPeek(false);
    clearTimers();
  }, [clearTimers, isExpanded]);

  useEffect(() => {
    if (peekEnabled) return;
    clearTimers();
    setPeek(false);
  }, [clearTimers, peekEnabled]);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  useEffect(() => {
    if (!isTucked) return;
    clearTimers();
    setPeek(false);
  }, [clearTimers, isTucked]);

  const handlePointerEnter = () => {
    if (isTucked || isExpanded || !peekEnabled || focusWithinRef.current) return;
    clearTimers();
    enterTimer.current = window.setTimeout(() => {
      enterTimer.current = null;
      if (focusWithinRef.current) return;
      setPeek(true);
    }, 180);
  };

  const handlePointerLeave = () => {
    if (isTucked || isExpanded || focusWithinRef.current) return;
    clearTimers();
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null;
      if (focusWithinRef.current) return;
      setPeek(false);
    }, 280);
  };

  const open = useCallback(() => onExpandedChange(true), [onExpandedChange]);
  const close = useCallback(() => {
    setPeek(false);
    onExpandedChange(false);
  }, [onExpandedChange]);

  const updateFocusWithin = useCallback((value: boolean) => {
    focusWithinRef.current = value;
    setFocusWithin(value);
  }, []);

  // The idle pill and the hover peek are different buttons. Give the peek
  // swap time to settle, then return focus unless the user has clicked away.
  const focusIslandTrigger = useCallback(() => {
    let attempts = 0;
    const focusOnce = () => {
      attempts += 1;
      const active = document.activeElement as HTMLElement | null;
      const canRefocus =
        !active ||
        active === document.body ||
        active === document.documentElement ||
        !active.isConnected;
      if (canRefocus) {
        document.querySelector<HTMLElement>('[data-aether-island-trigger]')?.focus();
      }
      if (attempts < 3) window.setTimeout(focusOnce, 110);
    };
    window.setTimeout(focusOnce, 90);
  }, []);

  useEffect(() => {
    onFocusWithinChange?.(focusWithin);
  }, [focusWithin, onFocusWithinChange]);

  useEffect(() => {
    return () => onFocusWithinChange?.(false);
  }, [onFocusWithinChange]);

  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // A picker, menu, or dialog above the island owns Escape first.
      if (document.querySelector('[data-aether-escape-layer]')) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('[data-aether-escape-guard]')) return;
      // Closing the island unmounts Quick Chat, so protect an in-progress draft.
      if (target instanceof HTMLTextAreaElement && target.value.trim()) return;

      event.preventDefault();
      close();
      focusIslandTrigger();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close, focusIslandTrigger, isExpanded]);

  const compactWidth = compactPillWidth(
    clockTools,
    mediaActive,
    2 + formatClockTime(now, timeFormat).length * 7.4
  );
  const showPeek = peek && !isTucked;
  // The peek grows with the number of apps rather than scrolling.
  const peekLayout = useMemo(
    () => computePeekLayout(apps.length, viewport.width),
    [apps.length, viewport.width]
  );
  // The expanded island sizes itself to the active tab: the width the tab
  // asks for, and the height its content actually needed. It is never
  // narrower than the tab strip, or the tab labels would start wrapping.
  const expandedWidth = Math.max(
    MIN_ISLAND_WIDTH,
    Math.min(
      Math.max(tabWidth, tabsWidth),
      MAX_ISLAND_WIDTH,
      viewport.width - 32
    )
  );
  const expandedHeight = Math.max(
    MIN_ISLAND_HEIGHT,
    Math.min(
      HEADER_HEIGHT +
        TABS_HEIGHT +
        SHELL_BORDER +
        contentHeight +
        CONTENT_PADDING,
      viewport.height - 16
    )
  );
  const width = isExpanded
    ? expandedWidth
    : showPeek
      ? peekLayout.width
      : compactWidth;
  const height = isExpanded
    ? expandedHeight
    : showPeek
      ? 48
      : 36;

  useEffect(() => {
    onMetricsChange({
      compactWidth,
      activeWidth: width,
      activeHeight: height,
    });
  }, [compactWidth, height, onMetricsChange, width]);

  return (
    <motion.div
      data-aether-interactive
      data-notch-shell
      initial={false}
      animate={{
        width,
        height,
        y: isTucked ? -(height + 2) : 0,
        borderRadius: '0px 0px 20px 20px',
      }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              width: { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 },
              height: { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 },
              borderRadius: { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 },
              y: { duration: 0.18, ease: 'easeOut' },
            }
      }
      onClick={() => {
        if (!isExpanded) open();
      }}
      onKeyDownCapture={(event) => {
        // Global shortcuts end in Space/Enter. A focused button inside the
        // shell must not treat the shortcut's main key as a click.
        if (event.key !== ' ' && event.key !== 'Enter') return;
        if (!(event.ctrlKey || event.altKey || event.metaKey || event.shiftKey)) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, [role="button"], a[href]')) {
          event.preventDefault();
        }
      }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocusCapture={() => {
        updateFocusWithin(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPeek(false);
          updateFocusWithin(false);
        }
      }}
      className="notch-surface aether-grain aether-pop relative z-50 flex flex-col overflow-hidden text-[var(--aether-text-1)]"
      style={{
        ...appearanceCssVars(appearance),
        '--notch-alpha': isExpanded
          ? appearance.island_opacity
          : appearance.pill_opacity,
        // The pill and the island carry their own grain and pop depth, so the
        // surface keeps its own identity as it grows.
        '--aether-grain': isExpanded ? appearance.island_grain : appearance.pill_grain,
        '--aether-pop': isExpanded ? appearance.island_pop : appearance.pill_pop,
      } as React.CSSProperties}
    >
      {isExpanded ? (
        <motion.div
          key="expanded"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16, delay: 0.06 }}
          className="flex h-full min-h-0 flex-col"
        >
          <NotchHeader
            now={now}
            brandName={brandName}
            onOpenSettings={onOpenSettings}
            onKill={onKill}
            onClose={close}
          />
          {children}
        </motion.div>
      ) : (
        <motion.div
          key={showPeek ? 'peek' : 'idle'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14 }}
          className="h-full w-full"
        >
          {showPeek ? (
            <NotchPeek
              now={now}
              layout={peekLayout}
              apps={apps}
              mediaActive={mediaActive}
              spotify={spotify}
              onOpen={open}
              onLaunch={onLaunchApp}
              onManageApps={onManageApps}
            />
          ) : (
            <NotchIdle
              now={now}
              mediaActive={mediaActive}
              spotify={spotify}
              clockTools={clockTools}
              onOpen={open}
            />
          )}
        </motion.div>
      )}
    </motion.div>
  );
};
