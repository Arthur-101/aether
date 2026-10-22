import React from 'react';
import { motion } from 'framer-motion';

interface IslandPillProps {
  sessionTitle: string;
  dotColor: string;
  onClick: () => void;
}

export const IslandPill: React.FC<IslandPillProps> = ({ sessionTitle, dotColor, onClick }) => (
  <motion.div
    layoutId="island-container"
    onClick={onClick}
    className="glass-pill flex h-9 cursor-pointer select-none items-center gap-3 rounded-full px-4 transition hover:border-[var(--aether-line-strong)]"
  >
    <div className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
    <span className="max-w-[220px] truncate text-xs font-medium text-[var(--aether-text-1)]">
      {sessionTitle || 'New Session'}
    </span>
    <span className="font-mono text-[10px] text-[var(--aether-text-3)]">
      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  </motion.div>
);
