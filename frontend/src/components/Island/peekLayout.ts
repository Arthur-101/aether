/**
 * Layout math for the hover peek (the second pill state that shows apps).
 *
 * The peek grows with the number of apps instead of scrolling. Icon size stays
 * constant; only the spacing between icons tightens, and only when the deck
 * would otherwise run off the screen.
 */

export const ICON_WIDTH = 28;
/**
 * Icon spacing. The mockup stores the deck as overlapping cards, so a step
 * below the icon width makes each tile cover part of the one behind it.
 */
export const ICON_STEP = 18;
export const MIN_STEP = 14;
export const EDGE_INSET = 16;
export const CLOCK_WIDTH = 150;
export const CLOCK_GAP = 6;

export interface PeekLayout {
  /** Total width the shell should animate to. */
  width: number;
  /** Spacing between neighbouring icons. */
  step: number;
  /** How many apps sit to the left of the clock. */
  leftCount: number;
  /** How many apps sit to the right of the clock. */
  rightCount: number;
}

/** Width one deck needs for `count` icons at the given step. */
export function deckWidthFor(count: number, step: number): number {
  if (count <= 0) return 0;
  return ICON_WIDTH + (count - 1) * step;
}

export function computePeekLayout(
  appCount: number,
  viewportWidth: number
): PeekLayout {
  const leftCount = Math.ceil(appCount / 2);
  const rightCount = Math.floor(appCount / 2);
  const maxSide = Math.max(leftCount, rightCount);

  // Fixed chrome: outer insets, the clock, and the gaps around it.
  const chrome = EDGE_INSET * 2 + CLOCK_WIDTH + CLOCK_GAP * 2;

  let step = ICON_STEP;
  let deckWidth = deckWidthFor(maxSide, step);
  let width = chrome + deckWidth * 2;

  const maxWidth = Math.max(320, viewportWidth - 24);
  if (width > maxWidth && maxSide > 1) {
    // Only tighten the spacing when the deck would overflow the screen.
    const perSide = (maxWidth - chrome) / 2;
    step = Math.max(
      MIN_STEP,
      Math.min(step, (perSide - ICON_WIDTH) / (maxSide - 1))
    );
    deckWidth = deckWidthFor(maxSide, step);
    width = chrome + deckWidth * 2;
  }

  return {
    width: Math.min(width, maxWidth),
    step,
    leftCount,
    rightCount,
  };
}
