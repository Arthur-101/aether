/**
 * Compact Markdown renderer for assistant replies in Quick Chat.
 *
 * The model already answers in Markdown; rendering it keeps lists, code, links,
 * and tables readable instead of showing raw `**` and backticks. Raw HTML is
 * not enabled, so model output cannot inject markup.
 */

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { openExternalTarget } from '../../lib/externalWindows';

const components: Components = {
  p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => (
    <h1 className="mb-1 mt-2 text-[13px] font-semibold text-[var(--aether-text-1)] first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1 mt-2 text-[12.5px] font-semibold text-[var(--aether-text-1)] first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-0.5 mt-1.5 text-[11.5px] font-semibold text-[var(--aether-text-1)] first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-0.5 mt-1.5 text-[11px] font-semibold text-[var(--aether-text-1)] first:mt-0">
      {children}
    </h4>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--aether-text-1)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="opacity-70">{children}</del>,
  ul: ({ children }) => (
    <ul className="my-1 list-disc space-y-0.5 pl-4 marker:text-[var(--aether-text-3)]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1 list-decimal space-y-0.5 pl-4 marker:text-[var(--aether-text-3)]">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5 [&>p]:my-0">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-1 border-l-2 border-[var(--aether-accent)]/40 pl-2 text-[var(--aether-text-2)]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-[var(--aether-line)]" />,
  pre: ({ children }) => (
    <pre className="my-1.5 overflow-x-auto rounded-md border border-[var(--aether-line)] bg-black/30 p-2 text-[10px] leading-relaxed [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[var(--aether-text-1)]">
      {children}
    </pre>
  ),
  code: ({ className, children }) => (
    <code
      className={`${className ?? ''} rounded bg-black/25 px-1 py-0.5 font-mono text-[10px] text-[var(--aether-accent-text)]`}
    >
      {children}
    </code>
  ),
  a: ({ href, children }) => {
    const target = href ?? '';
    const external = /^https?:\/\//i.test(target);
    return (
      <a
        href={target}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        onClick={(event) => {
          if (!external) return;
          event.preventDefault();
          void openExternalTarget(target).then((opened) => {
            if (!opened) window.open(target, '_blank', 'noopener,noreferrer');
          });
        }}
        className="text-[var(--aether-accent-text)] underline decoration-[var(--aether-accent)]/50 underline-offset-2 transition hover:decoration-[var(--aether-accent)]"
      >
        {children}
      </a>
    );
  },
  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt ?? ''}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="my-1 max-h-48 max-w-full rounded-md border border-[var(--aether-line)]"
    />
  ),
  table: ({ children }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="w-full border-collapse text-[10px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-[var(--aether-line)] bg-[var(--aether-fill)] px-1.5 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-[var(--aether-line)] px-1.5 py-1 align-top">
      {children}
    </td>
  ),
};

export function ChatMarkdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className={`break-words${streaming ? ' chat-stream-caret' : ''}`}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  );
}
