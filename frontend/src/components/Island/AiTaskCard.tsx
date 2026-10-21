import React, { useState } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';

interface AiTaskCardProps {
  onAskAether: (prompt: string) => void;
}

const SUGGESTIONS = [
  'Remind me tomorrow at 9 to send the report',
  'Every day at 6pm summarize my tasks',
  'Set a 7:30am alarm for weekdays',
];

export const AiTaskCard: React.FC<AiTaskCardProps> = ({ onAskAether }) => {
  const [prompt, setPrompt] = useState('');
  const submit = () => {
    const text = prompt.trim();
    if (!text) return;
    setPrompt('');
    onAskAether(text);
  };

  return (
    <section className="notch-card rounded-2xl p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] accent-text">
          <Sparkles size={14} />
        </span>
        <div>
          <h3 className="text-[12px] font-semibold text-[#f2efe7]">
            Plan with Aether
          </h3>
          <p className="text-[9px] text-[#777168]">
            Natural language → task, routine, or alarm
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          placeholder="What should I remember?"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#242424] px-2.5 py-2 text-[10px] text-white outline-none placeholder:text-[#6f6a61] focus:border-[var(--aether-accent)]"
        />
        <button
          type="button"
          onClick={submit}
          aria-label="Ask Aether"
          className="accent-fill flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        >
          <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {SUGGESTIONS.slice(0, 2).map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setPrompt(suggestion)}
            className="max-w-full truncate rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[8.5px] text-[#8f897d] transition hover:bg-white/[0.08] hover:text-white"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  );
};
