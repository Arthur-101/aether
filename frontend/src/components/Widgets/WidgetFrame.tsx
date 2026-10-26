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
   * `cozy` swaps the dark glass for the warm media-card surface, `newsprint`
   * paints opaque paper with ink rules, `blueprint` paints a deep drafting
   * grid, and `aura` removes the border in favour of a colour mesh behind the
   * content.
   */
  tone?: 'default' | 'cozy' | 'newsprint' | 'aura' | 'blueprint';
  /** Artwork used as the blurred colour wash behind cozy and aura cards. */
  backdrop?: string | null;
  /** Hides the card itself, leaving only the text and controls. */
  clearSurface?: boolean;
  onTogglePinned: () => void;
  onClose: () => void;
  /** Starts a native window drag. Ignored when the press lands on a control. */
  onDragStart: (event: React.PointerEvent) => void;
  children: React.ReactNode;
}

/**
 * Shared chrome for every popped-out widget: a slim title bar that doubles as
 * the drag handle and the two placement controls.
 *
 * The whole card drags the native window, so the handle is generous. Controls
 * stop the press from reaching the drag handler, and the drag handler also
 * ignores presses that land on a button.
 *
 * Default keeps a reserved header row. The themed surfaces float the header
 * over the content so the card can use its full height. Newsprint, blueprint,
 * and aura already carry their own mastheads, so their floating header is just
 * a hover-revealed control pill in the top-right corner.
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
  const newsprint = tone === 'newsprint';
  const aura = tone === 'aura';
  const blueprint = tone === 'blueprint';
  const floatingHeader = cozy || newsprint || aura || blueprint;
  const minimalHeader = newsprint || aura || blueprint;
  const showCozyBackdrop = cozy && !clearSurface;
  const showAuraBackdrop = aura && !clearSurface;
  const controlClass = `flex h-5 w-5 items-center justify-center ${
    blueprint ? 'rounded-none' : 'rounded-full'
  } text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]`;

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
      className={`glass-panel aether-grain widget-card relative flex h-full w-full flex-col overflow-hidden ${
        cozy ? 'cozy-surface' : ''
      } ${newsprint ? 'newsprint-surface' : ''} ${
        aura ? 'aura-surface' : ''
      } ${blueprint ? 'blueprint-surface' : ''} ${
        alwaysOnTop ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      }`}
    >
      {showCozyBackdrop ? (
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

      {showAuraBackdrop ? (
        <div aria-hidden className="aura-backdrop">
          <div className="aura-mesh" />
          {backdrop ? (
            <div
              className="aura-backdrop-art"
              style={{ backgroundImage: `url("${backdrop}")` }}
            />
          ) : null}
          <div className="aura-wash" />
          <div className="aura-vignette" />
        </div>
      ) : null}

      {/* Header bar — the kind and controls fade in on hover. */}
      <div
        className={`${
          floatingHeader ? 'absolute inset-x-0 top-0 z-20' : 'relative shrink-0'
        } flex items-center gap-1.5 px-2.5 pt-1.5 transition-opacity duration-150 ${
          hovered
            ? 'opacity-100'
            : 'pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100'
        }`}
      >
        {!minimalHeader ? (
          <GripVertical
            size={11}
            className="shrink-0 text-[var(--aether-text-4)]"
            aria-hidden
          />
        ) : null}
        {!minimalHeader ? (
          <span className="truncate text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
            {WIDGET_LABELS[kind]}
          </span>
        ) : null}
        <div
          className={`ml-auto flex shrink-0 items-center gap-0.5 ${
            minimalHeader
              ? `border border-[var(--aether-line)] bg-[var(--aether-fill)] px-1 py-0.5 ${
                  blueprint ? 'rounded-none' : 'rounded-full'
                } ${aura ? 'backdrop-blur-sm' : ''}`
              : ''
          }`}
        >
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
          newsprint || aura || blueprint
            ? 'p-0'
            : cozy
              ? 'px-3 pb-2.5 pt-2'
              : 'px-2.5 pt-1.5 pb-2.5'
        }`}
      >
        {children}
      </div>
    </div>
  );
};
