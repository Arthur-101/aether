/**
 * Aether Note Themes
 * Per-note CSS token presets. Applied only to the notes pane, never the island.
 */

import swatchApp from '../../assets/note-patterns/swatch-app.svg?url';
import swatchMidnight from '../../assets/note-patterns/swatch-midnight.svg?url';
import swatchMint from '../../assets/note-patterns/swatch-mint.svg?url';
import swatchSakura from '../../assets/note-patterns/swatch-sakura.svg?url';
import swatchSunset from '../../assets/note-patterns/swatch-sunset.svg?url';

export interface NoteTheme {
  id: string;
  label: string;
  swatch: string;
  description: string;
  /** Optional CSS pattern painted onto the theme swatch. */
  pattern?: string;
  patternSize?: string;
}

export const DEFAULT_NOTE_THEME = 'default';

export const NOTE_THEMES: NoteTheme[] = [
  {
    id: 'default',
    label: 'Windows',
    swatch: '#3a3a3a',
    description: 'Fluent',
  },
  {
    id: 'app',
    label: 'App accent',
    swatch: 'var(--aether-accent)',
    description: 'Accent doodles',
    pattern: `url("${swatchApp}")`,
    patternSize: '100% 100%',
  },
  {
    id: 'paper',
    label: 'Paper',
    swatch: '#efe3c8',
    description: 'Ruled paper',
    pattern:
      'repeating-linear-gradient(0deg, rgba(92, 70, 40, 0.32) 0 1px, transparent 1px 4px)',
    patternSize: '100% 4px',
  },
  {
    id: 'mint',
    label: 'Mint',
    swatch: '#c7ecd8',
    description: 'Botanical doodles',
    pattern: `url("${swatchMint}")`,
    patternSize: '100% 100%',
  },
  {
    id: 'sakura',
    label: 'Sakura',
    swatch: '#f8cfdd',
    description: 'Petal doodles',
    pattern: `url("${swatchSakura}")`,
    patternSize: '100% 100%',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    swatch: '#ffd2b3',
    description: 'Sunset doodles',
    pattern: `url("${swatchSunset}")`,
    patternSize: '100% 100%',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    swatch: '#1c2740',
    description: 'Night doodles',
    pattern: `url("${swatchMidnight}")`,
    patternSize: '100% 100%',
  },
  { id: 'doodle', label: 'Doodle', swatch: '#ddccff', description: 'Playful dots' },
  {
    id: 'starlight',
    label: 'Starlight',
    swatch: '#10131c',
    description: 'Dark dotted',
    pattern:
      'radial-gradient(rgba(157, 180, 255, 0.5) 1px, transparent 1px)',
    patternSize: '5px 5px',
  },
  {
    id: 'blueprint',
    label: 'Blueprint',
    swatch: '#eaf4fb',
    description: 'Light grid',
    pattern:
      'linear-gradient(rgba(25, 118, 168, 0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(25, 118, 168, 0.45) 1px, transparent 1px)',
    patternSize: '5px 5px',
  },
  {
    id: 'forest',
    label: 'Forest',
    swatch: '#12211b',
    description: 'Woodland lines',
    pattern:
      'repeating-linear-gradient(135deg, rgba(113, 214, 163, 0.4) 0 1px, transparent 1px 5px)',
    patternSize: '5px 5px',
  },
  {
    id: 'meadow',
    label: 'Meadow',
    swatch: '#cfe3c3',
    description: 'Blurred greens & blooms',
    pattern:
      'radial-gradient(circle at 32% 36%, #f8f1d5 0 1px, rgba(248, 241, 213, 0) 1.7px), radial-gradient(circle at 18% 18%, #a9ce97 0, transparent 55%), radial-gradient(circle at 82% 18%, #4f7d52 0, transparent 52%), radial-gradient(circle at 74% 84%, #7fae6b 0, transparent 52%), radial-gradient(circle at 18% 88%, #5b8a58 0, transparent 55%), linear-gradient(135deg, #f3f8ec, #9fc392)',
    patternSize: '100% 100%',
  },
];

export function resolveNoteTheme(theme?: string): NoteTheme {
  return (
    NOTE_THEMES.find((entry) => entry.id === theme) ??
    NOTE_THEMES.find((entry) => entry.id === DEFAULT_NOTE_THEME) ??
    NOTE_THEMES[0]
  );
}
