import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Camera } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export interface RegionSelection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface RegionToAskProps {
  isOpen: boolean;
  onCapture: (bbox: RegionSelection) => void;
  onClose: () => void;
}

export const RegionToAsk: React.FC<RegionToAskProps> = ({
  isOpen,
  onCapture,
  onClose,
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsDrawing(false);
    setStartPoint(null);
    setCurrentBox(null);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || !isTauri()) return;
    // Focus the always-on-top overlay so ESC and drag selection are captured.
    void getCurrentWindow().setFocus().catch(() => undefined);
  }, [isOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDrawing(true);
    setStartPoint({ x: e.clientX, y: e.clientY });
    setCurrentBox({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !startPoint) return;
    const x = Math.min(startPoint.x, e.clientX);
    const y = Math.min(startPoint.y, e.clientY);
    const w = Math.abs(e.clientX - startPoint.x);
    const h = Math.abs(e.clientY - startPoint.y);
    setCurrentBox({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentBox || currentBox.w < 10 || currentBox.h < 10) {
      setIsDrawing(false);
      setCurrentBox(null);
      return;
    }
    setIsDrawing(false);
    onCapture({
      x1: currentBox.x,
      y1: currentBox.y,
      x2: currentBox.x + currentBox.w,
      y2: currentBox.y + currentBox.h,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        data-aether-interactive
        data-aether-escape-layer
        className="aether-interactive fixed inset-0 z-50 cursor-crosshair select-none bg-black/25 backdrop-blur-xs"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -30, opacity: 0 }}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
          className="pointer-events-auto fixed top-6 left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full px-4 py-2 text-xs text-[var(--aether-text-1)] shadow-xl glass-panel"
        >
          <Camera size={14} className="text-cyan-400" />
          <span className="font-medium">Region to Ask</span>
          <span className="text-[var(--aether-text-3)]">
            Drag to select an area
          </span>
          <span className="text-[var(--aether-text-3)]">•</span>
          <span className="text-[var(--aether-text-3)]">Esc to cancel</span>
          <button
            onClick={onClose}
            aria-label="Cancel region selection"
            title="Cancel region selection"
            className="rounded-full p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
          >
            <X size={12} />
          </button>
        </motion.div>

        {currentBox && (
          <div
            className="pointer-events-none absolute rounded border-2 border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_#38bdf8]"
            style={{
              left: currentBox.x,
              top: currentBox.y,
              width: currentBox.w,
              height: currentBox.h,
            }}
          >
            <div className="absolute top-1 right-2 flex items-center gap-1 rounded border border-cyan-400/40 bg-slate-950/80 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
              <Sparkles size={10} />
              <span>
                {currentBox.w} × {currentBox.h}
              </span>
            </div>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
};
