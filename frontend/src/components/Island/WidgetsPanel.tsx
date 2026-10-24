import React from 'react';
import {
  CalendarDays,
  Check,
  Clock3,
  LayoutGrid,
  Music2,
  Pin,
  PinOff,
  Plus,
  X,
} from 'lucide-react';
import type { DesktopWidget, WidgetKind } from '../../widgets/types';
import {
  WIDGET_DESCRIPTIONS,
  WIDGET_KINDS,
  WIDGET_LABELS,
} from '../../widgets/types';
import { ControlPanel, PanelFooterRow } from './ControlPanel';

interface WidgetsPanelProps {
  /** Widgets currently pinned to the desktop. */
  widgets: DesktopWidget[];
  onAddWidget: (kind: WidgetKind) => void;
  onRemoveWidget: (id: string) => void;
  onToggleWidgetOnTop: (id: string, value: boolean) => void;
}

const KIND_ICONS: Record<WidgetKind, React.ReactNode> = {
  media: <Music2 size={14} />,
  clock: <Clock3 size={14} />,
  date: <CalendarDays size={14} />,
};

/**
 * Widgets.
 *
 * The picking surface for the desktop widgets. Each kind can be added once or
 * many times, and every pinned widget keeps its own placement: **on top** stays
 * above other windows, while a desktop pin lets the user's windows cover it.
 */
export const WidgetsPanel: React.FC<WidgetsPanelProps> = ({
  widgets,
  onAddWidget,
  onRemoveWidget,
  onToggleWidgetOnTop,
}) => (
  <ControlPanel
    label="Widgets"
    icon={<LayoutGrid size={14} className="text-[var(--aether-accent-text)]" />}
    className="min-h-0 flex-1"
    scroll
    footer={
      <PanelFooterRow
        left="Pin to desktop or keep on top"
        right={widgets.length === 1 ? '1 widget' : `${widgets.length} widgets`}
      />
    }
  >
    <div className="flex shrink-0 flex-col gap-1">
      {WIDGET_KINDS.map((kind) => {
        // One widget of each kind lives on the desktop. The button turns into a
        // "already there" marker instead of adding a second copy.
        const placed = widgets.some((widget) => widget.kind === kind);
        return (
          <div
            key={kind}
            className="flex items-center gap-2 rounded-lg border border-[var(--aether-line-soft)] bg-[var(--aether-fill)] px-2 py-1.5"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--aether-fill-2)] text-[var(--aether-accent-text)]">
              {KIND_ICONS[kind]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10px] font-semibold text-[var(--aether-text-1)]">
                {WIDGET_LABELS[kind]}
              </span>
              <span className="block truncate text-[8.5px] text-[var(--aether-text-3)]">
                {placed ? 'Already on the desktop' : WIDGET_DESCRIPTIONS[kind]}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onAddWidget(kind)}
              disabled={placed}
              aria-label={
                placed
                  ? `${WIDGET_LABELS[kind]} is already on the desktop`
                  : `Add ${WIDGET_LABELS[kind]} to the desktop`
              }
              title={
                placed
                  ? `${WIDGET_LABELS[kind]} is already on the desktop — remove it below to add it again`
                  : `Add ${WIDGET_LABELS[kind]} to the desktop`
              }
              className={`accent-fill flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition ${
                placed ? 'cursor-default opacity-45' : 'hover:brightness-110'
              }`}
            >
              {placed ? <Check size={13} /> : <Plus size={13} />}
            </button>
          </div>
        );
      })}
    </div>

    {widgets.length ? (
      <div className="mt-2 flex flex-col gap-0.5">
        {widgets.map((widget) => (
          <div
            key={widget.id}
            className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition hover:bg-[var(--aether-fill)]"
          >
            <span className="shrink-0 text-[var(--aether-text-3)]">
              {KIND_ICONS[widget.kind]}
            </span>
            <span className="min-w-0 flex-1 truncate text-[9.5px] text-[var(--aether-text-2)]">
              {WIDGET_LABELS[widget.kind]}
            </span>
            <button
              type="button"
              onClick={() =>
                onToggleWidgetOnTop(widget.id, !widget.always_on_top)
              }
              aria-pressed={widget.always_on_top}
              aria-label={
                widget.always_on_top ? 'Keep on top' : 'Pin to desktop'
              }
              title={
                widget.always_on_top
                  ? 'Kept above other windows — click to pin to the desktop'
                  : 'Pinned to the desktop — click to keep it above other windows'
              }
              className={`flex h-5 w-5 items-center justify-center rounded-full transition hover:bg-[var(--aether-fill-2)] ${
                widget.always_on_top
                  ? 'text-[var(--aether-accent-text)]'
                  : 'text-[var(--aether-text-3)]'
              }`}
            >
              {widget.always_on_top ? <Pin size={11} /> : <PinOff size={11} />}
            </button>
            <button
              type="button"
              onClick={() => onRemoveWidget(widget.id)}
              aria-label="Remove widget"
              title="Remove this widget"
              className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    ) : (
      <p className="mt-2 shrink-0 text-[9px] leading-relaxed text-[var(--aether-text-3)]">
        Nothing pinned yet. Add a widget and drag it anywhere on the desktop.
      </p>
    )}
  </ControlPanel>
);
