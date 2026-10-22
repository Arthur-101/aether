import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { ControlPanel } from './ControlPanel';

interface WidgetsPanelProps {
  /** Pop-out widgets the user has pinned to the desktop. */
  pinned?: number;
}

/**
 * Widgets.
 *
 * The panel is the home for the desktop widgets: a floating media player
 * that can be pinned anywhere on the screen, a clock, a date panel, and
 * whatever comes next. Nothing is pinnable yet, so this is a reserved space
 * rather than a dead control.
 */
export const WidgetsPanel: React.FC<WidgetsPanelProps> = ({ pinned = 0 }) => (
  <ControlPanel
    label="Widgets"
    icon={<LayoutGrid size={14} className="text-[var(--aether-accent-text)]" />}
    className="flex-1"
  >
    <div className="flex h-full min-h-[118px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--aether-line)] bg-[var(--aether-fill)] px-4 py-3 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--aether-line)] bg-[var(--aether-surface-2)] text-[var(--aether-text-3)]">
        <LayoutGrid size={16} />
      </div>
      <div className="text-[10.5px] font-semibold text-[var(--aether-text-1)]">
        {pinned > 0 ? `${pinned} widget${pinned === 1 ? '' : 's'} pinned` : 'No widgets yet'}
      </div>
      <p className="max-w-[230px] text-[9px] leading-relaxed text-[var(--aether-text-3)]">
        A floating music player, a clock, and a date panel can be pinned to the
        desktop from here.
      </p>
    </div>
  </ControlPanel>
);
