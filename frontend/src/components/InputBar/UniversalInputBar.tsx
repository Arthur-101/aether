import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, CornerDownLeft, ImageIcon, Sparkles, X } from 'lucide-react';
import type { AppearanceConfig, AttachmentItem, ChatTurn, SpeedTestResult, SystemStats } from '../../types/ipc';
import type { SettingsTab } from '../SettingsModal/SettingsModal';
import type { CurrencyRates } from '../../lib/currency';
import { fetchCurrencyRates } from '../../lib/currency';
import { convertCurrency, formatMoney } from '../Island/currencyConvert';
import { evaluateExpression, formatNumber } from '../Island/calculatorMath';
import { formatStopwatch, formatTimer } from '../Island/clockFormat';
import type { ClockTools } from '../Island/useClockTools';
import {
  INPUT_COMMANDS,
  formatQuantity,
  normalizeMath,
  parseDuration,
  parseInputBar,
} from './parseInputBar';

export interface UniversalInputBarProps {
  open: boolean;
  /** Island appearance: the panel borrows the island's opacity, grain and pop. */
  appearance: AppearanceConfig;
  defaultCurrency: string;
  /** Files already attached to the session; the next prompt uses them. */
  attachments?: AttachmentItem[];
  onDetachAttachment?: (filePath: string) => void;
  /** Hides the overlay, grabs the screen under the cursor, attaches the PNG. */
  onScreenshot?: () => void;
  /** Bumped when that capture finishes, so the bar takes keyboard focus back. */
  screenshotAt?: number;
  clockTools: ClockTools;
  systemStats: SystemStats | null;
  speedTest: SpeedTestResult | null;
  history: ChatTurn[];
  /** The prompt the daemon is answering, if any. */
  pending: string | null;
  /** The answer streaming in right now. */
  draft: string;
  onClose: () => void;
  onAsk: (text: string) => void;
  onSpeedTest: (seconds: number) => void;
  onNewSession: () => void;
  onToggleTheme: () => void;
  onSetMuted: (muted: boolean) => void;
  onSetVolume: (percent: number) => void;
  onSetBrightness: (percent: number) => void;
  onOpenSettings: (tab: SettingsTab | null) => void;
  onOpenColorPicker: () => void;
}

interface PanelRow {
  label: string;
  value: string;
  /** 0..100, drawn as a bar under the value. */
  progress?: number;
  error?: boolean;
}

/** What the currency line shows, kept separate from the command rows. */
interface CurrencyView {
  header: string;
  source: string;
  result: string;
  /** Rate table fetch date, blank when unknown. */
  updated: string;
  error: boolean;
  ready: boolean;
}

