import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Camera } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface CircleToAskProps {
  isOpen: boolean;
  onCapture: (bbox: { x1: number; y1: number; x2: number; y2: number }) => void;
  onClose: () => void;
}

export const CircleToAsk: React.FC<CircleToAskProps> = ({
  isOpen,
  onCapture,
  onClose,
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

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
        className="aether-interactive fixed inset-0 z-50 cursor-crosshair select-none bg-black/25 backdrop-blur-xs"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Helper Top Banner */}
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -30, opacity: 0 }}
          className="fixed top-6 left-1/2 -translate-x-1/2 glass-panel px-4 py-2 rounded-full flex items-center gap-2.5 text-xs text-white shadow-xl pointer-events-auto"
        >
          <Camera size={14} className="text-cyan-400" />
          <span>Drag to select any area on screen • Press ESC to cancel</span>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition"
          >
            <X size={12} />
          </button>
        </motion.div>

        {/* Drawn Bounding Box */}
        {currentBox && (
          <div
            className="absolute border-2 border-cyan-400 bg-cyan-500/10 rounded shadow-[0_0_20px_#38bdf8] pointer-events-none"
            style={{
              left: currentBox.x,
              top: currentBox.y,
              width: currentBox.w,
              height: currentBox.h,
            }}
          >
            <div className="absolute top-1 right-2 flex items-center gap-1 text-[10px] font-mono text-cyan-300 bg-slate-950/80 px-1.5 py-0.5 rounded border border-cyan-400/40">
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
