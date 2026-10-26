/**
 * Live tool-run list shown while a chat turn is in flight.
 *
 * Each step comes from `TOOL_CALL_STARTED` / `TOOL_CALL_FINISHED`: a spinner
 * while the tool runs, then a check or a cross. Labels and icons come from
 * `toolMeta`, so this stays generic for every tool group.
 */

import React from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type { ToolCallEvent } from '../../types/ipc';
import { toolMeta } from './toolMeta';

interface ToolRunListProps {
  calls: ToolCallEvent[];
}

export const ToolRunList: React.FC<ToolRunListProps> = ({ calls }) => {
  if (calls.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-[var(--aether-line-soft)] pt-2">
      {calls.map((call) => {
        const { label, icon: Icon } = toolMeta(call.name);
        const running = call.phase === 'started';
        return (
          <div
            key={call.call_id}
            className="flex items-center gap-1.5 text-[9.5px] text-[var(--aether-text-2)]"
          >
            <Icon size={10} className="shrink-0 text-[var(--aether-accent-text)]" />
            <span className="truncate">{label}</span>
            <span className="ml-auto shrink-0 pl-2">
              {running ? (
                <Loader2
                  size={10}
                  className="animate-spin text-[var(--aether-accent-text)]"
                />
              ) : call.ok ? (
                <Check size={10} className="text-emerald-400" />
              ) : (
                <X size={10} className="text-rose-400" />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
};