import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  GripHorizontal,
  Settings,
  Settings2,
  X,
  Cpu,
  Mic,
  Keyboard,
  HardDrive,
  LayoutGrid,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Save,
  Check,
  Wrench,
} from 'lucide-react';
import type {
  AppearanceConfig,
  AppConfig,
  GeneralConfig,
  LocalVoiceState,
  SpotifyAuthState,
  TaskbarAppsConfig,
  TaskbarAppsState,
  ToolGroupsState,
} from '../../types/ipc';
import type {
  DesktopWidget,
  WidgetAppearanceOverrides,
} from '../../widgets/types';
import { resolveAppearance, resolveTaskbarApps } from '../Island/appearance';
import { AiSettings } from './tabs/AiSettings';
import { AppearanceSettings } from './tabs/AppearanceSettings';
import { GeneralSettings } from './tabs/GeneralSettings';
import { VoiceSettings } from './tabs/VoiceSettings';
import { HotkeySettings } from './tabs/HotkeySettings';
import { StorageSettings } from './tabs/StorageSettings';
import { WidgetSettings } from './tabs/WidgetSettings';
import { IntegrationsSettings } from './tabs/IntegrationsSettings';
import { ToolsSettings } from './tabs/ToolsSettings';
import { GuideSettings } from './tabs/GuideSettings';
import { useSettingsDrag } from './useSettingsDrag';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface SettingsModalProps {
  isOpen: boolean;
  thinkingMode: boolean;
  config: AppConfig | null;
  configError: string | null;
  spotifyAuth: SpotifyAuthState;
  toolGroups: ToolGroupsState | null;
  localVoices: LocalVoiceState | null;
  notesDirectory: string;
  onToggleThinking: (enabled: boolean) => void;
  onSave: (config: AppConfig) => void;
  onHotkeyCapture: (enabled: boolean) => void;
  onOpenNotesFolder: (path: string) => void;
  onSpotifyConnect: (clientId: string) => void;
  onSpotifyDisconnect: () => void;
  onSpotifyRefresh: () => void;
  onRefreshToolGroups: () => void;
  onRefreshLocalVoices: () => void;
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
  | 'general'
  | 'ai'
  | 'tools'
  | 'voice'
  | 'hotkeys'
  | 'storage'
  | 'appearance'
  | 'widgets'
  | 'integrations'
  | 'guide';
type Tab = SettingsTab;

const tabs = [
  { id: 'general' as const, label: 'General', icon: Settings2 },
  { id: 'ai' as const, label: 'AI & Models', icon: Cpu },
  { id: 'voice' as const, label: 'Voice Engine', icon: Mic },
  { id: 'storage' as const, label: 'Storage & Files', icon: HardDrive },
  { id: 'appearance' as const, label: 'Appearance', icon: Palette },
  { id: 'widgets' as const, label: 'Widgets', icon: LayoutGrid },
  { id: 'hotkeys' as const, label: 'Hotkeys', icon: Keyboard },
  { id: 'tools' as const, label: 'Tools', icon: Wrench },
  { id: 'integrations' as const, label: 'Integrations', icon: Plug },
  { id: 'guide' as const, label: 'Guide', icon: BookOpen },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  thinkingMode,
  config,
  configError,
  spotifyAuth,
  toolGroups,
  localVoices,
  notesDirectory,
  onToggleThinking,
  onSave,
  onHotkeyCapture,
  onOpenNotesFolder,
  onSpotifyConnect,
  onSpotifyDisconnect,
  onSpotifyRefresh,
  onRefreshToolGroups,
  onRefreshLocalVoices,
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
  const [recordingHotkey, setRecordingHotkey] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { offset, dragHandleProps } = useSettingsDrag(isOpen);

  useFocusTrap(isOpen, panelRef, {
    // The shortcut recorder owns Escape and Tab while it is listening.
    suspended: recordingHotkey,
    onEscape: onClose,
    restoreFocus: () =>
      document.querySelector<HTMLElement>('[data-aether-island-trigger]') ??
      document.querySelector<HTMLElement>('[data-aether-settings-trigger]'),
  });

  const handleHotkeyCapture = useCallback(
    (enabled: boolean) => {
      setRecordingHotkey(enabled);
      onHotkeyCapture(enabled);
    },
    [onHotkeyCapture]
  );

  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const key = event.key;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;
    event.preventDefault();

    const nextIndex =
      key === 'Home'
        ? 0
        : key === 'End'
          ? tabs.length - 1
          : key === 'ArrowUp'
            ? (index - 1 + tabs.length) % tabs.length
            : (index + 1) % tabs.length;

    setActiveTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

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

  useEffect(() => {
    if (isOpen && activeTab === 'voice') onRefreshLocalVoices();
  }, [isOpen, activeTab, onRefreshLocalVoices]);

  const updateGeneral = (patch: Partial<GeneralConfig>) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            general: {
              start_on_startup: false,
              show_tray_icon: true,
              ...prev.general,
              ...patch,
            },
          }
        : prev
    );
  };

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

  const updateSpotifyClientId = (client_id: string) => {
    setDraft((prev) =>
      prev ? { ...prev, spotify: { ...prev.spotify, client_id } } : prev
    );
  };

  const updateTools = (tools: NonNullable<AppConfig['tools']>) => {
    setDraft((prev) => (prev ? { ...prev, tools } : prev));
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
            ref={panelRef}
            data-aether-interactive
            data-aether-settings-panel
            role="dialog"
            aria-modal="true"
            aria-label="Aether settings"
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            style={{
              '--glass-alpha': settingsSurface.island_opacity,
              '--aether-grain': settingsSurface.island_grain,
              '--aether-pop': settingsSurface.island_pop,
            } as React.CSSProperties}
            className="aether-interactive glass-panel aether-grain aether-pop relative flex h-[520px] w-[620px] overflow-hidden rounded-xl shadow-2xl"
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
              <div
                role="tablist"
                aria-label="Settings sections"
                aria-orientation="vertical"
                className="flex flex-col gap-1 text-xs"
              >
                {tabs.map((item, index) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      ref={(node) => {
                        tabRefs.current[index] = node;
                      }}
                      type="button"
                      role="tab"
                      id={`aether-settings-tab-${item.id}`}
                      aria-selected={active}
                      aria-controls="aether-settings-panel"
                      tabIndex={active ? 0 : -1}
                      onClick={() => setActiveTab(item.id)}
                      onKeyDown={(event) => handleTabKeyDown(event, index)}
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

          <div
            role="tabpanel"
            id="aether-settings-panel"
            aria-labelledby={`aether-settings-tab-${activeTab}`}
            className="flex min-h-0 min-w-0 flex-1 flex-col p-5"
          >
            <div
              className={`min-h-0 min-w-0 flex-1 pr-1 ${
                activeTab === 'guide'
                  ? 'flex flex-col overflow-hidden'
                  : 'overflow-x-hidden overflow-y-auto'
              }`}
            >
              <div
                {...dragHandleProps}
                className="mb-4 flex cursor-grab items-center justify-between border-b border-[var(--aether-line)] pb-3 active:cursor-grabbing"
                title="Drag to move Settings"
              >
                <h4 className="text-sm font-semibold text-[var(--aether-text-1)]">
                  {activeTab === 'general' && 'General & Desktop'}
                  {activeTab === 'ai' && 'AI Engine & Inference'}
                  {activeTab === 'tools' && 'Assistant Tool Loadout'}
                  {activeTab === 'voice' && 'Voice Pipeline'}
                  {activeTab === 'hotkeys' && 'Global System Hotkeys'}
                  {activeTab === 'storage' && 'Output & Session Storage'}
                  {activeTab === 'appearance' && 'Notch Appearance'}
                  {activeTab === 'widgets' && 'Desktop Widgets'}
                  {activeTab === 'integrations' && 'Integrations'}
                  {activeTab === 'guide' && 'Aether Guide'}
                </h4>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close settings"
                  title="Close settings"
                  className="rounded-md p-1 text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
                >
                  <X size={16} />
                </button>
              </div>

              {activeTab === 'guide' ? (
                <GuideSettings />
              ) : !draft ? (
                <div className="py-16 text-center text-xs text-[var(--aether-text-3)]">
                  Waiting for the Aether daemon…
                </div>
              ) : (
                <>
                  {activeTab === 'general' && (
                    <GeneralSettings
                      general={
                        draft.general ?? {
                          start_on_startup: false,
                          show_tray_icon: true,
                        }
                      }
                      onChange={updateGeneral}
                    />
                  )}
                  {activeTab === 'ai' && (
                    <AiSettings
                      ai={draft.ai_provider}
                      thinkingMode={thinkingMode}
                      configError={configError}
                      onToggleThinking={handleToggleThinking}
                      onChange={updateAi}
                    />
                  )}
                  {activeTab === 'tools' && (
                    <ToolsSettings
                      enabledGroups={
                        draft.tools?.enabled_groups ??
                        toolGroups?.groups.map((group) => group.id) ??
                        []
                      }
                      disabledTools={draft.tools?.disabled_tools ?? []}
                      state={toolGroups}
                      onChange={updateTools}
                      onRefresh={onRefreshToolGroups}
                    />
                  )}
                  {activeTab === 'voice' && (
                    <VoiceSettings
                      voice={draft.voice}
                      ai={draft.ai_provider}
                      localVoices={localVoices}
                      onChange={updateVoice}
                    />
                  )}
                  {activeTab === 'hotkeys' && (
                    <HotkeySettings
                      hotkeys={draft.hotkeys}
                      onChange={updateHotkeys}
                      onRecordingChange={handleHotkeyCapture}
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
                  {activeTab === 'integrations' && (
                    <IntegrationsSettings
                      clientId={draft.spotify?.client_id ?? ''}
                      auth={spotifyAuth}
                      onClientIdChange={updateSpotifyClientId}
                      onConnect={onSpotifyConnect}
                      onDisconnect={onSpotifyDisconnect}
                      onRefresh={onSpotifyRefresh}
                      tavilyKey={draft.ai_provider.tavily_api_key ?? ''}
                      onTavilyKeyChange={(value) =>
                        updateAi({ tavily_api_key: value })
                      }
                    />
                  )}
                </>
              )}
            </div>

            <div
              className={`mt-4 flex justify-end border-t border-[var(--aether-line)] pt-3 ${
                activeTab === 'guide' ? 'hidden' : ''
              }`}
            >
              <button
                type="button"
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
