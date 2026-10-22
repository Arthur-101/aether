import React from 'react';

interface AetherMarkProps {
  size?: number;
  className?: string;
}

/**
 * Compact Aether emblem for the header. The full app icon carries its own
 * squircle and island pill; the header mark crops to the radial wheel so it
 * reads at small sizes. Every shape uses currentColor, so the mark follows the
 * active theme accent.
 */
export const AetherMark: React.FC<AetherMarkProps> = ({
  size = 32,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="80 92 352 352"
    fill="none"
    aria-hidden
    className={className}
  >
    <circle
      cx="256"
      cy="268"
      r="148"
      stroke="currentColor"
      strokeOpacity="0.38"
      strokeWidth="28"
      strokeDasharray="98 18.2"
      strokeLinecap="round"
      transform="rotate(-15 256 268)"
    />
    <path
      d="M 294 125 A 148 148 0 0 1 388 201"
      stroke="currentColor"
      strokeWidth="30"
      strokeLinecap="round"
    />
    <circle
      cx="256"
      cy="268"
      r="98"
      stroke="currentColor"
      strokeOpacity="0.8"
      strokeWidth="6"
      strokeDasharray="180 40 80 30"
      strokeLinecap="round"
    />

    <circle
      cx="256"
      cy="268"
      r="72"
      fill="currentColor"
      fillOpacity="0.06"
      stroke="currentColor"
      strokeOpacity="0.25"
      strokeWidth="6"
    />
    <g fill="currentColor" fillOpacity="0.92">
      <rect x="204" y="254" width="10" height="28" rx="5" />
      <rect x="226" y="236" width="10" height="64" rx="5" />
      <rect x="276" y="242" width="10" height="52" rx="5" />
      <rect x="298" y="256" width="10" height="24" rx="5" />
    </g>
    <rect
      x="250"
      y="218"
      width="12"
      height="100"
      rx="6"
      fill="currentColor"
      fillOpacity="0.9"
    />
  </svg>
);
