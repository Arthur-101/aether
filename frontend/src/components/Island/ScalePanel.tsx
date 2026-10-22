import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Ruler } from 'lucide-react';
import type { DisplayInfo } from '../../types/ipc';
import { ControlPanel, PanelFooterRow } from './ControlPanel';
import { RulerFace } from './RulerFace';
import {
  SCALE_UNITS,
  displayPpi,
  mmPerCssPixel,
  type ScaleUnit,
} from './scaleUnits';

interface ScalePanelProps {
  displayInfo: DisplayInfo | null;
  onOpenScale: (unit: ScaleUnit) => void;
  className?: string;
}

/**
 * The SCALE panel: a compact unit picker and a preview of the ruler that can
 * be floated over the desktop. The actual measuring happens on screen, where
 * it can be dragged and resized against the UI.
 */
export const ScalePanel: React.FC<ScalePanelProps> = ({
  displayInfo,
  onOpenScale,
  className = '',
}) => {
  const [unit, setUnit] = useState<ScaleUnit>('px');
  const mmPerCssPx = useMemo(() => mmPerCssPixel(displayInfo), [displayInfo]);
  const ppi = displayPpi(displayInfo);
  const ppiHint =
    ppi && displayInfo?.width_mm
      ? `PPI = physical pixels per inch. ${displayInfo.width} px ÷ ${displayInfo.width_mm} mm × 25.4 ≈ ${Math.round(ppi)} PPI; the ruler uses this to stay physically accurate.`
      : `PPI = physical pixels per inch. The display does not report its active-area size, so the ruler uses the standard 96 DPI fallback.`;

  return (
    <ControlPanel
      label="Scale"
      icon={<Ruler size={14} />}
      className={className}
      footer={
        <PanelFooterRow
          left="Drag · resize · Esc"
          right={ppi ? `${Math.round(ppi)} PPI` : '96 DPI'}
          rightTitle={ppiHint}
        />
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
          Unit
        </span>
        <div className="flex items-center gap-1">
          {SCALE_UNITS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setUnit(item.id)}
              title={item.title}
              className={`rounded px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.08em] transition ${
                unit === item.id
                  ? 'accent-fill'
                  : 'text-[var(--aether-text-3)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 overflow-hidden rounded-lg border border-[var(--aether-line-soft)] bg-[var(--aether-fill)] px-2 pt-2">
        <RulerFace
          fill
          compact
          lengthPx={278}
          unit={unit}
          mmPerCssPx={mmPerCssPx}
        />
      </div>

      <button
        type="button"
        onClick={() => onOpenScale(unit)}
        className="accent-fill mt-2 flex h-7 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg text-[9.5px] font-semibold transition hover:brightness-105"
      >
        <Ruler size={12} />
        Open on-screen scale
        <ArrowUpRight size={11} className="opacity-70" />
      </button>
    </ControlPanel>
  );
};
