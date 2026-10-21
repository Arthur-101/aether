import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface PlaceholderPanelProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}

export const PlaceholderPanel: React.FC<PlaceholderPanelProps> = ({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}) => (
  <div className="flex h-full min-h-[320px] items-center justify-center p-6">
    <div className="notch-card w-full max-w-2xl rounded-2xl p-7">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-[var(--aether-accent)]">
        <Icon size={19} />
      </div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#857f73]">
        {eyebrow}
      </p>
      <h3 className="mt-1 text-lg font-semibold text-[#f2efe7]">{title}</h3>
      <p className="mt-2 max-w-lg text-[11px] leading-relaxed text-[#9b968d]">
        {description}
      </p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  </div>
);
