import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
  children,
}) => {
  const [now, setNow] = useState(() => new Date());
  const [peek, setPeek] = useState(false);
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
    if (isTucked || isExpanded || !peekEnabled) return;
    clearTimers();
    enterTimer.current = window.setTimeout(() => {
      enterTimer.current = null;
      setPeek(true);
    }, 180);
  };

  const handlePointerLeave = () => {
    if (isTucked || isExpanded) return;
    clearTimers();
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null;
      setPeek(false);
    }, 280);
  };

  const open = () => onExpandedChange(true);
  const close = () => {
    setPeek(false);
    onExpandedChange(false);
  };

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
      transition={{
        width: { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 },
        height: { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 },
        borderRadius: { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 },
        y: { duration: 0.18, ease: 'easeOut' },
      }}
      onClick={() => {
        if (!isExpanded) open();
      }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocusCapture={() => {
        if (!isTucked && !isExpanded && peekEnabled) setPeek(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPeek(false);
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
