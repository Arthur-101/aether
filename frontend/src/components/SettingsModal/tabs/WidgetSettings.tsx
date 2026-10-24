import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  Clock,
  Layers,
  Music2,
  Palette,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import type { AppearanceConfig } from '../../../types/ipc';
import { resolveAppearance } from '../../Island/appearance';
import {
  WIDGET_KINDS,
  WIDGET_LABELS,
  type DesktopWidget,
  type WidgetAppearanceOverrides,
  type WidgetKind,
} from '../../../widgets/types';
import { SliderRow } from './SurfaceSliders';

interface WidgetSettingsProps {
  appearance: AppearanceConfig;
  onChange: (appearance: AppearanceConfig) => void;
  widgets: DesktopWidget[];
  onWidgetAppearanceChange: (id: string, patch: WidgetAppearanceOverrides) => void;
  onResetWidgetAppearance: (id: string) => void;
  onWidgetAlwaysOnTopChange: (id: string, value: boolean) => void;
}

const chipClass = (selected: boolean) =>
  `rounded-full border px-2 py-1 text-[10px] transition ${
    selected
      ? 'border-[var(--aether-line-strong)] bg-[var(--aether-fill-2)] text-[var(--aether-text-1)]'
      : 'border-[var(--aether-line)] text-[var(--aether-text-2)] hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]'
  }`;

const targetRowClass = (selected: boolean) =>
  `flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
    selected
      ? 'bg-[var(--aether-fill-2)] text-[var(--aether-text-1)]'
      : 'text-[var(--aether-text-2)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]'
  }`;

const KindIcon: React.FC<{ kind: DesktopWidget['kind']; size?: number }> = ({
  kind,
  size = 12,
}) => {
  if (kind === 'media') return <Music2 size={size} />;
  if (kind === 'clock') return <Clock size={size} />;
  return <CalendarDays size={size} />;
};

const Switch: React.FC<{
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative h-[18px] w-8 shrink-0 rounded-full transition ${
      checked ? 'bg-[var(--aether-accent)]' : 'bg-[var(--aether-fill-3)]'
    }`}
  >
    <span
      className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition ${
        checked ? 'left-4' : 'left-0.5'
      }`}
    />
  </button>
);

const ToggleRow: React.FC<{
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, description, checked, onChange }) => (
  <div className="flex items-center justify-between gap-3 py-2">
    <span className="min-w-0">
      <span className="block text-[10px] text-[var(--aether-text-2)]">{label}</span>
      <span className="mt-0.5 block text-[9px] leading-snug text-[var(--aether-text-3)]">
        {description}
      </span>
    </span>
    <Switch label={label} checked={checked} onChange={onChange} />
  </div>
);

const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  hint: string;
}> = ({ icon, title, hint }) => (
  <div className="mb-2">
    <div className="flex items-center gap-1.5">
      <span className="accent-text">{icon}</span>
      <h4 className="text-[11px] font-semibold text-[var(--aether-text-1)]">{title}</h4>
    </div>
    <p className="mt-0.5 text-[9px] leading-relaxed text-[var(--aether-text-3)]">{hint}</p>
  </div>
);

const ThemeRow: React.FC<{
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
  preview: React.ReactNode;
}> = ({ label, hint, selected, onClick, preview }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left transition ${
      selected
        ? 'border-[var(--aether-accent)] bg-[var(--aether-fill)]'
        : 'border-[var(--aether-line)] bg-black/15 hover:border-[var(--aether-line-strong)]'
    }`}
  >
    {preview}
    <span className="min-w-0 flex-1">
      <span className="block text-[10.5px] font-medium text-[var(--aether-text-1)]">{label}</span>
      <span className="mt-0.5 block text-[9px] leading-snug text-[var(--aether-text-3)]">
        {hint}
      </span>
    </span>
    <span
      className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${
        selected
          ? 'border-[var(--aether-accent)]'
          : 'border-[var(--aether-line-strong)]'
      }`}
    >
      {selected ? (
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--aether-accent)]" />
      ) : null}
    </span>
  </button>
);

