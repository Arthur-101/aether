import React, { useState } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { CardArt } from './CardArt';

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
    <section className="notch-card motif-card relative overflow-hidden rounded-2xl p-3">
      <CardArt
        variant="spark"
        className="pointer-events-none absolute bottom-0 right-0 h-[138px] w-[138px]"
      />

      <div className="relative flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--aether-fill)] accent-text">
          <Sparkles size={14} />
        </span>
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--aether-text-1)]">
            Plan with Aether
          </h3>
        </div>
      </div>
      <div className="relative mt-2 flex items-center gap-1.5">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          placeholder="What should I remember?"
          className="min-w-0 flex-1 rounded-lg border border-[var(--aether-line)] bg-[var(--aether-surface-4)] px-2.5 py-2 text-[11.5px] text-[var(--aether-text-1)] outline-none placeholder:text-[var(--aether-text-3)] focus:border-[var(--aether-accent)]"
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
      <div className="relative mt-1.5 flex flex-wrap gap-1">
        {SUGGESTIONS.slice(0, 2).map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setPrompt(suggestion)}
            className="max-w-full truncate rounded-full border border-[var(--aether-line-soft)] bg-[var(--aether-fill)] px-2 py-1 text-[10px] text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  );
};
