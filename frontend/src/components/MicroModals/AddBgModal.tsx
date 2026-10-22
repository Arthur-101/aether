import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, X, RotateCcw, Download } from 'lucide-react';

interface AddBgModalProps {
  isOpen: boolean;
  filePath: string;
  onSave: (filePath: string, bg: string, padding: number, corners: number, shadow: number) => void;
  onClose: () => void;
}

export const AddBgModal: React.FC<AddBgModalProps> = ({
  isOpen,
  filePath,
  onSave,
  onClose,
}) => {
  const [padding, setPadding] = useState(32);
  const [corners, setCorners] = useState(16);
  const [shadow, setShadow] = useState(24);
  const [selectedBg, setSelectedBg] = useState('linear-gradient(135deg, #667eea 0%, #764ba2 100%)');

  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    '#0F172A',
    '#FFFFFF',
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div data-aether-interactive className="aether-interactive fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="glass-panel w-[460px] rounded-2xl p-5 shadow-2xl flex flex-col gap-4 border border-[var(--aether-line)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[var(--aether-line-soft)]">
            <div className="flex items-center gap-2">
              <Palette size={18} className="text-cyan-400" />
              <h3 className="text-sm font-semibold text-[var(--aether-text-1)]">Add Background & Polish</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-[var(--aether-text-1)] hover:bg-[var(--aether-fill)] transition"
            >
              <X size={16} />
            </button>
          </div>

          {/* Canvas Preview Box */}
          <div
            className="h-56 rounded-xl flex items-center justify-center relative overflow-hidden transition-all duration-200"
            style={{ background: selectedBg }}
          >
            <div
              className="bg-white/90 w-44 h-28 flex flex-col p-3 transition-all duration-150"
              style={{
                borderRadius: `${corners}px`,
                boxShadow: `0 ${shadow / 2}px ${shadow}px rgba(0,0,0,0.4)`,
              }}
            >
              <div className="w-16 h-2 bg-slate-800 rounded mb-2" />
              <div className="w-32 h-1.5 bg-slate-400 rounded mb-1" />
              <div className="w-24 h-1.5 bg-slate-300 rounded" />
            </div>
            <div className="absolute bottom-2 left-3 text-[10px] text-white/70 drop-shadow truncate max-w-[360px]">
              {filePath}
            </div>
          </div>

          {/* Background Presets */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-slate-400">Background Preset</label>
            <div className="flex gap-2">
              {gradients.map((bg, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedBg(bg)}
                  style={{ background: bg }}
                  className={`w-7 h-7 rounded-full border-2 transition ${
                    selectedBg === bg ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Sliders */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Padding</span>
              <span className="font-mono text-slate-300">{padding}px</span>
            </div>
            <input
              type="range"
              min="8"
              max="64"
              value={padding}
              onChange={(e) => setPadding(Number(e.target.value))}
              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Corners</span>
              <span className="font-mono text-slate-300">{corners}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="32"
              value={corners}
              onChange={(e) => setCorners(Number(e.target.value))}
              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Drop Shadow</span>
              <span className="font-mono text-slate-300">{shadow}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              value={shadow}
              onChange={(e) => setShadow(Number(e.target.value))}
              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>

          {/* Footer CTAs */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--aether-line-soft)]">
            <button
              onClick={() => {
                setPadding(32);
                setCorners(16);
                setShadow(24);
              }}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-[var(--aether-text-1)] flex items-center gap-1 transition"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
            <button
              onClick={() => {
                onSave(filePath, selectedBg, padding, corners, shadow);
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-[var(--aether-text-1)] text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 shadow-lg shadow-cyan-500/20 transition"
            >
              <Download size={14} />
              <span>Save with Background</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