const DefaultThemePreview: React.FC<{ kind?: WidgetKind }> = ({ kind }) => {
  if (kind === 'clock') {
    return (
      <span className="relative block h-7 w-11 shrink-0 overflow-hidden rounded-md border border-[var(--aether-line)] bg-[linear-gradient(145deg,rgba(32,32,36,0.95),rgba(18,18,22,0.95))]">
        <span className="absolute inset-x-0 top-1 text-center font-mono text-[9px] font-semibold leading-none text-[var(--aether-text-1)]">
          12:34
        </span>
        <span className="absolute left-1/2 top-3.5 h-0.5 w-5 -translate-x-1/2 rounded-full bg-[var(--aether-text-4)] opacity-70" />
      </span>
    );
  }
  if (kind === 'date') {
    return (
      <span className="relative block h-7 w-11 shrink-0 overflow-hidden rounded-md border border-[var(--aether-line)] bg-[linear-gradient(145deg,rgba(32,32,36,0.95),rgba(18,18,22,0.95))]">
        <span className="absolute left-1 top-1 h-0.5 w-4 rounded-full bg-[var(--aether-text-3)] opacity-80" />
        <span className="absolute inset-x-1 bottom-1 grid grid-cols-4 gap-[2px]">
          {Array.from({ length: 8 }).map((_, index) => (
            <span
              key={index}
              className={`h-[3px] rounded-[1px] ${
                index === 5
                  ? 'bg-[var(--aether-accent)]'
                  : 'bg-[var(--aether-fill-3)]'
              }`}
            />
          ))}
        </span>
      </span>
    );
  }
  return (
    <span className="relative block h-7 w-11 shrink-0 overflow-hidden rounded-md border border-[var(--aether-line)] bg-[linear-gradient(145deg,rgba(32,32,36,0.95),rgba(18,18,22,0.95))]">
      <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-[2px] bg-[var(--aether-fill-3)]" />
      <span className="absolute left-4 top-1.5 h-0.5 w-5 rounded-full bg-[var(--aether-text-3)] opacity-70" />
      <span className="absolute left-4 top-3 h-0.5 w-3.5 rounded-full bg-[var(--aether-text-4)] opacity-70" />
      <span className="absolute bottom-1 left-1 right-1 h-0.5 rounded-full bg-[var(--aether-fill-3)]">
        <span className="block h-full w-2/3 rounded-full bg-[var(--aether-accent)]" />
      </span>
    </span>
  );
};

const CozyThemePreview: React.FC<{ kind?: WidgetKind }> = ({ kind }) => {
  if (kind === 'clock') {
    return (
      <span className="relative block h-7 w-11 shrink-0 overflow-hidden rounded-md border border-white/45 bg-[linear-gradient(135deg,#f7ddbd_0%,#edb9a6_38%,#cbaecb_68%,#9dbccd_100%)]">
        <span className="absolute inset-x-0 top-1 text-center font-mono text-[9px] font-semibold leading-none text-[#3a2a2c]">
          12:34
        </span>
        <span className="absolute left-1/2 top-3.5 h-1.5 w-5 -translate-x-1/2 rounded-full border border-white/40 bg-white/30" />
      </span>
    );
  }
  if (kind === 'date') {
    return (
      <span className="relative block h-7 w-11 shrink-0 overflow-hidden rounded-md border border-white/45 bg-[linear-gradient(135deg,#f7ddbd_0%,#edb9a6_38%,#cbaecb_68%,#9dbccd_100%)]">
        <span className="absolute left-1 top-1 h-0.5 w-4 rounded-full bg-[#3a2a2c]/40" />
        <span className="absolute inset-x-1 bottom-1 grid grid-cols-4 gap-[2px]">
          {Array.from({ length: 8 }).map((_, index) => (
            <span
              key={index}
              className={`h-[3px] rounded-[1px] ${
                index === 5 ? 'bg-[var(--aether-accent)]' : 'bg-white/35'
              }`}
            />
          ))}
        </span>
      </span>
    );
  }
  return (
    <span className="relative block h-7 w-11 shrink-0 overflow-hidden rounded-md border border-white/45 bg-[linear-gradient(135deg,#f7ddbd_0%,#edb9a6_38%,#cbaecb_68%,#9dbccd_100%)]">
      <svg
        aria-hidden
        viewBox="0 0 30 20"
        className="absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-white/80"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <path d="M-2 7 Q 2 3 6 7 T 14 7 T 22 7 T 30 7" />
        <path d="M-2 13 Q 2 17 6 13 T 14 13 T 22 13 T 30 13" opacity="0.6" />
      </svg>
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-white/45 ring-1 ring-white/70" />
      <svg
        aria-hidden
        viewBox="0 0 30 20"
        className="absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 -scale-x-100 text-white/80"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <path d="M-2 7 Q 2 3 6 7 T 14 7 T 22 7 T 30 7" />
        <path d="M-2 13 Q 2 17 6 13 T 14 13 T 22 13 T 30 13" opacity="0.6" />
      </svg>
    </span>
  );
};

