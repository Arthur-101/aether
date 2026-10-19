import React from 'react';
import {
  WHEEL_INNER_RADIUS,
  WHEEL_RADIUS,
  WHEEL_SIZE,
} from './geometry';

interface RadialWheelCanvasProps {
  slices: string[];
  ring: 'format' | 'utility';
  highlightedIndex: number | null;
  coreHighlighted: boolean;
  onActivate: (slice: string) => void;
  onCoreActivate: () => void;
  onHover: (index: number | null) => void;
  onCoreHover: (hovered: boolean) => void;
}

export const RadialWheelCanvas: React.FC<RadialWheelCanvasProps> = ({
  slices,
  ring,
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
        fill="rgba(32, 32, 32, 0.94)"
        stroke="rgba(255,255,255,0.14)"
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

        return (
          <g
            key={`${ring}-${slice}`}
            onClick={() => onActivate(slice)}
            onMouseEnter={() => onHover(index)}
            onMouseLeave={() => onHover(null)}
            className="cursor-pointer"
          >
            <g transform={wedgeTransform}>
              <path
                d={pathD}
                fill={isHovered ? 'url(#activeSliceGradient)' : 'rgba(255, 255, 255, 0.06)'}
                stroke={isHovered ? '#FFFFFF' : 'rgba(255, 255, 255, 0.12)'}
                strokeWidth={isHovered ? '2' : '1.5'}
              />
              <text
                x={textX}
                y={textY}
                textAnchor="middle"
                fill={isHovered ? '#FFFFFF' : '#C7C7C7'}
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
          <stop offset="0%" stopColor="#0067C0" />
          <stop offset="100%" stopColor="#005A9E" />
        </linearGradient>
      </defs>

      <circle
        cx={center}
        cy={center}
        r={WHEEL_INNER_RADIUS - 4}
        fill={coreHighlighted ? '#0067C0' : '#202020'}
        stroke={coreHighlighted ? '#FFFFFF' : 'rgba(96, 205, 255, 0.45)'}
        strokeWidth={coreHighlighted ? '2' : '1.5'}
        onClick={onCoreActivate}
        onMouseEnter={() => onCoreHover(true)}
        onMouseLeave={() => onCoreHover(false)}
        className="cursor-pointer transition-colors"
      />
    </svg>
  );
};
