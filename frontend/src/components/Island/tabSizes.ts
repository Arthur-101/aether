import type { DashboardTabId } from '../../types/ipc';

/**
 * Island sizing.
 *
 * The shell no longer uses one fixed size for every tab. Each tab declares
 * the width its layout wants, and the height is measured from the content
 * that actually rendered, so a sparse tab does not open a cavernous panel.
 */

export const TAB_WIDTH: Record<DashboardTabId, number> = {
  controls: 1050,
  chat: 820,
  clock: 940,
  stats: 1120,
  notes: 1020,
  wallpaper: 720,
  power: 640,
};

export const MIN_ISLAND_WIDTH = 420;
export const MAX_ISLAND_WIDTH = 1280;

/** Fixed chrome heights, in pixels. */
export const HEADER_HEIGHT = 64;
export const TABS_HEIGHT = 54;
/** The shell's own 1px border, top and bottom. */
export const SHELL_BORDER = 2;

/** Padding around the scrolling tab body. */
export const CONTENT_PADDING = 40;

export const MIN_ISLAND_HEIGHT = 260;

/**
 * Height of the Clock & Tasks body.
 *
 * The tab is laid out for more content than fits, so the window keeps this
 * height and the body scrolls instead of the island growing.
 */
export const CLOCK_HEIGHT = 513;

/**
 * Height of the Controls grid.
 *
 * The three panels share one row of a fixed height, so the device list and
 * the radio flyouts scroll inside their panels instead of stretching the
 * island. The spare room goes to the Widgets card.
 */
export const CONTROLS_HEIGHT = 470;

/**
 * Height of the Stats body.
 *
 * The gauges get a fixed row and the three cards below share the rest, so the
 * tab does not grow a little every time a process changes its RAM usage.
 */
export const STATS_HEIGHT = 470;
