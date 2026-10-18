import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import type { RadialWheelPayload } from '../../types/ipc';

interface RadialWheelProps {
  data: RadialWheelPayload;
  onAction: (filePath: string, action: string, target?: string) => void;
  onOpenCrop: (filePath: string) => void;
  onOpenAddBg: (filePath: string) => void;
  onClose: () => void;
}

export const RadialWheel: React.FC<RadialWheelProps> = ({
  data,
  onAction,
  onOpenCrop,
  onOpenAddBg,
  onClose,
}) => {
  const [activeRing, setActiveRing] = useState<'format' | 'utility'>('format');
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  const ext = data.ext.toLowerCase().replace('.', '');
  const isPdf = ext === 'pdf';
  const isVideo = ['mp4', 'mov', 'mkv', 'avi'].includes(ext);

  const getFormatSlices = () => {
    if (isPdf) return ['DOCX', 'JPG', 'PNG', 'TXT'];
    if (isVideo) return ['MP3', 'GIF', 'COMPRESS', 'WEBM'];
    return ['WEBP', 'PNG', 'JPG', 'PDF', 'HEIC', 'AVIF'];
  };

  const utilitySlices = ['COMPRESS', 'CROP', 'ADD BG', 'REM BG', 'METADATA'];
  const slices = activeRing === 'format' ? getFormatSlices() : utilitySlices;

  const handleSliceClick = (label: string) => {
    const filePath = data.file_path;
    if (label === 'CROP') {
      onOpenCrop(filePath);
      onClose();
      return;
    }
    if (label === 'ADD BG') {
      onOpenAddBg(filePath);
      onClose();
      return;
    }
    if (label === 'REM BG') {
      onAction(filePath, 'REMOVE_BG');
    } else if (label === 'COMPRESS') {
      onAction(filePath, 'COMPRESS');
    } else if (label === 'METADATA') {
      onAction(filePath, 'STRIP_META');
    } else {
      // Conversion action
      const action = isPdf ? 'CONVERT_DOC' : 'CONVERT';
      onAction(filePath, action, label.toLowerCase());
    }
    onClose();
  };

  // Polar coordinates calculation for circular SVG slices
  const numSlices = slices.length;
  const radius = 135;
  const innerRadius = 56;
  const angleStep = (2 * Math.PI) / numSlices;

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-auto flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-[340px] h-[340px] select-none"
        style={{ left: Math.min(Math.max(data.x - 170, 20), window.innerWidth - 360), top: Math.min(Math.max(data.y - 170, 20), window.innerHeight - 360), position: 'absolute' }}
      >
        <svg width="340" height="340" viewBox="0 0 340 340" className="drop-shadow-2xl">
          {/* Outer Ring Background */}
          <circle cx="170" cy="170" r={radius} fill="rgba(15, 23, 42, 0.90)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />

          {/* Slices */}
          {slices.map((slice, index) => {
            const startAngle = index * angleStep - Math.PI / 2;
            const endAngle = (index + 1) * angleStep - Math.PI / 2;
            const isHovered = hoveredSlice === slice;

            const x1 = 170 + radius * Math.cos(startAngle);
            const y1 = 170 + radius * Math.sin(startAngle);
            const x2 = 170 + radius * Math.cos(endAngle);
            const y2 = 170 + radius * Math.sin(endAngle);

            const ix1 = 170 + innerRadius * Math.cos(endAngle);
            const iy1 = 170 + innerRadius * Math.sin(endAngle);
            const ix2 = 170 + innerRadius * Math.cos(startAngle);
            const iy2 = 170 + innerRadius * Math.sin(startAngle);

            const midAngle = (startAngle + endAngle) / 2;
            const textX = 170 + ((radius + innerRadius) / 2) * Math.cos(midAngle);
            const textY = 170 + ((radius + innerRadius) / 2) * Math.sin(midAngle) + 4;

            const pathD = `M ${ix2} ${iy2} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerRadius} ${innerRadius} 0 0 0 ${ix2} ${iy2} Z`;

            return (
              <g
                key={slice}
                onClick={() => handleSliceClick(slice)}
                onMouseEnter={() => setHoveredSlice(slice)}
                onMouseLeave={() => setHoveredSlice(null)}
                className="cursor-pointer transition-all duration-150"
              >
                <path
                  d={pathD}
                  fill={isHovered ? 'url(#activeSliceGradient)' : 'rgba(30, 41, 59, 0.65)'}
                  stroke="rgba(255, 255, 255, 0.12)"
                  strokeWidth="1.5"
                />
                <text
                  x={textX}
                  y={textY}
                  textAnchor="middle"
                  fill={isHovered ? '#FFFFFF' : '#CBD5E1'}
                  fontSize={isHovered ? '11.5' : '10.5'}
                  fontWeight={isHovered ? '700' : '600'}
                  className="pointer-events-none select-none font-sans"
                >
                  {slice}
                </text>
              </g>
            );
          })}

          {/* Gradients */}
          <defs>
            <linearGradient id="activeSliceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0078D4" />
              <stop offset="100%" stopColor="#005A9E" />
            </linearGradient>
          </defs>

          {/* Center Hub Core */}
          <circle
            cx="170"
            cy="170"
            r={innerRadius - 4}
            fill="#0F172A"
            stroke="rgba(56, 189, 248, 0.4)"
            strokeWidth="1.5"
            onClick={() => setActiveRing(activeRing === 'format' ? 'utility' : 'format')}
            className="cursor-pointer hover:stroke-cyan-400 transition"
          />
        </svg>

        {/* Center Hub Content Overlay */}
        <div
          onClick={() => setActiveRing(activeRing === 'format' ? 'utility' : 'format')}
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4"
        >
          <div className="flex items-center gap-1 text-[10px] font-bold text-cyan-400 tracking-wider">
            <Sparkles size={10} />
            <span>{activeRing === 'format' ? 'CONVERT' : 'UTILITY'}</span>
          </div>
          <div className="text-[11px] font-semibold text-white truncate max-w-[80px] mt-0.5">
            {data.file_path.split(/[\\/]/).pop()}
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5">Click to toggle</div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1 rounded-full bg-slate-800 text-slate-400 hover:text-white transition"
        >
          <X size={14} />
        </button>
      </motion.div>
    </div>
  );
};
