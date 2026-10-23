import React from 'react';

/**
 * A small illustrated scene for the weather card.
 *
 * The condition drives the picture, and the time of day drives the sky, so
 * a clear afternoon and a clear night do not look the same. The scene is
 * drawn wide because the card is: it fills the card and is cropped, not
 * letterboxed.
 */

export type WeatherScene =
  | 'clear'
  | 'partly'
  | 'cloudy'
  | 'rain'
  | 'snow'
  | 'thunder'
  | 'fog';

export function sceneFor(icon?: string, condition?: string): WeatherScene {
  const text = `${icon ?? ''} ${condition ?? ''}`.toLowerCase();
  if (text.includes('thunder')) return 'thunder';
  if (text.includes('snow') || text.includes('sleet')) return 'snow';
  if (text.includes('rain') || text.includes('drizzle') || text.includes('shower')) {
    return 'rain';
  }
  if (text.includes('fog') || text.includes('mist') || text.includes('haze')) {
    return 'fog';
  }
  // "Partly cloudy" keeps the sun or moon, so it gets its own scene.
  if (text.includes('partly') || text.includes('cloud-sun')) return 'partly';
  if (text.includes('cloud') || text.includes('overcast')) return 'cloudy';
  return 'clear';
}

export function isDaytime(now: Date): boolean {
  const hour = now.getHours();
  return hour >= 6 && hour < 19;
}

const SKY_DAY = ['#3d5a80', '#7596bd'];
const SKY_NIGHT = ['#141a2e', '#2b3559'];
const SKY_STORM = ['#232a3c', '#3c4560'];
const SKY_OVERCAST = ['#4a5568', '#6b7688'];
const SKY_OVERCAST_NIGHT = ['#1b2130', '#2e3648'];

interface WeatherArtProps {
  scene: WeatherScene;
  isDay: boolean;
  className?: string;
  /** Fills the box, cropping the scene instead of letterboxing it. */
  cover?: boolean;
}

const Cloud: React.FC<{ x: number; y: number; scale?: number; opacity?: number }> = ({
  x,
  y,
  scale = 1,
  opacity = 1,
}) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
    <ellipse cx="18" cy="14" rx="20" ry="11" fill="#e8eef7" />
    <ellipse cx="32" cy="12" rx="15" ry="9" fill="#f3f7fc" />
    <ellipse cx="6" cy="15" rx="13" ry="8" fill="#dbe4f0" />
    <rect x="0" y="12" width="42" height="12" rx="6" fill="#e8eef7" />
  </g>
);

