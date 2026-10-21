import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GripHorizontal,
  Settings,
  X,
  Cpu,
  Mic,
  Keyboard,
  HardDrive,
  Palette,
  Save,
  Check,
} from 'lucide-react';
import type { AppearanceConfig, AppConfig } from '../../types/ipc';
import { resolveAppearance, resolveTaskbarApps } from '../Island/appearance';
import { AiSettings } from './tabs/AiSettings';
import { AppearanceSettings } from './tabs/AppearanceSettings';
import { VoiceSettings } from './tabs/VoiceSettings';
import { HotkeySettings } from './tabs/HotkeySettings';
import { StorageSettings } from './tabs/StorageSettings';
import { useSettingsDrag } from './useSettingsDrag';

interface SettingsModalProps {
  isOpen: boolean;
  thinkingMode: boolean;
  config: AppConfig | null;
  configError: string | null;
  notesDirectory: string;
  onToggleThinking: (enabled: boolean) => void;
  onSave: (config: AppConfig) => void;
  onHotkeyCapture: (enabled: boolean) => void;
  onOpenNotesFolder: (path: string) => void;
  onClose: () => void;
}

type Tab = 'ai' | 'voice' | 'hotkeys' | 'storage' | 'appearance';

const tabs = [
  { id: 'ai' as const, label: 'AI & Models', icon: Cpu },
  { id: 'voice' as const, label: 'Voice Engine', icon: Mic },
  { id: 'hotkeys' as const, label: 'Hotkeys', icon: Keyboard },
  { id: 'storage' as const, label: 'Storage & Files', icon: HardDrive },
  { id: 'appearance' as const, label: 'Appearance', icon: Palette },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  thinkingMode,
  config,
  configError,
  notesDirectory,
  onToggleThinking,
  onSave,
  onHotkeyCapture,
  onOpenNotesFolder,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('ai');
  const [draft, setDraft] = useState<AppConfig | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const { offset, dragHandleProps } = useSettingsDrag(isOpen);

  useEffect(() => {
    if (isOpen && config) setDraft(structuredClone(config));
  }, [isOpen, config]);

  const updateAi = (patch: Partial<AppConfig['ai_provider']>) => {
    setDraft((prev) =>
      prev ? { ...prev, ai_provider: { ...prev.ai_provider, ...patch } } : prev
    );
  };

  const updateVoice = (patch: Partial<AppConfig['voice']>) => {
    setDraft((prev) => (prev ? { ...prev, voice: { ...prev.voice, ...patch } } : prev));
  };

  const updateHotkeys = (patch: Partial<AppConfig['hotkeys']>) => {
    setDraft((prev) =>
      prev ? { ...prev, hotkeys: { ...prev.hotkeys, ...patch } } : prev
    );
  };

  const updateStorage = (storage: NonNullable<AppConfig['storage']>) => {
    setDraft((prev) => (prev ? { ...prev, storage } : prev));
  };

  const updateAppearance = (appearance: AppearanceConfig) => {
    setDraft((prev) => (prev ? { ...prev, appearance } : prev));
  };

  const handleToggleThinking = (enabled: boolean) => {
    onToggleThinking(enabled);
    updateAi({ thinking_mode: enabled });
  };

  const handleSave = () => {
    if (!draft) return;
    onSave(draft);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 550);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="pointer-events-none fixed inset-0 z-[60] flex items-start justify-center pt-3">
        <div
          style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
        >
          <motion.div
            data-aether-interactive
            data-aether-settings-panel
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            className="aether-interactive glass-panel flex h-[520px] w-[620px] overflow-hidden rounded-xl shadow-2xl"
          >
          <div className="flex w-44 flex-col justify-between border-r border-white/10 bg-[#202020] p-4">
            <div>
              <div
                {...dragHandleProps}
                className="mb-6 flex cursor-grab items-center gap-2 active:cursor-grabbing"
                title="Drag to move Settings"
              >
                <Settings size={18} className="text-[#60cdff]" />
                <h3 className="text-sm font-semibold text-white">Settings</h3>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                {tabs.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-left transition ${
                        activeTab === item.id
                          ? 'border border-white/10 bg-[#383838] font-medium text-white'
                          : 'text-[#8b8b8b] hover:bg-white/5 hover:text-[#f3f3f3]'
                      }`}
                    >
                      <Icon size={14} className={activeTab === item.id ? 'text-[#60cdff]' : ''} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div
              {...dragHandleProps}
              className="flex cursor-grab items-center gap-1.5 font-mono text-[10px] text-[#6f6f6f] active:cursor-grabbing"
              title="Drag to move Settings"
            >
              <GripHorizontal size={12} />
              Aether v0.1.0 · Local-first
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-5">
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div
                {...dragHandleProps}
                className="mb-4 flex cursor-grab items-center justify-between border-b border-white/10 pb-3 active:cursor-grabbing"
                title="Drag to move Settings"
              >
                <h4 className="text-sm font-semibold text-white">
                  {activeTab === 'ai' && 'AI Engine & Inference'}
                  {activeTab === 'voice' && 'Voice Pipeline'}
                  {activeTab === 'hotkeys' && 'Global System Hotkeys'}
                  {activeTab === 'storage' && 'Output & Session Storage'}
                  {activeTab === 'appearance' && 'Notch Appearance'}
                </h4>
                <button
                  onClick={onClose}
                  className="rounded-md p-1 text-[#8b8b8b] transition hover:bg-white/5 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              {!draft ? (
                <div className="py-16 text-center text-xs text-[#8b8b8b]">
                  Waiting for the Aether daemon…
                </div>
              ) : (
                <>
                  {activeTab === 'ai' && (
                    <AiSettings
                      ai={draft.ai_provider}
                      thinkingMode={thinkingMode}
                      configError={configError}
                      onToggleThinking={handleToggleThinking}
                      onChange={updateAi}
                    />
                  )}
                  {activeTab === 'voice' && (
                    <VoiceSettings voice={draft.voice} onChange={updateVoice} />
                  )}
                  {activeTab === 'hotkeys' && (
                    <HotkeySettings
                      hotkeys={draft.hotkeys}
                      onChange={updateHotkeys}
                      onRecordingChange={onHotkeyCapture}
                    />
                  )}
                  {activeTab === 'storage' && (
                    <StorageSettings
                      storage={draft.storage ?? {}}
                      resolvedNotesDirectory={notesDirectory}
                      onChange={updateStorage}
                      onOpenNotesFolder={onOpenNotesFolder}
                    />
                  )}
                  {activeTab === 'appearance' && (
                    <AppearanceSettings
                      appearance={resolveAppearance(draft.appearance)}
                      taskbarApps={resolveTaskbarApps(draft.taskbar_apps)}
                      onChange={updateAppearance}
                    />
                  )}
                </>
              )}
            </div>

            <div className="mt-4 flex justify-end border-t border-white/10 pt-3">
              <button
                onClick={handleSave}
                disabled={!draft}
                className="flex items-center gap-1.5 rounded-md bg-[#0067c0] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1976c9] disabled:opacity-40"
              >
                {isSaved ? <Check size={14} /> : <Save size={14} />}
                <span>{isSaved ? 'Saved!' : 'Save & Apply'}</span>
              </button>
            </div>
          </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
};
