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
  LayoutGrid,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Check,
} from 'lucide-react';
import type {
  AppearanceConfig,
  AppConfig,
  TaskbarAppsConfig,
  TaskbarAppsState,
} from '../../types/ipc';
import type {
  DesktopWidget,
  WidgetAppearanceOverrides,
} from '../../widgets/types';
import { resolveAppearance, resolveTaskbarApps } from '../Island/appearance';
import { AiSettings } from './tabs/AiSettings';
import { AppearanceSettings } from './tabs/AppearanceSettings';
import { VoiceSettings } from './tabs/VoiceSettings';
import { HotkeySettings } from './tabs/HotkeySettings';
import { StorageSettings } from './tabs/StorageSettings';
import { WidgetSettings } from './tabs/WidgetSettings';
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
  taskbarState: TaskbarAppsState | null;
  widgets: DesktopWidget[];
  onWidgetAppearanceChange: (id: string, patch: WidgetAppearanceOverrides) => void;
  onResetWidgetAppearance: (id: string) => void;
  onWidgetAlwaysOnTopChange: (id: string, value: boolean) => void;
  initialTab?: SettingsTab | null;
  onRefreshTaskbar: () => void;
  onPreviewAppearance?: (appearance: AppearanceConfig | null) => void;
  onClose: () => void;
}

export type SettingsTab =
  | 'ai'
  | 'voice'
  | 'hotkeys'
  | 'storage'
  | 'appearance'
  | 'widgets';
type Tab = SettingsTab;

