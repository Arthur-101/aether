/**
 * Pure surface-token resolution for the popped-out widgets.
 *
 * `WidgetWindow` owns the state subscription; this module owns the translation
 * from an appearance config plus an aura palette into the CSS variables and
 * frame props, keeping the window component focused on events and state.
 */

import type { AppearanceConfig, WidgetTheme } from '../../types/ipc';
import type { WidgetKind } from '../../widgets/types';
import type { AuraPalette } from './useAuraPalette';

export interface WidgetSurfaceTheme {
  /** Frame tone: default glass, cozy, newsprint, or aura. */
  tone: WidgetTheme;
  /** The surface has been taken to full transparency. */
  clearSurface: boolean;
  /** Text-token overrides that follow the surface ink. */
  textVars: Record<string, string>;
  /** Theme-specific line, fill, paper, and mesh tokens. */
  vars: Record<string, string>;
  /** Artwork/wallpaper painted behind the cozy or aura card. */
  backdrop: string | null;
}

/** The four text tokens every widget surface reads. */
function textVarsFor(color: string): Record<string, string> {
  return {
    '--aether-text-1': color,
    '--aether-text-2': `color-mix(in srgb, ${color} 84%, transparent)`,
    '--aether-text-3': `color-mix(in srgb, ${color} 64%, transparent)`,
    '--aether-text-4': `color-mix(in srgb, ${color} 46%, transparent)`,
  };
}

export function buildWidgetSurfaceTheme(
  appearance: AppearanceConfig,
  palette: AuraPalette,
  kind: WidgetKind,
  mediaArtwork: string | null,
  wallpaper: string | null
): WidgetSurfaceTheme {
  const theme = appearance.widget_theme;
  const clearSurface = appearance.widget_opacity <= 0;
  const textColor = appearance.widget_text_color;
  const cozyTheme = theme === 'cozy';
  const newsprintTheme = theme === 'newsprint';
  const auraTheme = theme === 'aura';
  const newsprintSurface = newsprintTheme && !clearSurface;
  const auraSurface = auraTheme && !clearSurface;
  // At opacity 0 there is no themed wash left, so Auto text follows the desktop
  // theme again instead of the surface ink.
  const cozySurface = cozyTheme && !clearSurface;

  const textVars = textColor
    ? textVarsFor(textColor)
    : newsprintSurface
      ? textVarsFor('#1C1B18')
      : auraSurface
        ? textVarsFor(palette.ink)
        : cozySurface
          ? textVarsFor('#3a2a2c')
          : {};

  const cozyVars: Record<string, string> = cozyTheme
    ? {
        // Decorative waves follow the chosen text colour on a clear surface.
        '--cozy-wave': textColor
          ? `color-mix(in srgb, ${textColor} 62%, transparent)`
          : cozySurface
            ? 'rgba(255, 248, 240, 0.82)'
            : 'var(--aether-text-3)',
        ...(cozySurface
          ? {
              '--aether-line': 'rgba(58, 42, 47, 0.16)',
              '--aether-line-soft': 'rgba(58, 42, 47, 0.1)',
              '--aether-line-strong': 'rgba(58, 42, 47, 0.26)',
              '--aether-fill': 'rgba(255, 255, 255, 0.26)',
              '--aether-fill-2': 'rgba(255, 255, 255, 0.42)',
              '--aether-fill-3': 'rgba(58, 42, 47, 0.14)',
              '--aether-shadow': 'rgba(58, 42, 47, 0.1)',
              '--aether-accent-text':
                'color-mix(in srgb, var(--aether-accent) 48%, #3a2a2c)',
            }
          : {}),
      }
    : {};

  // Paper ink. The CSS surface paints the paper stock; these tokens make the
  // rules, inset fills, and accent text read as print rather than glass.
  const newsprintVars: Record<string, string> = newsprintSurface
    ? {
        '--aether-line': 'rgba(28, 27, 24, 0.2)',
        '--aether-line-soft': 'rgba(28, 27, 24, 0.11)',
        '--aether-line-strong': 'rgba(28, 27, 24, 0.42)',
        '--aether-fill': 'rgba(28, 27, 24, 0.045)',
        '--aether-fill-2': 'rgba(28, 27, 24, 0.085)',
        '--aether-fill-3': 'rgba(28, 27, 24, 0.14)',
        '--aether-shadow': 'rgba(28, 27, 24, 0.08)',
        '--aether-accent-text': `color-mix(in srgb, ${appearance.button_primary} 42%, #1C1B18)`,
      }
    : {};

  // Aura tokens. The mesh colours come from the sampled palette; the scrims and
  // frosted panes flip with the palette's ink so text stays readable on both a
  // dark and a light album cover.
  const lightInk = palette.inkMode === 'light';
  const auraVars: Record<string, string> = auraTheme
    ? {
        '--aura-a': palette.a,
        '--aura-b': palette.b,
        '--aura-c': palette.c,
        '--aura-base': palette.base,
        '--aura-line': clearSurface
          ? 'transparent'
          : lightInk
            ? 'rgba(255, 255, 255, 0.22)'
            : 'rgba(24, 24, 27, 0.14)',
        '--aura-panel': clearSurface
          ? 'transparent'
          : lightInk
            ? 'rgba(255, 255, 255, 0.1)'
            : 'rgba(255, 255, 255, 0.34)',
        '--aura-band': clearSurface
          ? 'transparent'
          : lightInk
            ? 'rgba(255, 255, 255, 0.08)'
            : 'rgba(24, 24, 27, 0.06)',
        '--aura-scrim': clearSurface
          ? 'transparent'
          : lightInk
            ? 'rgba(10, 10, 14, 0.55)'
            : 'rgba(248, 244, 236, 0.62)',
        '--aura-media-scrim': clearSurface
          ? 'transparent'
          : lightInk
            ? 'rgba(10, 10, 14, 0.8)'
            : 'rgba(248, 244, 236, 0.84)',
        '--aether-accent-text': `color-mix(in srgb, ${appearance.button_primary} 55%, ${palette.ink})`,
      }
    : {};

  const backdrop = auraTheme
    ? mediaArtwork ?? wallpaper
    : cozyTheme && kind === 'media'
      ? mediaArtwork
      : null;

  return {
    tone: theme,
    clearSurface,
    textVars,
    vars: { ...cozyVars, ...newsprintVars, ...auraVars },
    backdrop,
  };
}
