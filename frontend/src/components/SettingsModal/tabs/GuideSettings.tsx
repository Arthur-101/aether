import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, CircleAlert, Loader2, RefreshCw } from 'lucide-react';
import { ChatMarkdown } from '../../Island/ChatMarkdown';
import { settingsHintClass } from '../settingsStyles';

const API_BASE = 'http://127.0.0.1:8765';

interface GuideTopicMeta {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  related: string[];
}

interface GuideIndex {
  title: string;
  intro: string;
  content: string;
  topics: GuideTopicMeta[];
}

interface GuideTopic {
  id: string;
  title: string;
  summary: string;
  content: string;
  related: Array<{ id: string; title: string }>;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    let detail = 'The guide could not be loaded.';
    try {
      const body = await response.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* keep the fallback message */
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

/** Maps a Markdown link inside the guide to a topic id, or null for external links. */
function guideTopicId(href: string): string | null {
  if (!href || /^(https?:|mailto:|tel:)/i.test(href)) return null;
  const file = href.split('#')[0].split('/').pop() ?? '';
  const id = file.replace(/\.md$/i, '').trim();
  if (!id || id === 'index') return '';
  return id;
}

/**
 * Settings -> Guide.
 *
 * The same bundled Markdown the assistant reads is rendered here. The index is
 * loaded once; a topic is fetched on demand. Relative links navigate inside the
 * pane instead of leaving the Settings window.
 */
export const GuideSettings: React.FC = () => {
  const [index, setIndex] = useState<GuideIndex | null>(null);
  const [topic, setTopic] = useState<GuideTopic | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [topicRetryToken, setTopicRetryToken] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getJson<GuideIndex>('/api/guide/index')
      .then((payload) => {
        if (cancelled) return;
        setIndex(payload);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void getJson<GuideTopic>(`/api/guide/topics/${encodeURIComponent(activeId)}`)
      .then((payload) => {
        if (cancelled) return;
        setTopic(payload);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, topicRetryToken]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeId, topic?.id]);

  const selectTopic = useCallback(
    (id: string | null) => {
      if (id === activeId) return;
      setActiveId(id);
      setError(null);
      setLoading(id !== null);
    },
    [activeId]
  );

  const handleContentClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement).closest('a');
      if (!anchor) return;
      const id = guideTopicId(anchor.getAttribute('href') ?? '');
      if (id === null) return;
      event.preventDefault();
      if (id === '') {
        selectTopic(null);
        return;
      }
      if (index?.topics.some((item) => item.id === id)) selectTopic(id);
    },
    [index, selectTopic]
  );

  const visibleTopic = activeId && topic?.id === activeId ? topic : null;
  const title = visibleTopic?.title ?? index?.title ?? 'Aether Guide';

  return (
    <div className="flex min-h-0 flex-1 gap-3 pb-1">
      <nav
        aria-label="Guide topics"
        className="flex w-[150px] shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--aether-line)] bg-black/10"
      >
        <div className="flex items-center gap-1.5 border-b border-[var(--aether-line-soft)] px-2.5 py-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--aether-text-3)]">
          <BookOpen size={11} />
          Topics
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          <button
            type="button"
            onClick={() => selectTopic(null)}
            aria-current={activeId === null ? 'page' : undefined}
            className={`w-full rounded px-2 py-1.5 text-left text-[10px] transition ${
              activeId === null
                ? 'bg-[var(--aether-accent)]/12 text-[var(--aether-text-1)]'
                : 'text-[var(--aether-text-2)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]'
            }`}
          >
            Overview
          </button>
          {(index?.topics ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTopic(item.id)}
              title={item.summary}
              aria-current={activeId === item.id ? 'page' : undefined}
              className={`w-full rounded px-2 py-1.5 text-left text-[10px] leading-snug transition ${
                activeId === item.id
                  ? 'bg-[var(--aether-accent)]/12 text-[var(--aether-text-1)]'
                  : 'text-[var(--aether-text-2)] hover:bg-[var(--aether-fill)] hover:text-[var(--aether-text-1)]'
              }`}
            >
              {item.title}
            </button>
          ))}
        </div>
      </nav>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--aether-line)] bg-black/10">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--aether-line-soft)] px-3 py-2">
          <div className="min-w-0">
            <h5 className="truncate text-[11px] font-semibold text-[var(--aether-text-1)]">
              {title}
            </h5>
            <p className={`mt-0.5 line-clamp-2 ${settingsHintClass}`}>
              {visibleTopic?.summary ?? 'Setup, features, and troubleshooting for Aether.'}
            </p>
          </div>
          {loading ? (
            <Loader2 size={13} className="shrink-0 animate-spin text-[var(--aether-accent-text)]" />
          ) : null}
        </div>

        <div
          ref={contentRef}
          onClick={handleContentClick}
          className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed text-[var(--aether-text-2)]"
        >
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <CircleAlert size={16} className="text-[#ff99a4]" />
              <p className="max-w-[280px] text-[10px] leading-snug text-[var(--aether-text-2)]">
                {error}
              </p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  if (activeId) {
                    setTopicRetryToken((value) => value + 1);
                  } else {
                    setReloadToken((value) => value + 1);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2.5 py-1.5 text-[10px] text-[var(--aether-text-1)] transition hover:border-[var(--aether-line-strong)]"
              >
                <RefreshCw size={11} />
                Try again
              </button>
            </div>
          ) : loading && !visibleTopic ? (
            <div className="flex h-full items-center justify-center gap-2 text-[10px] text-[var(--aether-text-3)]">
              <Loader2 size={13} className="animate-spin" />
              Loading guide…
            </div>
          ) : visibleTopic ? (
            <>
              <ChatMarkdown content={visibleTopic.content} />
              {visibleTopic.related.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--aether-line-soft)] pt-2">
                  <span className={settingsHintClass}>Related</span>
                  {visibleTopic.related.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectTopic(item.id)}
                      className="rounded border border-[var(--aether-line)] px-1.5 py-0.5 text-[9px] text-[var(--aether-text-2)] transition hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]"
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : index ? (
            <>
              <ChatMarkdown content={index.intro} />
              <p className={`mt-3 border-t border-[var(--aether-line-soft)] pt-2 ${settingsHintClass}`}>
                Choose a topic on the left. Links inside the guide open in this
                pane; external links open in your browser.
              </p>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
};