const tabs = [
  { id: 'ai' as const, label: 'AI & Models', icon: Cpu },
  { id: 'voice' as const, label: 'Voice Engine', icon: Mic },
  { id: 'hotkeys' as const, label: 'Hotkeys', icon: Keyboard },
  { id: 'storage' as const, label: 'Storage & Files', icon: HardDrive },
  { id: 'appearance' as const, label: 'Appearance', icon: Palette },
  { id: 'widgets' as const, label: 'Widgets', icon: LayoutGrid },
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
  taskbarState,
  widgets,
  onWidgetAppearanceChange,
  onResetWidgetAppearance,
  onWidgetAlwaysOnTopChange,
  initialTab,
  onRefreshTaskbar,
  onPreviewAppearance,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('ai');
  const [draft, setDraft] = useState<AppConfig | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { offset, dragHandleProps } = useSettingsDrag(isOpen);

  useEffect(() => {
    if (isOpen && config) setDraft(structuredClone(config));
  }, [isOpen, config]);

  useEffect(() => {
    // Closing without saving restores the live surfaces.
    if (!isOpen) onPreviewAppearance?.(null);
  }, [isOpen, onPreviewAppearance]);

  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (isOpen && activeTab === 'appearance') onRefreshTaskbar();
  }, [isOpen, activeTab, onRefreshTaskbar]);

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
    // Live preview: the pill and island follow the draft while dragging.
    onPreviewAppearance?.(appearance);
  };

  const updateBrandName = (brand_name: string) => {
    setDraft((prev) => (prev ? { ...prev, brand_name } : prev));
  };

  const updateTaskbarApps = (taskbar_apps: TaskbarAppsConfig) => {
    setDraft((prev) => (prev ? { ...prev, taskbar_apps } : prev));
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
      onPreviewAppearance?.(null);
      onClose();
    }, 550);
  };

  const settingsSurface = resolveAppearance((draft ?? config)?.appearance);

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
            style={{
              '--glass-alpha': settingsSurface.island_opacity,
              '--aether-grain': settingsSurface.island_grain,
              '--aether-pop': settingsSurface.island_pop,
            } as React.CSSProperties}
            className="aether-interactive glass-panel aether-grain aether-pop flex h-[520px] w-[620px] overflow-hidden rounded-xl shadow-2xl"
          >
          <div
            className={`settings-sidebar flex shrink-0 flex-col justify-between border-r border-[var(--aether-line)] transition-all duration-200 ${
              sidebarCollapsed ? 'w-14 p-2' : 'w-44 p-4'
            }`}
          >
            <div>
              <div
                {...dragHandleProps}
                className={`mb-5 flex cursor-grab items-center active:cursor-grabbing ${
                  sidebarCollapsed ? 'flex-col gap-2' : 'gap-2'
                }`}
                title="Drag to move Settings"
              >
                <Settings size={18} className="shrink-0 text-[var(--aether-accent-text)]" />
                {!sidebarCollapsed ? (
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--aether-text-1)]">
                    Settings
                  </h3>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((value) => !value)}
                  aria-label={
                    sidebarCollapsed
                      ? 'Expand settings sidebar'
                      : 'Collapse settings sidebar'
                  }
                  aria-expanded={!sidebarCollapsed}
                  title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  className={`rounded-md p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)] ${
                    sidebarCollapsed ? '' : 'ml-auto'
                  }`}
                >
                  {sidebarCollapsed ? (
                    <PanelLeftOpen size={14} />
                  ) : (
                    <PanelLeftClose size={14} />
                  )}
                </button>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                {tabs.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      aria-label={item.label}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={`flex items-center rounded-md transition ${
                        sidebarCollapsed
                          ? 'justify-center px-0 py-2.5'
                          : 'gap-2 px-3 py-2 text-left'
                      } ${
                        active
                          ? 'border border-[var(--aether-line)] bg-[var(--aether-surface-5)] font-medium text-[var(--aether-text-1)]'
                          : 'text-[var(--aether-text-3)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]'
                      }`}
                    >
                      <Icon
                        size={14}
                        className={`shrink-0 ${
                          active ? 'text-[var(--aether-accent-text)]' : ''
                        }`}
                      />
                      {!sidebarCollapsed ? (
                        <span className="truncate">{item.label}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div
              {...dragHandleProps}
              className={`flex cursor-grab items-center font-mono text-[10px] text-[var(--aether-text-3)] active:cursor-grabbing ${
                sidebarCollapsed ? 'justify-center' : 'gap-1.5'
              }`}
              title="Drag to move Settings"
            >
              <GripHorizontal size={12} className="shrink-0" />
              {!sidebarCollapsed ? (
                <span className="truncate">Aether v0.1.0 · Local-first</span>
              ) : null}
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-5">
            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
              <div
                {...dragHandleProps}
                className="mb-4 flex cursor-grab items-center justify-between border-b border-[var(--aether-line)] pb-3 active:cursor-grabbing"
                title="Drag to move Settings"
              >
                <h4 className="text-sm font-semibold text-[var(--aether-text-1)]">
                  {activeTab === 'ai' && 'AI Engine & Inference'}
                  {activeTab === 'voice' && 'Voice Pipeline'}
                  {activeTab === 'hotkeys' && 'Global System Hotkeys'}
                  {activeTab === 'storage' && 'Output & Session Storage'}
                  {activeTab === 'appearance' && 'Notch Appearance'}
                  {activeTab === 'widgets' && 'Desktop Widgets'}
                </h4>
                <button
                  onClick={onClose}
                  className="rounded-md p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
                >
                  <X size={16} />
                </button>
              </div>

              {!draft ? (
                <div className="py-16 text-center text-xs text-[var(--aether-text-3)]">
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
                      brandName={draft.brand_name ?? 'Aether'}
                      onBrandNameChange={updateBrandName}
                      taskbarApps={resolveTaskbarApps(draft.taskbar_apps)}
                      taskbarState={taskbarState}
                      onChange={updateAppearance}
                      onTaskbarChange={updateTaskbarApps}
                      onRefreshTaskbar={onRefreshTaskbar}
                    />
                  )}
                  {activeTab === 'widgets' && (
                    <WidgetSettings
                      appearance={resolveAppearance(draft.appearance)}
                      onChange={updateAppearance}
                      widgets={widgets}
                      onWidgetAppearanceChange={onWidgetAppearanceChange}
                      onResetWidgetAppearance={onResetWidgetAppearance}
                      onWidgetAlwaysOnTopChange={onWidgetAlwaysOnTopChange}
                    />
                  )}
                </>
              )}
            </div>

            <div className="mt-4 flex justify-end border-t border-[var(--aether-line)] pt-3">
              <button
                onClick={handleSave}
                disabled={!draft}
                className="accent-fill flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold transition disabled:opacity-40"
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
