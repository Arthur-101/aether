import React from 'react';
import {
  WHEEL_INNER_RADIUS,
  WHEEL_RADIUS,
  WHEEL_SIZE,
  sliceKind,
} from './geometry';

interface RadialWheelCanvasProps {
  slices: string[];
  highlightedIndex: number | null;
  coreHighlighted: boolean;
  onActivate: (slice: string) => void;
  onCoreActivate: () => void;
  onHover: (index: number | null) => void;
  onCoreHover: (hovered: boolean) => void;
}

export const RadialWheelCanvas: React.FC<RadialWheelCanvasProps> = ({
  slices,
  highlightedIndex,
  coreHighlighted,
  onActivate,
  onCoreActivate,
  onHover,
  onCoreHover,
}) => {
  const center = WHEEL_SIZE / 2;
  const angleStep = (2 * Math.PI) / slices.length;

  return (
    <svg
      width={WHEEL_SIZE}
      height={WHEEL_SIZE}
      viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
      className="drop-shadow-2xl"
    >
      <circle
        cx={center}
        cy={center}
        r={WHEEL_RADIUS}
        fill="rgb(var(--aether-glass-rgb) / 0.94)"
        stroke="var(--aether-line-strong)"
        strokeWidth="1.5"
      />

      {slices.map((slice, index) => {
        const startAngle = index * angleStep;
        const endAngle = (index + 1) * angleStep;
        const isHovered = highlightedIndex === index;
        const x1 = center + WHEEL_RADIUS * Math.cos(startAngle);
        const y1 = center + WHEEL_RADIUS * Math.sin(startAngle);
        const x2 = center + WHEEL_RADIUS * Math.cos(endAngle);
        const y2 = center + WHEEL_RADIUS * Math.sin(endAngle);
        const ix1 = center + WHEEL_INNER_RADIUS * Math.cos(endAngle);
        const iy1 = center + WHEEL_INNER_RADIUS * Math.sin(endAngle);
        const ix2 = center + WHEEL_INNER_RADIUS * Math.cos(startAngle);
        const iy2 = center + WHEEL_INNER_RADIUS * Math.sin(startAngle);
        const midAngle = (startAngle + endAngle) / 2;
        const textRadius = (WHEEL_RADIUS + WHEEL_INNER_RADIUS) / 2;
        const textX = center + textRadius * Math.cos(midAngle);
        const textY = center + textRadius * Math.sin(midAngle) + 4;
        const pathD = `M ${ix2} ${iy2} L ${x1} ${y1} A ${WHEEL_RADIUS} ${WHEEL_RADIUS} 0 0 1 ${x2} ${y2} L ${ix1} ${iy1} A ${WHEEL_INNER_RADIUS} ${WHEEL_INNER_RADIUS} 0 0 0 ${ix2} ${iy2} Z`;
        const wedgeTransform = isHovered
          ? `translate(${center} ${center}) scale(1.06) translate(-${center} -${center})`
          : undefined;
        // Conversions, edits, and Ask AI each get their own tint so the three
        // groups read as arcs around the ring instead of one flat colour.
        const kind = sliceKind(slice);
        const fill = isHovered
          ? 'url(#activeSliceGradient)'
          : kind === 'ask'
            ? 'var(--aether-accent)'
            : kind === 'utility'
              ? '#60a5fa'
              : '#ffffff';
        const fillOpacity = isHovered
          ? 1
          : kind === 'ask'
            ? 0.2
            : kind === 'utility'
              ? 0.12
              : 0.05;
        const stroke = isHovered
          ? '#FFFFFF'
          : kind === 'ask'
            ? 'var(--aether-accent)'
            : kind === 'utility'
              ? '#60a5fa'
              : 'rgba(255, 255, 255, 0.12)';
        const strokeOpacity = isHovered ? 1 : kind === 'ask' ? 0.5 : kind === 'utility' ? 0.32 : 1;

        return (
          <g
            key={slice}
            onClick={() => onActivate(slice)}
            onMouseEnter={() => onHover(index)}
            onMouseLeave={() => onHover(null)}
            className="cursor-pointer"
          >
            <g transform={wedgeTransform}>
              <path
                d={pathD}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={stroke}
                strokeOpacity={strokeOpacity}
                strokeWidth={isHovered ? '2' : '1.5'}
              />
              <text
                x={textX}
                y={textY}
                textAnchor="middle"
                fill={isHovered ? '#FFFFFF' : kind === 'ask' ? 'var(--aether-accent-text)' : '#C7C7C7'}
                fontSize={isHovered ? '11.5' : '10.5'}
                fontWeight={isHovered ? '700' : '600'}
                className="pointer-events-none select-none font-sans"
              >
                {slice === 'ASK' ? 'ASK AI' : slice}
              </text>
            </g>
          </g>
        );
      })}

      <defs>
        <linearGradient id="activeSliceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--aether-accent)" />
          <stop offset="100%" stopColor="var(--aether-accent-secondary)" />
        </linearGradient>
      </defs>

      <circle
        cx={center}
        cy={center}
        r={WHEEL_INNER_RADIUS - 4}
        fill={coreHighlighted ? 'var(--aether-accent)' : 'var(--aether-surface-3)'}
        stroke={coreHighlighted ? '#FFFFFF' : 'var(--aether-accent-text)'}
        strokeWidth={coreHighlighted ? '2' : '1.5'}
        onClick={onCoreActivate}
        onMouseEnter={() => onCoreHover(true)}
        onMouseLeave={() => onCoreHover(false)}
        className="cursor-pointer transition-colors"
      />
    </svg>
  );
};