export const WeatherArt: React.FC<WeatherArtProps> = ({
  scene,
  isDay,
  className = '',
  cover = false,
}) => {
  const stormy = scene === 'thunder' || scene === 'rain';
  const overcast = scene === 'cloudy';
  const sky = overcast
    ? isDay
      ? SKY_OVERCAST
      : SKY_OVERCAST_NIGHT
    : stormy
      ? SKY_STORM
      : isDay
        ? SKY_DAY
        : SKY_NIGHT;
  const gradientId = `weather-sky-${scene}-${isDay ? 'day' : 'night'}`;
  const sunId = `weather-sun-${scene}-${isDay ? 'day' : 'night'}`;
  const moonId = `weather-moon-${scene}-${isDay ? 'day' : 'night'}`;
  const sunX = 194;
  const sunY = 30;
  // Eight rays at 45° intervals, drawn from the same inner/outer radius so
  // every ray points straight out from the sun. Hard-coded diagonals used to
  // leave the bottom two tangent to the disc, which read as stray strokes.
  const sunRays = Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI) / 4;
    return {
      x1: sunX + Math.cos(angle) * 17,
      y1: sunY + Math.sin(angle) * 17,
      x2: sunX + Math.cos(angle) * 22.5,
      y2: sunY + Math.sin(angle) * 22.5,
    };
  });

  return (
    <svg
      viewBox="0 0 240 120"
      preserveAspectRatio={cover ? 'xMidYMid slice' : 'xMidYMid meet'}
      className={className}
      role="img"
      aria-label={`${scene} ${isDay ? 'day' : 'night'}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor={sky[0]} />
          <stop offset="100%" stopColor={sky[1]} />
        </linearGradient>
        <radialGradient id={sunId} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffe9a8" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#ffd166" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#ffd166" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={moonId} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#dfe6ff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#dfe6ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="240" height="120" fill={`url(#${gradientId})`} />

      {/* The card crops a slice of this wide scene, so the artwork is nudged
          left to keep the sun, moons, and weather clear of the right edge. */}
      <g transform="translate(-16 0)">
        {/* Overcast hides the sun or moon behind the cloud deck. */}
      {overcast ? null : isDay ? (        <>
          <circle cx={sunX} cy={sunY} r="24" fill={`url(#${sunId})`} />
          <circle cx={sunX} cy={sunY} r="9" fill="#ffe9a8" />
          <g stroke="#ffe9a8" strokeWidth="1.6" strokeLinecap="round" opacity="0.65">
            {sunRays.map((ray, index) => (
              <line key={index} {...ray} />
            ))}
          </g>
        </>
      ) : (
        <>
          <circle cx={sunX} cy={sunY} r="20" fill={`url(#${moonId})`} />
          <path
            d={`M ${sunX + 6} ${sunY - 10} A 12 12 0 1 0 ${sunX + 6} ${sunY + 10} A 9.5 9.5 0 1 1 ${sunX + 6} ${sunY - 10} Z`}
            fill="#f4f2e4"
          />
          {[
            [30, 22, 1.3],
            [62, 14, 0.9],
            [98, 26, 1],
            [134, 16, 0.8],
            [44, 48, 1],
            [118, 46, 0.9],
            [84, 10, 0.7],
            [160, 32, 0.8],
            [22, 62, 0.8],
            [76, 62, 0.7],
            [142, 60, 0.9],
          ].map(([x, y, r], index) => (
            <circle
              key={index}
              cx={x}
              cy={y}
              r={r}
              fill="#e8ecff"
              opacity={0.4 + (index % 3) * 0.2}
            />
          ))}
        </>
      )}

      {scene === 'cloudy' ? (
        <>
          <Cloud x={150} y={26} scale={1.25} />
          <Cloud x={86} y={58} scale={0.95} opacity={0.92} />
        </>
      ) : null}

      {scene === 'partly' ? (
        <>
          <Cloud x={120} y={46} scale={0.95} opacity={0.95} />
          <Cloud x={156} y={62} scale={0.7} opacity={0.85} />
        </>
      ) : null}

      {scene === 'fog' ? (
        <>
          <Cloud x={150} y={30} scale={1.05} opacity={0.9} />
          <g stroke="#dbe4f0" strokeWidth="4" strokeLinecap="round" opacity="0.7">
            <path d="M 118 80 H 226" />
            <path d="M 140 94 H 204" />
          </g>
        </>
      ) : null}

      {scene === 'rain' ? (
        <>
          <Cloud x={144} y={28} scale={1.15} />
          <g stroke="#bcd4f0" strokeWidth="2.2" strokeLinecap="round" opacity="0.85">
            <path d="M 158 74 L 153 92" />
            <path d="M 174 76 L 169 94" />
            <path d="M 190 74 L 185 92" />
            <path d="M 206 76 L 201 94" />
            <path d="M 222 74 L 217 90" />
          </g>
        </>
      ) : null}

      {scene === 'snow' ? (
        <>
          <Cloud x={144} y={28} scale={1.15} />
          <g fill="#eef4ff" opacity="0.9">
            {[
              [156, 86, 2.2],
              [174, 94, 1.7],
              [192, 84, 2],
              [210, 96, 1.9],
              [226, 88, 2.2],
            ].map(([x, y, r], index) => (
              <circle key={index} cx={x} cy={y} r={r} />
            ))}
          </g>
        </>
      ) : null}

      {scene === 'thunder' ? (
        <>
          <Cloud x={144} y={26} scale={1.15} opacity={0.95} />
          <path d="M 168 62 L 154 88 H 164 L 156 110 L 180 78 H 168 Z" fill="#ffd166" />
        </>
      ) : null}
      </g>
    </svg>
  );
};
