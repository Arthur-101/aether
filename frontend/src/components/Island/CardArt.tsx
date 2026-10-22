import React from 'react';

/**
 * Background motifs for the Island cards.
 *
 * The weather card carries a full illustration, so the rest of the cards
 * would look bare without something. These are quiet drawings, and every
 * one is a complete shape that sits inside the card, so it reads as a
 * motif rather than a stray fragment.
 */

export type CardArtVariant =
  | 'dial'
  | 'sweep'
  | 'pulse'
  | 'flow'
  | 'spark'
  | 'rings';

interface CardArtProps {
  variant: CardArtVariant;
  className?: string;
}

const TICKS = Array.from({ length: 12 }, (_, index) => index * 30);

const Spark: React.FC<{ x: number; y: number; r: number; opacity: number }> = ({
  x,
  y,
  r,
  opacity,
}) => (
  <path
    d={`M ${x} ${y - r} Q ${x + r * 0.16} ${y - r * 0.16} ${x + r} ${y} Q ${x + r * 0.16} ${y + r * 0.16} ${x} ${y + r} Q ${x - r * 0.16} ${y + r * 0.16} ${x - r} ${y} Q ${x - r * 0.16} ${y - r * 0.16} ${x} ${y - r} Z`}
    fill="var(--aether-accent)"
    fillOpacity={opacity}
  />
);

export const CardArt: React.FC<CardArtProps> = ({ variant, className = '' }) => {
  const gradientId = `card-art-${variant}`;

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id={gradientId} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="var(--aether-accent)" stopOpacity="0.28" />
          <stop offset="70%" stopColor="var(--aether-accent)" stopOpacity="0.04" />
          <stop offset="100%" stopColor="var(--aether-accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {variant === 'dial' ? (
        <g fill="none" stroke="var(--aether-accent)" strokeLinecap="round">
          <circle cx="100" cy="100" r="92" fill={`url(#${gradientId})`} stroke="none" />
          <circle cx="100" cy="100" r="84" strokeOpacity="0.3" strokeWidth="1.5" />
          <circle cx="100" cy="100" r="66" strokeOpacity="0.16" strokeWidth="1.2" />
          {TICKS.map((angle) => {
            const radian = (angle * Math.PI) / 180;
            const inner = angle % 90 === 0 ? 72 : 78;
            return (
              <line
                key={angle}
                x1={100 + inner * Math.cos(radian)}
                y1={100 + inner * Math.sin(radian)}
                x2={100 + 83 * Math.cos(radian)}
                y2={100 + 83 * Math.sin(radian)}
                strokeOpacity={angle % 90 === 0 ? 0.44 : 0.24}
                strokeWidth={angle % 90 === 0 ? 2.4 : 1.4}
              />
            );
          })}
          {/* Minute hand, then the second hand over it. */}
          <path d="M 100 100 L 129 150" strokeOpacity="0.5" strokeWidth="3.2" />
          <path d="M 100 108 L 100 172" strokeOpacity="0.85" strokeWidth="1.8" />
          <circle cx="100" cy="100" r="4" fill="var(--aether-accent)" fillOpacity="0.7" stroke="none" />
        </g>
      ) : null}

      {variant === 'sweep' ? (
        <g fill="none" stroke="var(--aether-accent)" strokeLinecap="round">
          <circle cx="100" cy="100" r="92" fill={`url(#${gradientId})`} stroke="none" />
          <circle cx="100" cy="100" r="84" strokeOpacity="0.26" strokeWidth="1.5" />
          <path d="M 100 16 A 84 84 0 0 1 160 56" strokeOpacity="0.6" strokeWidth="4" />
          <path d="M 100 34 A 66 66 0 0 1 145 65" strokeOpacity="0.34" strokeWidth="3" />
          <path d="M 100 100 L 100 34" strokeOpacity="0.42" strokeWidth="2" />
          <circle
            cx="100"
            cy="100"
            r="3.5"
            fill="var(--aether-accent)"
            fillOpacity="0.55"
            stroke="none"
          />
        </g>
      ) : null}

      {variant === 'pulse' ? (
        <g fill="none" stroke="var(--aether-accent)" strokeLinecap="round">
          <circle cx="100" cy="170" r="92" fill={`url(#${gradientId})`} stroke="none" />
          {[36, 60, 84].map((radius, index) => (
            <path
              key={radius}
              d={`M ${100 - radius} 170 A ${radius} ${radius} 0 0 1 ${100 + radius} 170`}
              strokeOpacity={0.34 - index * 0.07}
              strokeWidth={3.2 - index * 0.5}
            />
          ))}
          <circle cx="100" cy="170" r="4" fill="var(--aether-accent)" fillOpacity="0.4" stroke="none" />
        </g>
      ) : null}

      {variant === 'rings' ? (
        <g fill="none" stroke="var(--aether-accent)" strokeLinecap="round">
          <circle cx="100" cy="100" r="92" fill={`url(#${gradientId})`} stroke="none" />
          <circle cx="100" cy="100" r="84" strokeOpacity="0.22" strokeWidth="1.5" />
          <circle cx="100" cy="100" r="58" strokeOpacity="0.18" strokeWidth="1.5" />
          <circle cx="100" cy="100" r="32" strokeOpacity="0.15" strokeWidth="1.5" />
          <path d="M 100 16 A 84 84 0 0 1 160 40" strokeOpacity="0.46" strokeWidth="3" />
          <path d="M 100 42 A 58 58 0 0 1 142 60" strokeOpacity="0.3" strokeWidth="2.2" />
          <circle cx="100" cy="100" r="4" fill="var(--aether-accent)" fillOpacity="0.4" stroke="none" />
        </g>
      ) : null}

      {variant === 'flow' ? (
        <g fill="none" stroke="var(--aether-accent)" strokeLinecap="round">
          <circle cx="100" cy="100" r="92" fill={`url(#${gradientId})`} stroke="none" />
          <path d="M 46 44 V 156" strokeOpacity="0.26" strokeWidth="1.6" />
          {[
            [46, 56, 30],
            [46, 84, 22],
            [46, 112, 34],
            [46, 140, 20],
          ].map(([x, y, length], index) => (
            <g key={y} strokeOpacity={0.34 - index * 0.04} strokeWidth="2.6">
              <circle cx={x} cy={y} r="4.5" fill="var(--aether-accent)" fillOpacity="0.16" />
              <path d={`M ${x + 12} ${y} H ${x + 12 + length}`} />
            </g>
          ))}
        </g>
      ) : null}

      {variant === 'spark' ? (
        <g>
          <circle cx="100" cy="100" r="92" fill={`url(#${gradientId})`} />
          <Spark x={74} y={66} r={26} opacity={0.22} />
          <Spark x={132} y={104} r={16} opacity={0.17} />
          <Spark x={96} y={142} r={11} opacity={0.15} />
          <circle cx="150" cy="56" r="3" fill="var(--aether-accent)" fillOpacity="0.22" />
          <circle cx="44" cy="120" r="2.4" fill="var(--aether-accent)" fillOpacity="0.17" />
        </g>
      ) : null}
    </svg>
  );
};