/** "22 Nov 2026" for a rate stamp; blank when it cannot be read. */
function rateDate(stamp: string): string {
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const SPEED_TEST_DEFAULT = 12;
const SPEED_TEST_MIN = 5;
const SPEED_TEST_MAX = 60;

function copy(text: string) {
  void navigator.clipboard.writeText(text).catch(() => undefined);
}

/** One key hint in the footer. */
const Key: React.FC<{ children: React.ReactNode; label: string }> = ({
  children,
  label,
}) => (
  <span className="flex items-center gap-1">
    <span className="rounded-[5px] border border-[var(--aether-line)] px-1 py-[1px] font-mono text-[8.5px] leading-none text-[var(--aether-text-3)]">
      {children}
    </span>
    <span className="text-[9px] text-[var(--aether-text-4)]">{label}</span>
  </span>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="px-4 py-2.5">
    <p className="text-[8.5px] uppercase tracking-[0.16em] text-[var(--aether-text-4)]">
      {label}
    </p>
    <div className="mt-1">{children}</div>
  </div>
);

/** The two half card from the calculator: expression on the left, answer on the right. */
const AnswerCard: React.FC<{
  left: string;
  leftLabel: string;
  right: string;
  rightLabel: string;
  error?: boolean;
}> = ({ left, leftLabel, right, rightLabel, error }) => (
  <div className="relative flex items-stretch overflow-hidden rounded-xl bg-[var(--aether-fill)]">
    <div className="flex flex-1 flex-col items-center justify-center px-3 py-3">
      <p className="text-center text-[16px] leading-snug text-[var(--aether-text-1)]">
        {left}
      </p>
      <span className="mt-2 rounded-md bg-[var(--aether-surface-3)] px-2 py-[2px] text-[9px] text-[var(--aether-text-3)]">
        {leftLabel}
      </span>
    </div>
    <div className="w-px shrink-0 bg-[var(--aether-line)]" />
    <div className="flex flex-1 flex-col items-center justify-center px-3 py-3">
      <p
        className={`text-center font-mono text-[16px] leading-snug ${
          error ? 'text-[var(--aether-danger)]' : 'text-[var(--aether-text-1)]'
        }`}
      >
        {right}
      </p>
      <span className="mt-2 rounded-md bg-[var(--aether-surface-3)] px-2 py-[2px] text-[9px] text-[var(--aether-text-3)]">
        {rightLabel}
      </span>
    </div>
    <span className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--aether-fill)] px-1 text-[11px] leading-none text-[var(--aether-text-4)]">
      →
    </span>
  </div>
);

