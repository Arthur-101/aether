import React, { useState } from 'react';
import { GripVertical, Pin, PinOff, X } from 'lucide-react';
import { WIDGET_LABELS, type WidgetKind } from '../../widgets/types';

interface WidgetFrameProps {
  kind: WidgetKind;
  /** `true` while the widget is kept above every other window. */
  alwaysOnTop: boolean;
  /** Corner radius of the card, in pixels. */
  radius: number;
  /**
   * `cozy` swaps the dark glass for the warm media-card surface. The header
   * floats over the content so the artwork can use the full height.
   */
  tone?: 'default' | 'cozy';
  /** Artwork used as the blurred colour wash behind the cozy card. */
  backdrop?: string | null;
  /** Hides the card itself, leaving only the text and controls. */
  clearSurface?: boolean;
  onTogglePinned: () => void;
  onClose: () => void;
  /** Starts a native window drag. Ignored when the press lands on a control. */
  onDragStart: (event: React.PointerEvent) => void;
  children: React.ReactNode;
}

const controlClass =
  'flex h-5 w-5 items-center justify-center rounded-full text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]';

/**
 * Shared chrome for every popped-out widget: one glass card, a slim title bar
 * that doubles as the drag handle, and the two placement controls.
 *
 * The whole card drags the native window, so the handle is generous. Controls
 * stop the press from reaching the drag handler, and the drag handler also
 * ignores presses that land on a button.
 *
 * For every widget the header shows the kind and the placement controls only
 * while the card is hovered, so the content stays the focal point. The cozy
 * media theme floats that header over a full-bleed colour wash.
 */
export const WidgetFrame: React.FC<WidgetFrameProps> = ({
  kind,
  alwaysOnTop,
  radius,
  tone = 'default',
  backdrop = null,
  clearSurface = false,
  onTogglePinned,
  onClose,
  onDragStart,
  children,
}) => {
  const [hovered, setHovered] = useState(false);
  const stop = (event: React.PointerEvent) => event.stopPropagation();
  const cozy = tone === 'cozy';
  const showBackdrop = cozy && !clearSurface;

  return (
    <div
      onPointerDown={onDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-aether-interactive
      data-tone={tone}
      style={{
        borderRadius: radius,
        ...(clearSurface
          ? {
              background: 'transparent',
              borderColor: 'transparent',
              boxShadow: 'none',
            }
          : {}),
      }}
      title={
        alwaysOnTop
          ? 'Drag to move this widget'
          : 'Pinned to the desktop — keep it on top to move it'
      }
      className={`glass-panel aether-grain widget-card flex h-full w-full flex-col overflow-hidden ${
        cozy ? 'cozy-surface' : ''
      } ${alwaysOnTop ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
    >
      {showBackdrop ? (
        <div aria-hidden className="cozy-backdrop">
          {backdrop ? (
            <div
              className="cozy-backdrop-art"
              style={{ backgroundImage: `url("${backdrop}")` }}
            />
          ) : null}
          <div className="cozy-backdrop-wash" />
          <div className="cozy-backdrop-glow" />
          <div className="cozy-backdrop-vignette" />
        </div>
      ) : null}

      {/* Header bar — the kind and controls fade in on hover. */}
      <div
        className={`${
          cozy ? 'absolute inset-x-0 top-0 z-20' : 'relative shrink-0'
        } flex items-center gap-1.5 px-2.5 pt-1.5 transition-opacity duration-150 ${
          hovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <GripVertical size={11} className="shrink-0 text-[var(--aether-text-4)]" aria-hidden />
        <span className="truncate text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
          {WIDGET_LABELS[kind]}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onPointerDown={stop}
            onClick={onTogglePinned}
            aria-pressed={alwaysOnTop}
            aria-label={alwaysOnTop ? 'Keep on top' : 'Pin to desktop'}
            title={
              alwaysOnTop
                ? 'Kept above other windows — click to pin to the desktop'
                : 'Pinned to the desktop — click to keep it above other windows'
            }
            className={`${controlClass} ${
              alwaysOnTop ? 'text-[var(--aether-accent-text)]' : ''
            }`}
          >
            {alwaysOnTop ? <Pin size={11} /> : <PinOff size={11} />}
          </button>
          <button
            type="button"
            onPointerDown={stop}
            onClick={onClose}
            aria-label="Remove widget"
            title="Remove this widget"
            className={controlClass}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div
        className={`relative z-10 flex min-h-0 flex-1 flex-col ${
          cozy ? 'px-3 pb-2.5 pt-2' : 'px-2.5 pt-1.5 pb-2.5'
        }`}
      >
        {children}
      </div>
    </div>
  );
};
