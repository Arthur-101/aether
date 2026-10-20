import React from 'react';
import { ChevronRight } from 'lucide-react';

interface ControlsTileProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active: boolean | null;
  showStatus?: boolean;
  onClick: () => void;
  menuOpen?: boolean;
  onMenu?: () => void;
}

export const ControlsTile: React.FC<ControlsTileProps> = ({
  icon,
  title,
  subtitle,
  active,
  showStatus = true,
  onClick,
  menuOpen = false,
  onMenu,
}) => {
  const activate = () => onClick();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate();
      }}
      className="flex min-w-0 cursor-pointer flex-col justify-between rounded-lg border border-white/10 bg-[#2b2b2b]/80 p-2.5 text-left transition hover:border-white/20 hover:bg-[#323232]"
    >
      <div className="flex w-full items-center justify-between gap-1">
        <span className={active === false ? 'text-[#8b8b8b]' : 'text-[#60cdff]'}>
          {icon}
        </span>
        <div className="flex items-center gap-1">
          {showStatus ? (
            <span
              className={`rounded px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${
                active === null
                  ? 'bg-white/8 text-[#8b8b8b]'
                  : active
                    ? 'bg-[#6ccb5f]/15 text-[#9be58f]'
                    : 'bg-white/8 text-[#8b8b8b]'
              }`}
            >
              {active === null ? 'N/A' : active ? 'On' : 'Off'}
            </span>
          ) : null}
          {onMenu ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onMenu();
              }}
              title={`${title} options`}
              className="rounded p-0.5 text-[#8b8b8b] transition hover:bg-white/10 hover:text-white"
            >
              <ChevronRight
                size={13}
                className={menuOpen ? 'rotate-90 transition-transform' : 'transition-transform'}
              />
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-2 min-w-0">
        <div className="truncate text-[11px] font-semibold text-white">{title}</div>
        <div className="truncate text-[9px] text-[#8b8b8b]">{subtitle}</div>
      </div>
    </div>
  );
};