export const UniversalInputBar: React.FC<UniversalInputBarProps> = ({
  open,
  appearance,
  defaultCurrency,
  attachments = [],
  onDetachAttachment,
  onScreenshot,
  screenshotAt = 0,
  clockTools,
  systemStats,
  speedTest,
  history,
  pending,
  draft,
  onClose,
  onAsk,
  onSpeedTest,
  onNewSession,
  onToggleTheme,
  onSetMuted,
  onSetVolume,
  onSetBrightness,
  onOpenSettings,
  onOpenColorPicker,
}) => {
  const [text, setText] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [ran, setRan] = useState<{ name: string; arg: string } | null>(null);
  const [submitted, setSubmitted] = useState<{ text: string; start: number } | null>(
    null
  );
  const [rates, setRates] = useState<CurrencyRates | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const parsed = useMemo(() => parseInputBar(text), [text]);

  // Every open starts clean, like a launcher.
  useEffect(() => {
    if (!open) return;
    setText('');
    setRan(null);
    setSubmitted(null);
    setHighlight(0);
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Hiding the window for a screenshot drops keyboard focus; take it back
  // without clearing the draft, which the open effect above owns.
  useEffect(() => {
    if (!open || !screenshotAt) return;
    inputRef.current?.focus();
  }, [open, screenshotAt]);

  // The daemon owns the daily cache, so this is one local read per session.
  useEffect(() => {
    if (!open || rates) return;
    let cancelled = false;
    void fetchCurrencyRates().then((table) => {
      if (!cancelled && table) setRates(table);
    });
    return () => {
      cancelled = true;
    };
  }, [open, rates]);

  // The bar is a textarea so long prompts wrap; grow it up to five lines.
  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    const fit = () => {
      // The popup's first layout can measure this at zero width, where every
      // word wraps and the box opens five lines tall, then snaps shut on the
      // first keypress. Wait until the panel actually has a width.
      if (!element.clientWidth) return;
      element.style.height = 'auto';
      element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
    };
    fit();
    // Refit when the panel settles on its width; ignore height-only changes so
    // our own resize does not feed back into the observer.
    let lastWidth = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === lastWidth) return;
      lastWidth = element.clientWidth;
      fit();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, open]);

  const query = parsed.kind === 'command-list' ? text.trim().slice(1).toLowerCase() : '';
  const matches = INPUT_COMMANDS.filter((command) =>
    command.name.slice(1).startsWith(query)
  );
  const showList = parsed.kind === 'command-list';
  const activeIndex = Math.min(highlight, Math.max(matches.length - 1, 0));

  // A local answer is also a question Aether can answer better: Tab asks it.
  const aiEscape =
    !submitted &&
    (parsed.kind === 'math' ||
      parsed.kind === 'currency' ||
      parsed.kind === 'unit');

  // Keyboard selection must stay on screen: the list is taller than the popup.
  useEffect(() => {
    if (!showList) return;
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-row="${activeIndex}"]`
    );
    row?.scrollIntoView({ block: 'nearest' });
  }, [showList, activeIndex, matches.length]);

  const mathValue = useMemo(() => {
    if (parsed.kind !== 'math') return null;
    try {
      const result = evaluateExpression(normalizeMath(parsed.expression));
      return Number.isFinite(result) ? formatNumber(result) : null;
    } catch {
      return null;
    }
  }, [parsed]);

  const unitView = useMemo(() => {
    if (parsed.kind !== 'unit') return null;
    const { amount, from, to, value } = parsed.conversion;
    return {
      header: from.group,
      source: `${formatQuantity(amount)} ${from.label}`,
      result: `${formatQuantity(value)} ${to.label}`,
    };
  }, [parsed]);

  const currencyView = useMemo<CurrencyView | null>(() => {
    if (parsed.kind !== 'currency') return null;
    const target = parsed.to ?? defaultCurrency;
    const source = `${formatMoney(parsed.amount)} ${parsed.from}`;
    if (!rates) {
      return {
        header: 'Currency',
        source,
        result: 'Rates unavailable offline',
        updated: '',
        error: false,
        ready: false,
      };
    }
    const updated = rateDate(rates.fetched_at);
    const value = convertCurrency(parsed.amount, parsed.from, target, rates.rates);
    if (!Number.isFinite(value)) {
      return {
        header: `${parsed.from} → ${target}`,
        source,
        result: `No rate for ${target}`,
        updated,
        error: true,
        ready: false,
      };
    }
    return {
      header: `${parsed.from} → ${target}`,
      source,
      result: `${formatMoney(value)} ${target}`,
      updated,
      error: false,
      ready: true,
    };
  }, [parsed, rates, defaultCurrency]);

  const reply = useMemo(() => {
    if (!submitted) return null;
    if (pending !== null && pending === submitted.text) {
      return { text: draft, streaming: true, error: false };
    }
    // The session may have gained a scheduled task's turn first, so the exact
    // prompt wins and the turn that landed right after submitting is the backup.
    let turn = null;
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index].user === submitted.text) {
        turn = history[index];
        break;
      }
    }
    if (!turn && history.length > submitted.start) {
      turn = history[submitted.start];
    }
    return {
      text: turn?.ai ?? '',
      streaming: false,
      error: Boolean(turn?.error),
    };
  }, [submitted, pending, draft, history]);

  // What Enter copies: the finished reply when one is on screen, else the
  // local answer (math, currency, unit) the panel is showing.
  const replyReady = Boolean(reply && !reply.streaming && !reply.error && reply.text);
  const localAnswer =
    parsed.kind === 'unit'
      ? Boolean(unitView)
      : parsed.kind === 'currency'
        ? Boolean(currencyView?.ready)
        : parsed.kind === 'math'
          ? Boolean(mathValue)
          : false;
  const enterCopies = submitted ? replyReady : localAnswer;

  const ranView = useMemo<PanelRow | null>(() => {
    if (!ran) return null;
    const timer = clockTools.timer;
    const stopwatch = clockTools.stopwatch;

    switch (ran.name) {
      case 'timer':
        return {
          label: 'Timer',
          value: timer.running
            ? `${formatTimer(timer.remainingMs)} remaining`
            : timer.finished
              ? 'Finished'
              : formatTimer(timer.remainingMs),
        };
      case 'stopwatch':
        return {
          label: 'Stopwatch',
          value: `${formatStopwatch(stopwatch.elapsedMs)}${
            stopwatch.running ? '' : stopwatch.elapsedMs > 0 ? ' paused' : ' ready'
          }`,
        };
      case 'stopwatch-lap':
        return {
          label: stopwatch.laps.length ? `Lap ${stopwatch.laps.length}` : 'Stopwatch',
          value: stopwatch.laps.length
            ? formatStopwatch(stopwatch.laps[0])
            : 'Start the stopwatch first',
        };
      case 'stopwatch-reset':
        return { label: 'Stopwatch', value: 'Reset to 00:00.00' };
      case 'mute':
        return {
          label: 'Output',
          value: systemStats?.muted ? 'Muted' : 'Sound on',
        };
      case 'volume': {
        const value = Number(ran.arg);
        if (!ran.arg || !Number.isFinite(value)) {
          return { label: 'Volume', value: 'Use /volume 0-100', error: true };
        }
        return {
          label: 'Volume',
          value: `${Math.max(0, Math.min(100, Math.round(value)))}%`,
        };
      }
      case 'brightness': {
        const value = Number(ran.arg);
        if (!ran.arg || !Number.isFinite(value)) {
          return { label: 'Brightness', value: 'Use /brightness 0-100', error: true };
        }
        return {
          label: 'Brightness',
          value: `${Math.max(0, Math.min(100, Math.round(value)))}%`,
        };
      }
      case 'theme':
        return { label: 'Appearance', value: 'Theme toggled' };
      case 'speed-test': {
        const seconds = speedTest?.duration_seconds;
        if (speedTest?.state === 'running') {
          const progress = Math.round((speedTest.progress ?? 0) * 100);
          return {
            label: `Speed test${seconds ? ` · ${seconds}s` : ''}`,
            value: `${speedTest.phase ?? 'starting'} · ${progress}%`,
            progress,
          };
        }
        if (speedTest?.state === 'error') {
          return {
            label: 'Speed test',
            value: speedTest.message || 'The test did not complete',
            error: true,
          };
        }
        if (speedTest?.download_mbps != null) {
          return {
            label: `Speed test${seconds ? ` · ${seconds}s` : ''}`,
            value: [
              `↓ ${speedTest.download_mbps.toFixed(1)}`,
              `↑ ${(speedTest.upload_mbps ?? 0).toFixed(1)} Mbps`,
              `${Math.round(speedTest.ping_ms ?? 0)} ms`,
            ].join(' · '),
          };
        }
        return { label: 'Speed test', value: 'Starting...' };
      }
      default:
        return null;
    }
  }, [ran, clockTools, systemStats, speedTest]);

  const runCommand = (name: string, arg: string) => {
    setRan({ name, arg });
    switch (name) {
      case 'settings':
        onOpenSettings(null);
        onClose();
        return;
      case 'model':
        onOpenSettings('ai');
        onClose();
        return;
      case 'new-session':
        onNewSession();
        onClose();
        return;
      case 'color-picker':
        onOpenColorPicker();
        onClose();
        return;
      case 'theme':
        onToggleTheme();
        return;
      case 'mute':
        onSetMuted(!(systemStats?.muted ?? false));
        return;
      case 'speed-test': {
        const requested = Number(arg);
        const seconds =
          arg && Number.isFinite(requested)
            ? Math.round(requested)
            : SPEED_TEST_DEFAULT;
        onSpeedTest(Math.max(SPEED_TEST_MIN, Math.min(SPEED_TEST_MAX, seconds)));
        return;
      }
      case 'volume': {
        const value = Number(arg);
        if (arg && Number.isFinite(value)) {
          onSetVolume(Math.max(0, Math.min(100, Math.round(value))));
        }
        return;
      }
      case 'brightness': {
        const value = Number(arg);
        if (arg && Number.isFinite(value)) {
          onSetBrightness(Math.max(0, Math.min(100, Math.round(value))));
        }
        return;
      }
      case 'timer': {
        if (!arg) {
          clockTools.toggleTimer();
        } else if (arg.toLowerCase() === 'reset') {
          clockTools.resetTimer();
        } else {
          const seconds = parseDuration(arg);
          if (seconds) clockTools.startTimer(seconds);
        }
        return;
      }
      case 'stopwatch':
        clockTools.toggleStopwatch();
        return;
      case 'stopwatch-lap':
        if (clockTools.stopwatch.running) clockTools.lapStopwatch();
        return;
      case 'stopwatch-reset':
        clockTools.resetStopwatch();
        return;
      default:
        return;
    }
  };

  const submit = () => {
    if (pending !== null) return;
    const value = text.trim();
    if (!value) return;
    setSubmitted({ text: value, start: history.length });
    setRan(null);
    onAsk(value);
  };

  const runOrCopy = () => {
    // A landed reply is the answer on screen: Enter copies it, not the prompt
    // and not the local value of an expression that was sent to Aether.
    if (submitted) {
      if (replyReady && reply?.text) {
        copy(reply.text);
        onClose();
      }
      return;
    }
    if (showList) {
      const command = matches[activeIndex];
      if (command) {
        setText(command.name);
        runCommand(command.name.slice(1), '');
      }
      return;
    }

    switch (parsed.kind) {
      case 'command':
        runCommand(parsed.name, parsed.arg);
        return;
      case 'math':
        if (mathValue) {
          copy(mathValue);
          onClose();
        }
        return;
      case 'currency':
        if (currencyView?.ready) {
          copy(currencyView.result);
          onClose();
        }
        return;
      case 'unit':
        if (unitView) {
          copy(unitView.result);
          onClose();
        }
        return;
      case 'text':
        submit();
        return;
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      onScreenshot?.();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Tab' && aiEscape) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === 'Tab' && showList) {
      event.preventDefault();
      const command = matches[activeIndex];
      if (command?.argHint) setText(`${command.name} `);
      return;
    }
    if (event.key === 'ArrowDown' && showList) {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, matches.length - 1));
      return;
    }
    if (event.key === 'ArrowUp' && showList) {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      runOrCopy();
    }
  };

  const updateText = (value: string) => {
    setText(value);
    setRan(null);
    setSubmitted(null);
    setHighlight(0);
  };

  const panel = showList ? (
    <div
      ref={listRef}
      className="max-h-[288px] overflow-y-auto px-2 pb-2"
      role="listbox"
      aria-label="Commands"
    >
      {matches.length ? (
        matches.map((command, index) => (
          <button
            key={command.name}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            data-row={index}
            onMouseEnter={() => setHighlight(index)}
            onClick={() => {
              setText(command.name);
              runCommand(command.name.slice(1), '');
            }}
            className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-[7px] text-left transition-colors ${
              index === activeIndex ? 'bg-[var(--aether-fill)]' : ''
            }`}
          >
            <span
              className={`h-3.5 w-[2px] shrink-0 rounded-full ${
                index === activeIndex
                  ? 'bg-[var(--aether-accent)]'
                  : 'bg-transparent'
              }`}
            />
            <span
              className={`shrink-0 font-mono text-[11px] ${
                index === activeIndex
                  ? 'text-[var(--aether-text-1)]'
                  : 'text-[var(--aether-text-2)]'
              }`}
            >
              {command.name}
            </span>
            <span className="truncate text-[10px] text-[var(--aether-text-3)]">
              {command.description}
            </span>
            {command.argHint ? (
              <span className="ml-auto shrink-0 rounded-[5px] border border-[var(--aether-line-soft)] px-1.5 py-[1px] font-mono text-[8.5px] text-[var(--aether-text-4)]">
                {command.argHint}
              </span>
            ) : null}
          </button>
        ))
      ) : (
        <p className="px-2.5 py-3 text-[11px] text-[var(--aether-text-3)]">
          No command matches /{query}
        </p>
      )}
    </div>
  ) : submitted ? (
    <Row label="Aether">
      <div className="max-h-[46vh] overflow-y-auto">
        <p
          className={`whitespace-pre-wrap text-[12.5px] leading-relaxed ${
            reply?.error
              ? 'text-[var(--aether-danger)]'
              : 'text-[var(--aether-text-1)]'
          }`}
        >
          {reply?.text ||
            (reply?.streaming
              ? 'Thinking...'
              : pending
                ? 'A different reply is in progress.'
                : 'No reply yet.')}
        </p>
        {replyReady ? (
          <p className="mt-2 text-[9px] text-[var(--aether-text-4)]">
            Enter copies the answer
          </p>
        ) : null}
      </div>
    </Row>
  ) : currencyView ? (
    <div className="px-3 pt-2 pb-3">
      <p className="mb-1.5 px-1 text-[8.5px] uppercase tracking-[0.16em] text-[var(--aether-text-4)]">
        {currencyView.header}
      </p>
      <AnswerCard
        left={currencyView.source}
        leftLabel="Amount"
        right={currencyView.result}
        rightLabel="Result"
        error={currencyView.error}
      />
      {currencyView.updated ? (
        <p className="mt-1 px-1 text-[8.5px] text-[var(--aether-text-4)]">
          Last updated {currencyView.updated}
        </p>
      ) : null}
      {currencyView.ready ? (
        <p className="mt-2 px-1 text-[9px] text-[var(--aether-text-4)]">
          Enter copies the answer · Tab asks Aether
        </p>
      ) : null}
    </div>
  ) : unitView ? (
    <div className="px-3 pt-2 pb-3">
      <p className="mb-1.5 px-1 text-[8.5px] uppercase tracking-[0.16em] text-[var(--aether-text-4)]">
        {unitView.header}
      </p>
      <AnswerCard
        left={unitView.source}
        leftLabel="Input"
        right={unitView.result}
        rightLabel="Result"
      />
      <p className="mt-2 px-1 text-[9px] text-[var(--aether-text-4)]">
        Enter copies the answer · Tab asks Aether
      </p>
    </div>
  ) : mathValue ? (
    <div className="px-3 pt-2 pb-3">
      <p className="mb-1.5 px-1 text-[8.5px] uppercase tracking-[0.16em] text-[var(--aether-text-4)]">
        Calculator
      </p>
      <AnswerCard
        left={text.trim()}
        leftLabel="Expression"
        right={mathValue}
        rightLabel="Result"
      />
      <p className="mt-2 px-1 text-[9px] text-[var(--aether-text-4)]">
        Enter copies the answer · Tab asks Aether
      </p>
    </div>
  ) : ranView ? (
    <Row label={ranView.label}>
      <p
        className={`font-mono text-[14px] leading-tight ${
          ranView.error
            ? 'text-[var(--aether-danger)]'
            : 'text-[var(--aether-text-1)]'
        }`}
      >
        {ranView.value}
      </p>
      {ranView.progress != null ? (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--aether-surface-3)]">
          <div
            className="h-full rounded-full bg-[var(--aether-accent)] transition-[width] duration-200"
            style={{ width: `${ranView.progress}%` }}
          />
        </div>
      ) : null}
    </Row>
  ) : parsed.kind === 'unknown-command' ? (
    <div className="px-4 py-3 text-[11px] text-[var(--aether-text-3)]">
      Unknown command /{parsed.name}
    </div>
  ) : null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          data-aether-interactive
          className="aether-interactive fixed inset-0 z-[60] flex items-start justify-center pt-[16vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ y: -8, scale: 0.985, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -4, scale: 0.99, opacity: 0 }}
            transition={{ duration: 0.13 }}
            // Same Surface draggers as the island, so the popup matches it.
            style={{
              '--glass-alpha': appearance.island_opacity,
              '--aether-grain': appearance.island_grain,
              '--aether-pop': appearance.island_pop,
            } as React.CSSProperties}
            className="glass-panel aether-grain aether-pop w-[min(620px,calc(100vw-40px))] select-text overflow-hidden rounded-[20px]"
          >
            <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
              <span className="mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[var(--aether-fill)]">
                <Sparkles size={14} className="text-[var(--aether-accent-text)]" />
              </span>
              <textarea
                ref={inputRef}
                rows={1}
                value={text}
                spellCheck={false}
                placeholder="Ask anything, 5 ft in cm, $100 in INR, or / for commands"
                onChange={(event) => updateText(event.target.value)}
                onKeyDown={onKeyDown}
                className="focus-bare mt-0.5 max-h-[132px] w-full resize-none bg-transparent text-[13.5px] leading-6 text-[var(--aether-text-1)] outline-none placeholder:text-[var(--aether-text-4)]"
              />
              <button
                type="button"
                onClick={() => onScreenshot?.()}
                title="Screenshot the screen and attach it (Ctrl+S)"
                aria-label="Screenshot the screen and attach it"
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--aether-text-3)] transition hover:bg-[var(--aether-fill-2)] hover:text-[var(--aether-text-1)]"
              >
                <Camera size={13} />
              </button>
              {aiEscape ? (
                <button
                  type="button"
                  onClick={submit}
                  title="Ask Aether instead of answering here"
                  className="mt-1 flex h-[18px] shrink-0 items-center gap-1.5 rounded-md px-1 text-[9px] text-[var(--aether-text-3)] transition hover:text-[var(--aether-text-1)]"
                >
                  Quick AI
                  <span className="rounded-[4px] border border-[var(--aether-line)] px-1 py-[1px] font-mono text-[8.5px] leading-none">
                    tab
                  </span>
                </button>
              ) : (
                <span className="mt-1 flex h-[18px] shrink-0 items-center gap-1 rounded-md border border-[var(--aether-line)] px-1.5 font-mono text-[9px] text-[var(--aether-text-3)]">
                  <CornerDownLeft size={9} />
                  {pending ? 'wait' : 'run'}
                </span>
              )}
            </div>

            {attachments.length ? (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--aether-line-soft)] px-4 py-1.5">
                {attachments.map((item) => (
                  <span
                    key={item.file_path}
                    className="flex min-w-0 items-center gap-1.5 rounded-md bg-[var(--aether-fill-2)] px-1.5 py-1 text-[9.5px] text-[var(--aether-text-2)]"
                  >
                    {item.mode === 'image' ? (
                      <ImageIcon size={10} className="shrink-0" />
                    ) : null}
                    <span className="max-w-[240px] truncate">{item.file_name}</span>
                    <button
                      type="button"
                      onClick={() => onDetachAttachment?.(item.file_path)}
                      title={`Detach ${item.file_name}`}
                      aria-label={`Detach ${item.file_name}`}
                      className="shrink-0 rounded text-[var(--aether-text-4)] transition hover:text-[var(--aether-text-1)]"
                    >
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            {panel ? (
              <div className="border-t border-[var(--aether-line-soft)]">{panel}</div>
            ) : null}

            <div className="flex items-center gap-3 border-t border-[var(--aether-line-soft)] px-4 py-2">
              {showList ? (
                <>
                  <Key label="choose">↑↓</Key>
                  <Key label="complete">
                    <span className="px-[3px]">tab</span>
                  </Key>
                </>
              ) : (
                <Key label={pending ? 'waiting' : enterCopies ? 'copy' : 'run'}>↵</Key>
              )}
              <span className="ml-auto" />
              {!showList ? (
                <Key label="screenshot">
                  <span className="px-[3px]">ctrl+s</span>
                </Key>
              ) : null}
              <Key label="close">
                <span className="px-[3px]">esc</span>
              </Key>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};