/**
 * Desktop widgets.
 *
 * The popped-out widgets are their own windows, so their surface is styled
 * separately from the notch and the island. The tree at the top picks the
 * shared defaults or one widget; only the sections that apply to that target
 * are shown, so a date widget never offers a clock face or a media theme.
 */
export const WidgetSettings: React.FC<WidgetSettingsProps> = ({
  appearance,
  onChange,
  widgets,
  onWidgetAppearanceChange,
  onResetWidgetAppearance,
  onWidgetAlwaysOnTopChange,
}) => {
  const [selectedId, setSelectedId] = useState('');

  // A removed widget must not leave the picker pointing at nothing.
  useEffect(() => {
    if (selectedId && !widgets.some((widget) => widget.id === selectedId)) {
      setSelectedId('');
    }
  }, [selectedId, widgets]);

  const selected = widgets.find((widget) => widget.id === selectedId) ?? null;
  // Show the tree in the same order as the Controls → Widgets list, not in
  // the order the widgets happened to be added.
  const orderedWidgets = [...widgets].sort(
    (a, b) => WIDGET_KINDS.indexOf(a.kind) - WIDGET_KINDS.indexOf(b.kind)
  );
  const effective = selected
    ? resolveAppearance({ ...appearance, ...selected.appearance })
    : appearance;

  const update = (patch: WidgetAppearanceOverrides) => {
    if (selected) {
      onWidgetAppearanceChange(selected.id, patch);
      return;
    }
    // "All widgets" edits the shared defaults. Existing widgets may already
    // carry a per-widget override for the same key, which would keep shadowing
    // the shared value; write the new value through to every widget as well so
    // the control actually reaches all of them. The global value stays the
    // default for widgets added later.
    onChange({ ...appearance, ...patch } as AppearanceConfig);
    widgets.forEach((widget) => onWidgetAppearanceChange(widget.id, patch));
  };

  const textColor = effective.widget_text_color;
  // Theme and clock-face controls only make sense for one concrete widget, so
  // the shared "All widgets" view stays a clean surface section.
  const showTheme = Boolean(selected);
  const showClockFace = selected?.kind === 'clock';
  const themeTitle =
    selected?.kind === 'date'
      ? 'Calendar theme'
      : selected?.kind === 'clock'
        ? 'Clock theme'
        : 'Media theme';
  const targetLabel = selected ? WIDGET_LABELS[selected.kind] : 'All widgets';

  return (
    <div className="flex flex-col gap-3 pb-2">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="accent-text">
              <Layers size={13} />
            </span>
            <h4 className="text-[11px] font-semibold text-[var(--aether-text-1)]">Widgets</h4>
          </div>
          <span className="text-[9px] text-[var(--aether-text-3)]">
            {widgets.length} on desktop
          </span>
        </div>

        <div className="rounded-xl border border-[var(--aether-line)] bg-black/15 p-1.5">
          <button
            type="button"
            aria-pressed={!selected}
            onClick={() => setSelectedId('')}
            className={targetRowClass(!selected)}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${
                !selected
                  ? 'border-[var(--aether-line-strong)] bg-[var(--aether-fill-2)]'
                  : 'border-transparent bg-[var(--aether-fill)] text-[var(--aether-text-3)]'
              }`}
            >
              <Layers size={12} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium">All widgets</span>
              <span className="block text-[9px] text-[var(--aether-text-3)]">
                Shared defaults
              </span>
            </span>
            {!selected ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--aether-accent)]" />
            ) : null}
          </button>

          <div className="ml-[19px] mt-0.5 space-y-0.5 border-l border-[var(--aether-line)] pl-1.5">
            {orderedWidgets.map((widget) => {
              const active = widget.id === selectedId;
              return (
                <button
                  key={widget.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedId(widget.id)}
                  className={targetRowClass(active)}
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${
                      active
                        ? 'bg-[var(--aether-fill-2)] text-[var(--aether-text-1)]'
                        : 'bg-[var(--aether-fill)] text-[var(--aether-text-3)]'
                    }`}
                  >
                    <KindIcon kind={widget.kind} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10.5px] font-medium">
                      {WIDGET_LABELS[widget.kind]}
                    </span>
                    <span className="block text-[9px] text-[var(--aether-text-3)]">
                      {widget.always_on_top ? 'On top, draggable' : 'Pinned to desktop'}
                    </span>
                  </span>
                  {active ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--aether-accent)]" />
                  ) : null}
                </button>
              );
            })}

            {orderedWidgets.length === 0 ? (
              <p className="px-2 py-1.5 text-[9px] leading-snug text-[var(--aether-text-3)]">
                No widgets yet. Add one from Controls → Widgets.
              </p>
            ) : null}
          </div>

          {selected ? (
            <div className="mt-1 border-t border-[var(--aether-line-soft)] px-1">
              <ToggleRow
                label="Keep on top"
                description="Drag to move. Turn off to pin this widget to the desktop."
                checked={selected.always_on_top}
                onChange={(value) => onWidgetAlwaysOnTopChange(selected.id, value)}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[9px] text-[var(--aether-text-3)]">
            <span className="h-1 w-1 shrink-0 rounded-full bg-[var(--aether-accent)]" />
            {selected ? (
              <span className="truncate">Editing {targetLabel} only</span>
            ) : (
              <span className="truncate">Defaults for every widget</span>
            )}
          </span>
          {selected ? (
            <button
              type="button"
              onClick={() => onResetWidgetAppearance(selected.id)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[9px] text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]"
            >
              <RotateCcw size={10} />
              Reset overrides
            </button>
          ) : null}
        </div>
      </section>

      {showTheme ? (
        <section className="border-t border-[var(--aether-line-soft)] pt-3">
          <SectionHeader
            icon={<Palette size={13} />}
            title={themeTitle}
            hint="Choose the look of this widget."
          />
          <div className="space-y-1.5">
            <ThemeRow
              label="Default glass"
              hint={
                selected?.kind === 'date'
                  ? 'Dark glass calendar with inset grid'
                  : selected?.kind === 'clock'
                    ? 'Dark glass face with a large time'
                    : 'Compact session card with progress and transport'
              }
              selected={effective.widget_theme === 'default'}
              onClick={() => update({ widget_theme: 'default' })}
              preview={<DefaultThemePreview kind={selected?.kind} />}
            />
            <ThemeRow
              label="Cozy glow"
              hint="Warm translucent wash with soft accents"
              selected={effective.widget_theme === 'cozy'}
              onClick={() => update({ widget_theme: 'cozy' })}
              preview={<CozyThemePreview kind={selected?.kind} />}
            />
          </div>
          <p className="mt-1.5 text-[9px] leading-snug text-[var(--aether-text-3)]">
            {selected?.kind === 'media'
              ? 'Cozy drops the timeline and transport. Hover the artwork to play or pause; the waves follow the music and drift at rest.'
              : 'Cozy swaps the dark glass for a warm wash and keeps the same layout and controls.'}
          </p>
        </section>
      ) : null}

      <section className="border-t border-[var(--aether-line-soft)] pt-3">
        <SectionHeader
          icon={<SlidersHorizontal size={13} />}
          title={selected ? `${targetLabel} surface` : 'Widget surface'}
          hint={
            selected
              ? 'Only this widget changes.'
              : 'Shared defaults; text and icons stay readable at any transparency.'
          }
        />

        <div className="divide-y divide-[var(--aether-line-soft)] rounded-xl border border-[var(--aether-line)] bg-black/15 px-2.5 py-0.5">
          <SliderRow
            label="Transparency"
            value={Math.round(effective.widget_opacity * 100)}
            min={0}
            max={100}
            display={`${Math.round(effective.widget_opacity * 100)}%`}
            onChange={(value) => update({ widget_opacity: value / 100 })}
          />
          <SliderRow
            label="Grain"
            value={effective.widget_grain}
            min={0}
            max={100}
            display={`${effective.widget_grain}%`}
            onChange={(widget_grain) => update({ widget_grain })}
          />
          <SliderRow
            label="Corners"
            value={effective.widget_radius}
            min={0}
            max={32}
            display={`${effective.widget_radius}px`}
            onChange={(widget_radius) => update({ widget_radius })}
          />
        </div>

        <div className="mt-2.5">
          <div className="mb-1.5 flex items-center justify-between text-[10px]">
            <span className="text-[var(--aether-text-2)]">Text color</span>
            <span className="font-mono text-[9px] text-[var(--aether-text-3)]">
              {textColor || 'Auto'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => update({ widget_text_color: '' })}
              className={chipClass(!textColor)}
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => update({ widget_text_color: '#ffffff' })}
              className={chipClass(textColor.toLowerCase() === '#ffffff')}
            >
              White
            </button>
            <button
              type="button"
              onClick={() => update({ widget_text_color: '#000000' })}
              className={chipClass(textColor.toLowerCase() === '#000000')}
            >
              Black
            </button>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--aether-line)] px-2 py-1 text-[10px] text-[var(--aether-text-2)] transition hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]">
              <input
                type="color"
                value={textColor || '#ffffff'}
                onChange={(event) => update({ widget_text_color: event.target.value })}
                className="h-3.5 w-3.5 cursor-pointer rounded-full border-0 bg-transparent p-0"
                aria-label="Custom widget text color"
              />
              Custom
            </label>
          </div>
          <p className="mt-1 text-[9px] leading-snug text-[var(--aether-text-3)]">
            Auto follows the theme: white on dark, black on light.
          </p>
        </div>
      </section>

      {showClockFace ? (
        <section className="border-t border-[var(--aether-line-soft)] pt-3">
          <SectionHeader
            icon={<Clock size={13} />}
            title="Clock face"
            hint={
              selected
                ? 'These clock face settings apply to this widget only.'
                : 'Choose what every clock widget shows beside the time.'
            }
          />
          <div className="divide-y divide-[var(--aether-line-soft)] rounded-xl border border-[var(--aether-line)] bg-black/15 px-2.5 py-0.5">
            <ToggleRow
              label="Show seconds"
              description="A small seconds counter sits beside the minutes."
              checked={effective.widget_clock_seconds}
              onChange={(widget_clock_seconds) => update({ widget_clock_seconds })}
            />
            <ToggleRow
              label="Show day and date"
              description="The weekday and date appear under the time."
              checked={effective.widget_clock_daydate}
              onChange={(widget_clock_daydate) => update({ widget_clock_daydate })}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
};
