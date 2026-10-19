import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crop, X, RotateCcw, Check } from 'lucide-react';

interface CropModalProps {
  isOpen: boolean;
  filePath: string;
  onApply: (filePath: string, width: number, height: number, ratio: string) => void;
  onClose: () => void;
}

export const CropModal: React.FC<CropModalProps> = ({
  isOpen,
  filePath,
  onApply,
  onClose,
}) => {
  const [aspectRatio, setAspectRatio] = useState('Free');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);

  const ratios = ['Free', '1:1', '16:9', '9:16', '4:3', '3:4'];

  const handleRatioSelect = (r: string) => {
    setAspectRatio(r);
    if (r === '1:1') setHeight(width);
    if (r === '16:9') setHeight(Math.round((width * 9) / 16));
    if (r === '9:16') setWidth(Math.round((height * 9) / 16));
    if (r === '4:3') setHeight(Math.round((width * 3) / 4));
    if (r === '3:4') setWidth(Math.round((height * 3) / 4));
  };

  const handleReset = () => {
    setAspectRatio('Free');
    setWidth(1920);
    setHeight(1080);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div data-aether-interactive className="aether-interactive fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="glass-panel w-[460px] rounded-2xl p-5 shadow-2xl flex flex-col gap-4 border border-white/10"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Crop size={18} className="text-orange-400" />
              <h3 className="text-sm font-semibold text-white">Crop Image</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
            >
              <X size={16} />
            </button>
          </div>

          {/* Canvas Area Preview */}
          <div className="h-56 bg-slate-950/80 rounded-xl border border-white/5 flex items-center justify-center relative overflow-hidden">
            <div className="w-48 h-36 border-2 border-orange-400/80 rounded shadow-lg relative flex items-center justify-center">
              <span className="text-[11px] text-orange-200/90 font-mono">
                {width} × {height} ({aspectRatio})
              </span>
              <div className="absolute top-0 left-0 w-2 h-2 bg-white -translate-x-1 -translate-y-1" />
              <div className="absolute top-0 right-0 w-2 h-2 bg-white translate-x-1 -translate-y-1" />
              <div className="absolute bottom-0 left-0 w-2 h-2 bg-white -translate-x-1 translate-y-1" />
              <div className="absolute bottom-0 right-0 w-2 h-2 bg-white translate-x-1 translate-y-1" />
            </div>
            <div className="absolute bottom-2 left-3 text-[10px] text-slate-500 truncate max-w-[360px]">
              {filePath}
            </div>
          </div>

          {/* Ratio Pills */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-slate-400">Aspect Ratio</label>
            <div className="flex gap-1.5 flex-wrap">
              {ratios.map((r) => (
                <button
                  key={r}
                  onClick={() => handleRatioSelect(r)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    aspectRatio === r
                      ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Dimension Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-400">Width (px)</label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="w-full mt-1 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-400">Height (px)</label>
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                className="w-full mt-1 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* Footer CTAs */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
            <button
              onClick={() => {
                onApply(filePath, width, height, aspectRatio);
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 shadow-lg shadow-orange-500/20 transition"
            >
              <Check size={14} />
              <span>Apply Crop</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
