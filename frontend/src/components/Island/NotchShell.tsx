import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { AppearanceConfig } from '../../types/ipc';
import { appearanceCssVars } from './appearance';
import type { DockApp } from './dockApps';
import { NotchHeader } from './NotchHeader';
import { NotchIdle } from './NotchIdle';
import { NotchPeek } from './NotchPeek';

interface NotchShellProps {
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  appearance: AppearanceConfig;
  peekEnabled: boolean;
  apps: DockApp[];
  mediaActive: boolean;
  spotify: boolean;
  onOpenSettings: () => void;
  onKill: () => void;
  children: React.ReactNode;
}

export const NotchShell: React.FC<NotchShellProps> = ({
  isExpanded,
  onExpandedChange,
  appearance,
  peekEnabled,
  apps,
  mediaActive,
  spotify,
  onOpenSettings,
  onKill,
  children,
}) => {
  const [now, setNow] = useState(() => new Date());
  const [peek, setPeek] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1200 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);

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
    if (enterTimer.current) window.clearTimeout(enterTimer.current);
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
  }, [isExpanded]);

  useEffect(() => {
    if (!peekEnabled) setPeek(false);
  }, [peekEnabled]);

  useEffect(
    () => () => {
      if (enterTimer.current) window.clearTimeout(enterTimer.current);
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    },
    []
  );

  const clearTimers = () => {
    if (enterTimer.current) window.clearTimeout(enterTimer.current);
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
  };

  const handlePointerEnter = () => {
    if (isExpanded || !peekEnabled) return;
    clearTimers();
    enterTimer.current = window.setTimeout(() => setPeek(true), 180);
  };

  const handlePointerLeave = () => {
    if (isExpanded) return;
    clearTimers();
    leaveTimer.current = window.setTimeout(() => setPeek(false), 280);
  };

  const open = () => onExpandedChange(true);
  const close = () => {
    setPeek(false);
    onExpandedChange(false);
  };

  const compactWidth = mediaActive ? 176 : 140;
  const width = isExpanded
    ? Math.min(1200, viewport.width - 32)
    : peek
      ? Math.min(520, viewport.width - 24)
      : compactWidth;
  const height = isExpanded
    ? Math.min(680, viewport.height - 16)
    : peek
      ? 48
      : 36;

  return (
    <motion.div
      data-aether-interactive
      data-notch-shell
      initial={false}
      animate={{ width, height, borderRadius: '0px 0px 20px 20px' }}
      transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.8 }}
      onClick={() => {
        if (!isExpanded) open();
      }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocusCapture={() => {
        if (!isExpanded && peekEnabled) setPeek(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPeek(false);
        }
      }}
      className="notch-surface relative z-50 flex flex-col overflow-hidden text-white"
      style={{
        ...appearanceCssVars(appearance),
        '--notch-alpha': isExpanded
          ? appearance.island_opacity
          : appearance.pill_opacity,
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
            mediaActive={mediaActive}
            spotify={spotify}
            onOpenSettings={onOpenSettings}
            onKill={onKill}
            onClose={close}
          />
          {children}
        </motion.div>
      ) : (
        <motion.div
          key={peek ? 'peek' : 'idle'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14 }}
          className="h-full w-full"
        >
          {peek ? (
            <NotchPeek
              now={now}
              apps={apps.length > 0 ? apps : []}
              mediaActive={mediaActive}
              spotify={spotify}
              onOpen={open}
            />
          ) : (
            <NotchIdle
              now={now}
              mediaActive={mediaActive}
              spotify={spotify}
              onOpen={open}
            />
          )}
        </motion.div>
      )}
    </motion.div>
  );
};
