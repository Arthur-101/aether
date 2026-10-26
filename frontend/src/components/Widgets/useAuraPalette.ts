/**
 * Colour extraction for the aura widget theme.
 *
 * Widget windows receive the current artwork (or the desktop wallpaper when
 * nothing is playing) as a data URI. Drawing that into a tiny canvas is cheap
 * and same-origin, so the palette can be sampled without a backend round-trip.
 * The result is cached by source hash because the widget state is broadcast on
 * every media position tick; only a real artwork change should re-sample.
 */

import { useEffect, useMemo, useState } from 'react';

export interface AuraPalette {
  a: string;
  b: string;
  c: string;
  /** Neutral base the three mesh colours are painted over. */
  base: string;
  /** Text/icon colour chosen for the base luminance. */
  ink: string;
  inkMode: 'light' | 'dark';
}

/** Used when there is no artwork, no wallpaper, or the image cannot be read. */
export const AURA_FALLBACK: AuraPalette = {
  a: '#7C6CF2',
  b: '#E887B0',
  c: '#5FC7BE',
  base: '#171821',
  ink: '#F7F4EE',
  inkMode: 'light',
};

const CACHE_LIMIT = 24;
const cache = new Map<string, AuraPalette>();

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

interface Candidate extends Rgb {
  count: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function hashSource(source: string): string {
  // FNV-1a over the full string. Data URIs are a few hundred kilobytes at
  // most, and this only runs when the artwork changes.
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${source.length}:${(hash >>> 0).toString(36)}`;
}

function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((part) => part + part)
          .join('')
      : value;
  const number = Number.parseInt(full, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const part = (value: number) =>
    Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function mix(first: Rgb, second: Rgb, amount: number): Rgb {
  return {
    r: first.r + (second.r - first.r) * amount,
    g: first.g + (second.g - first.g) * amount,
    b: first.b + (second.b - first.b) * amount,
  };
}

function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }
  hue = (hue * 60 + 360) % 360;
  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const primary = ((h % 360) / 60) % 6;
  const x = chroma * (1 - Math.abs((primary % 2) - 1));
  const offset = l - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (primary < 1) [red, green] = [chroma, x];
  else if (primary < 2) [red, green] = [x, chroma];
  else if (primary < 3) [green, blue] = [chroma, x];
  else if (primary < 4) [green, blue] = [x, chroma];
  else if (primary < 5) [red, blue] = [x, chroma];
  else [red, blue] = [chroma, x];
  return {
    r: (red + offset) * 255,
    g: (green + offset) * 255,
    b: (blue + offset) * 255,
  };
}

function distance(first: Rgb, second: Rgb): number {
  const red = first.r - second.r;
  const green = first.g - second.g;
  const blue = first.b - second.b;
  return Math.sqrt(red * red + green * green + blue * blue);
}

/**
 * Keeps a sampled colour usable as a full-card wash: very dark art would
 * otherwise produce a black mesh and very light art a washed-out one.
 */
function tuneColour(colour: Rgb): Rgb {
  const hsl = rgbToHsl(colour);
  return hslToRgb({
    h: hsl.h,
    s: clamp(hsl.s, 0.04, 0.66),
    l: clamp(hsl.l, 0.3, 0.64),
  });
}

function pickCandidates(pixels: Uint8ClampedArray): Candidate[] {
  const buckets = new Map<number, Candidate>();

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const current = buckets.get(key);
    if (current) {
      current.r += r;
      current.g += g;
      current.b += b;
      current.count += 1;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({
      r: bucket.r / bucket.count,
      g: bucket.g / bucket.count,
      b: bucket.b / bucket.count,
      count: bucket.count,
    }))
    .sort((first, second) => second.count - first.count);
}

function choosePalette(pixels: Uint8ClampedArray): AuraPalette {
  const candidates = pickCandidates(pixels);
  if (!candidates.length) return AURA_FALLBACK;

  const colourful = candidates.filter((candidate) => {
    const hsl = rgbToHsl(candidate);
    return hsl.s > 0.12 && hsl.l > 0.06 && hsl.l < 0.94;
  });
  const pool = colourful.length ? colourful : candidates;

  // The first colour is the dominant readable hue. The next two are chosen for
  // distance from everything already picked so the mesh is not three clones.
  const first = pool.reduce((best, candidate) => {
    const score = (candidate: Candidate) =>
      Math.log2(candidate.count + 1) *
      (0.35 + rgbToHsl(candidate).s);
    return score(candidate) > score(best) ? candidate : best;
  }, pool[0]);

  let second = candidates[0];
  let secondScore = -1;
  for (const candidate of pool) {
    const score = distance(candidate, first);
    if (score > secondScore) {
      second = candidate;
      secondScore = score;
    }
  }

  let third = candidates[0];
  let thirdScore = -1;
  for (const candidate of pool) {
    const score = Math.min(
      distance(candidate, first),
      distance(candidate, second)
    );
    if (score > thirdScore) {
      third = candidate;
      thirdScore = score;
    }
  }

  const a = rgbToHex(tuneColour(first));
  const b = rgbToHex(tuneColour(second));
  const c = rgbToHex(tuneColour(third));

  const average = {
    r: (first.r + second.r + third.r) / 3,
    g: (first.g + second.g + third.g) / 3,
    b: (first.b + second.b + third.b) / 3,
  };
  const averageLum = luminance(average);
  const lightArt = averageLum > 0.52;
  const base = rgbToHex(
    mix(average, hexToRgb(lightArt ? '#F6F1E8' : '#121218'), 0.76)
  );
  const baseLum = luminance(hexToRgb(base));
  const inkMode: AuraPalette['inkMode'] = baseLum > 0.52 ? 'dark' : 'light';

  return {
    a,
    b,
    c,
    base,
    ink: inkMode === 'dark' ? '#18181B' : '#F7F4EE',
    inkMode,
  };
}

async function extractPalette(source: string): Promise<AuraPalette> {
  const image = new Image();
  image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not decode artwork'));
    image.src = source;
  });

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d', { willReadFrequently: false });
  if (!context) return AURA_FALLBACK;
  context.drawImage(image, 0, 0, 32, 32);
  return choosePalette(context.getImageData(0, 0, 32, 32).data);
}

/**
 * Returns a palette for the supplied artwork/wallpaper data URI. Re-samples
 * only when the source changes; the last resolved palette stays visible while
 * the next one decodes, which avoids a flash on track changes.
 */
export function useAuraPalette(source: string | null): AuraPalette {
  const key = useMemo(() => (source ? hashSource(source) : ''), [source]);
  const [resolved, setResolved] = useState<{
    key: string;
    palette: AuraPalette;
  } | null>(() => {
    if (!key) return null;
    const cached = cache.get(key);
    return cached ? { key, palette: cached } : null;
  });

  // A cache hit or a change back to "no source" is available during render, so
  // only an uncached image ever needs the asynchronous effect below.
  const cached = key ? cache.get(key) : undefined;
  const palette = cached ?? (key ? resolved?.palette ?? AURA_FALLBACK : AURA_FALLBACK);

  useEffect(() => {
    if (!source || cache.has(key)) return;

    let cancelled = false;
    void extractPalette(source)
      .then((next) => {
        if (cancelled) return;
        cache.set(key, next);
        if (cache.size > CACHE_LIMIT) {
          const oldest = cache.keys().next().value;
          if (oldest) cache.delete(oldest);
        }
        setResolved({ key, palette: next });
      })
      .catch(() => {
        if (!cancelled) setResolved({ key, palette: AURA_FALLBACK });
      });

    return () => {
      cancelled = true;
    };
  }, [key, source]);

  return palette;
}
