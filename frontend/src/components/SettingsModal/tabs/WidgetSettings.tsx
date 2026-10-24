import React from 'react';
import { LayoutGrid } from 'lucide-react';
import type { AppearanceConfig } from '../../../types/ipc';
import { GrainSlider, OpacitySlider, PopSlider, RadiusSlider } from './SurfaceSliders';

interface WidgetSettingsProps {
  appearance: AppearanceConfig;
  onChange: (appearance: AppearanceConfig) => void;
}

/**
 * Desktop widgets.
 *
 * The popped-out widgets are their own windows, so their surface is styled
 * separately from the notch and the island: transparency, grain, and pop depth
 * are all set here. Every control applies live, so the widgets on the desktop
 * change as the slider moves.
 */
export const WidgetSettings: React.FC<WidgetSettingsProps> = ({
  appearance,
  onChange,
}) => {
  const update = (patch: Partial<AppearanceConfig>) =>
    onChange({ ...appearance, ...patch });

  return (
    <div className="flex flex-col gap-4 pb-2">
      <section className="border-b border-[var(--aether-line-soft)] pb-4 last:border-b-0 last:pb-0">
        <div className="mb-2 flex items-start gap-2">
          <span className="mt-0.5 accent-text">
            <LayoutGrid size={14} />
          </span>
          <div>
            <h4 className="text-xs font-semibold text-[var(--aether-text-1)]">
              Widget surface
            </h4>
            <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--aether-text-3)]">
              Transparency, grain, and pop depth apply to the widget card only;
              text and icons stay readable.
            </p>
          </div>
        </div>

        <OpacitySlider
          label="Widget transparency"
          value={appearance.widget_opacity}
          onChange={(widget_opacity) => update({ widget_opacity })}
        />
        <div className="mt-2">
          <GrainSlider
            label="Widget grain"
            value={appearance.widget_grain}
            onChange={(widget_grain) => update({ widget_grain })}
          />
        </div>
        <div className="mt-2">
          <PopSlider
            label="Widget pop"
            value={appearance.widget_pop}
            onChange={(widget_pop) => update({ widget_pop })}
          />
        </div>
        <div className="mt-2">
          <RadiusSlider
            label="Widget corner radius"
            value={appearance.widget_radius}
            onChange={(widget_radius) => update({ widget_radius })}
          />
        </div>
      </section>

      <section className="border-b border-[var(--aether-line-soft)] pb-4 last:border-b-0 last:pb-0">
        <div className="mb-2 flex items-start gap-2">
          <span className="mt-0.5 accent-text">
            <LayoutGrid size={14} />
          </span>
          <div>
            <h4 className="text-xs font-semibold text-[var(--aether-text-1)]">
              Adding widgets
            </h4>
            <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--aether-text-3)]">
              Open Controls → Widgets to add the media player, the clock, or the
              date panel. Each one lands on the desktop, can be dragged
              anywhere, and is kept on top or pinned to the desktop.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
