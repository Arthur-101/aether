import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import type {
  RadialWheelCursor,
  RadialWheelDropPayload,
  RadialWheelPayload,
} from '../../types/ipc';
import {
  WHEEL_SIZE,
  buildSlices,
  hitTestWheel,
  sliceActionLabel,
} from './geometry';
import { RadialWheelCanvas } from './RadialWheelCanvas';

interface RadialWheelProps {
  data: RadialWheelPayload;
  cursor: RadialWheelCursor | null;
  dropPoint: RadialWheelDropPayload | null;
  onAction: (filePath: string, action: string, target?: string) => void;
  onAsk: (filePath: string) => void;
  onOpenCrop: (filePath: string) => void;
  onOpenAddBg: (filePath: string) => void;
  onClose: () => void;
}

const ASK_EXTENSIONS = new Set([
  'pdf', 'txt', 'md', 'docx', 'py', 'js', 'json', 'csv',
  'png', 'jpg', 'jpeg', 'webp',
]);

export const RadialWheel: React.FC<RadialWheelProps> = ({
  data,
  cursor,
  dropPoint,
  onAction,
  onAsk,
  onOpenCrop,
  onOpenAddBg,
  onClose,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [coreHovered, setCoreHovered] = useState(false);

  const ext = data.ext.toLowerCase().replace('.', '');
  const isPdf = ext === 'pdf';
  const askEligible = ASK_EXTENSIONS.has(ext);
  const slices = buildSlices(ext, askEligible);

  // Global cursor coordinates are physical pixels; CSS uses logical pixels.
  const scale = window.devicePixelRatio || 1;
  const left = Math.min(
    Math.max(data.x / scale - WHEEL_SIZE / 2, 8),
    window.innerWidth - WHEEL_SIZE - 8
  );
  const top = Math.min(
    Math.max(data.y / scale - WHEEL_SIZE / 2, 8),
    window.innerHeight - WHEEL_SIZE - 8
  );
  const centerX = left + WHEEL_SIZE / 2;
  const centerY = top + WHEEL_SIZE / 2;

  const liveHit = cursor
    ? hitTestWheel(cursor.x / scale, cursor.y / scale, centerX, centerY, slices.length)
    : null;
  const liveIndex = liveHit?.type === 'slice' ? liveHit.index : null;
  const coreHighlighted = liveHit?.type === 'core' || coreHovered;
  const highlightedIndex = liveIndex ?? hoveredIndex;
  const activeLabel = coreHighlighted
    ? 'Cancel'
    : highlightedIndex !== null
      ? sliceActionLabel(slices[highlightedIndex], isPdf)
      : 'Pick an action';

  const activate = (label: string) => {
    if (label === 'ASK') {
      onAsk(data.file_path);
      return;
    }
    if (label === 'CROP') {
      onOpenCrop(data.file_path);
      onClose();
      return;
    }
    if (label === 'ADD BG') {
      onOpenAddBg(data.file_path);
      onClose();
      return;
    }
    if (label === 'COMPRESS') {
      onAction(data.file_path, 'COMPRESS');
    } else if (label === 'METADATA') {
      onAction(data.file_path, 'STRIP_META');
    } else if (label === 'B&W') {
      onAction(data.file_path, 'B&W');
    } else {
      onAction(data.file_path, isPdf ? 'CONVERT_DOC' : 'CONVERT', label.toLowerCase());
    }
    onClose();
  };

  const activateCore = () => {
    onClose();
  };

  // Explorer owns mouse capture during a drag, so backend RADIAL_WHEEL_DROP is
  // authoritative for the final slice instead of DOM pointer events.
  useEffect(() => {
    if (!dropPoint) return;
    const hit = hitTestWheel(
      dropPoint.x / scale,
      dropPoint.y / scale,
      centerX,
      centerY,
      slices.length
    );
    if (!hit) {
      onClose();
      return;
    }
    if (hit.type === 'core') {
      onClose();
      return;
    }
    activate(slices[hit.index]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropPoint?.id]);

  return (
    <div
      data-aether-interactive
      className="aether-interactive fixed inset-0 z-50 bg-transparent"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 26 }}
        onClick={(event) => event.stopPropagation()}
        className="relative select-none"
        style={{ left, top, position: 'absolute', width: WHEEL_SIZE, height: WHEEL_SIZE }}
      >
        <RadialWheelCanvas
          slices={slices}
          highlightedIndex={highlightedIndex}
          coreHighlighted={coreHighlighted}
          onActivate={activate}
          onCoreActivate={activateCore}
          onHover={setHoveredIndex}
          onCoreHover={setCoreHovered}
        />

        <div
          onClick={activateCore}
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
        >
          <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-[var(--aether-accent-text)]">
            <Sparkles size={10} />
            <span>ACTIONS</span>
          </div>
          <div className="mt-0.5 max-w-[118px] truncate text-[12px] font-bold text-[var(--aether-text-1)]">
            {activeLabel}
          </div>
          <div className="mt-0.5 max-w-[86px] truncate text-[9px] text-[var(--aether-text-2)]">
            {data.file_path.split(/[\\/]/).pop()}
          </div>
          <div className="mt-0.5 text-[9px] text-[var(--aether-text-3)]">
            {coreHighlighted ? 'Release to cancel' : 'Release on a slice'}
          </div>
        </div>

        <button
          onClick={onClose}
          className="absolute right-1 top-1 rounded-full bg-[var(--aether-surface-1)] p-1 text-[var(--aether-text-3)] transition hover:text-[var(--aether-text-1)]"
        >
          <X size={14} />
        </button>
      </motion.div>
    </div>
  );
};
