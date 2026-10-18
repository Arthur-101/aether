import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, X, Cpu, Mic, Keyboard, Save, Check } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  thinkingMode: boolean;
  onToggleThinking: (enabled: boolean) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  thinkingMode,
  onToggleThinking,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'voice' | 'hotkeys'>('ai');
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="glass-panel w-[580px] h-[460px] rounded-2xl shadow-2xl flex overflow-hidden border border-white/10"
        >
          {/* Left Sidebar */}
          <div className="w-44 bg-slate-950/80 p-4 border-r border-white/5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <Settings size={18} className="text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Settings</h3>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                {[
                  { id: 'ai', label: 'AI & Models', icon: Cpu },
                  { id: 'voice', label: 'Voice Engine', icon: Mic },
                  { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id as any)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl transition text-left ${
                        activeTab === item.id
                          ? 'bg-slate-800 text-white font-medium border border-white/5'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      <Icon size={14} className={activeTab === item.id ? 'text-cyan-400' : ''} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="text-[10px] text-slate-500 font-mono">Aether v0.1.0 • Local-First</div>
          </div>

          {/* Right Main Content */}
          <div className="flex-1 p-5 flex flex-col justify-between overflow-y-auto">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-4">
                <h4 className="text-sm font-semibold text-white">
                  {activeTab === 'ai' && 'AI Engine & Inference'}
                  {activeTab === 'voice' && 'Voice Pipeline (Phonon-2 & Paradee)'}
                  {activeTab === 'hotkeys' && 'Global System Hotkeys'}
                </h4>
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Tab 1: AI */}
              {activeTab === 'ai' && (
                <div className="flex flex-col gap-4 text-xs">
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1.5">
                      Execution Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded-xl">
                      <button
                        onClick={() => onToggleThinking(false)}
                        className={`py-2 rounded-lg font-medium transition text-center ${
                          !thinkingMode
                            ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <div>Normal Mode (Default)</div>
                        <div className="text-[9px] opacity-75">Direct, instant voice replies</div>
                      </button>
                      <button
                        onClick={() => onToggleThinking(true)}
                        className={`py-2 rounded-lg font-medium transition text-center ${
                          thinkingMode
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <div>Thinking Mode</div>
                        <div className="text-[9px] opacity-75">Deep chain-of-thought analysis</div>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      Local Model GGUF (Ternary-Bonsai-2-9B)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value="E:\Codes\Models\Ternary-Bonsai-2-9B-PQ2_0-MTP-Q8_0.gguf"
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 font-mono text-[11px] text-slate-300"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      Context Length
                    </label>
                    <div className="flex gap-2">
                      {['4096', '8192 (Recommended)', '16384'].map((ctx) => (
                        <span
                          key={ctx}
                          className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                            ctx.includes('8192')
                              ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                              : 'bg-slate-900 border-white/5 text-slate-400'
                          }`}
                        >
                          {ctx}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Voice */}
              {activeTab === 'voice' && (
                <div className="flex flex-col gap-4 text-xs">
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      STT Model (Phonon-2 Local)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value="E:\Codes\Models\model_phonon2_c4c_int6"
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 font-mono text-[11px] text-slate-300"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      TTS Model (Paradee ONNX 24kHz)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value="E:\Codes\Models\models\onnx\paradee.onnx"
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 font-mono text-[11px] text-slate-300"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      Speech Speed (1.0x)
                    </label>
                    <input
                      type="range"
                      min="0.8"
                      max="1.4"
                      step="0.05"
                      defaultValue="1.0"
                      className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    />
                  </div>
                </div>
              )}

              {/* Tab 3: Hotkeys */}
              {activeTab === 'hotkeys' && (
                <div className="flex flex-col gap-3 text-xs">
                  {[
                    { label: 'Smart Dictation (Hold)', shortcut: 'Ctrl + Win' },
                    { label: 'Voice Assistant (Hold)', shortcut: 'Alt + Space' },
                    { label: 'Circle to Ask (Hold)', shortcut: 'Ctrl + Shift' },
                    { label: 'Context Radial Wheel', shortcut: 'Drag + Shift' },
                  ].map((hk) => (
                    <div
                      key={hk.label}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-white/5"
                    >
                      <span className="text-slate-300 font-medium">{hk.label}</span>
                      <kbd className="px-2 py-1 rounded-md bg-white/10 font-mono text-[11px] text-cyan-300 border border-white/10">
                        {hk.shortcut}
                      </kbd>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-white/5 flex justify-end">
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 shadow-lg shadow-cyan-500/20 transition"
              >
                {isSaved ? <Check size={14} /> : <Save size={14} />}
                <span>{isSaved ? 'Saved!' : 'Save & Apply'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
