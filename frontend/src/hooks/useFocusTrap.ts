import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface FocusTrapOptions {
  /** Element to focus when the trap activates. Falls back to the first control. */
  initialFocus?: HTMLElement | null;
  /** Resolves a fallback target when the previously focused element is gone. */
  restoreFocus?: () => HTMLElement | null;
  /** Called for Escape while the trap is active. Omit to leave Escape alone. */
  onEscape?: () => void;
  /** Temporarily lets keystrokes through (for example while recording a shortcut). */
  suspended?: boolean;
}

function isVisible(element: HTMLElement): boolean {
  if (element.hasAttribute('disabled') || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return element.getClientRects().length > 0;
}

/**
 * Keeps keyboard focus inside a modal surface while it is open.
 *
 * The trap lives on the document in the capture phase so Escape closes the
 * dialog before any nested widget sees it. Callers can suspend the trap while
 * they are recording a keyboard shortcut, which lets those keystrokes reach
 * the recorder untouched.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  containerRef: React.RefObject<T | null>,
  options: FocusTrapOptions = {}
) {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    let frame = 0;

    // Let the dialog's entrance animation mount before stealing focus.
    frame = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const preferred = optionsRef.current.initialFocus;
      if (preferred && container.contains(preferred) && isVisible(preferred)) {
        preferred.focus();
        return;
      }
      const first = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).find(isVisible);
      (first ?? container).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (optionsRef.current.suspended) return;

      if (event.key === 'Escape') {
        const onEscape = optionsRef.current.onEscape;
        if (!onEscape) return;
        event.preventDefault();
        event.stopPropagation();
        onEscape();
        return;
      }

      if (event.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(isVisible);
      if (focusables.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      const inside = current instanceof Node && container.contains(current);

      if (event.shiftKey) {
        if (!inside || current === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);

      // The surface may remount the previous target (for example an expanded
      // island) after this cleanup runs, so resolve the fallback once it is
      // back in the DOM. Stop if the user has moved focus elsewhere.
      let attempts = 0;
      const restore = () => {
        attempts += 1;
        const active = document.activeElement;
        const canRefocus =
          !active ||
          active === document.body ||
          active === document.documentElement ||
          !active.isConnected;
        if (canRefocus) {
          const fallback = optionsRef.current.restoreFocus?.() ?? null;
          const previous =
            previouslyFocused &&
            previouslyFocused !== document.body &&
            previouslyFocused !== document.documentElement &&
            previouslyFocused.isConnected
              ? previouslyFocused
              : null;
          const target = previous ?? fallback;
          if (target && target !== document.body && target.isConnected) {
            target.focus();
            if (document.activeElement === target) return;
          }
        } else {
          return;
        }
        if (attempts < 4) window.setTimeout(restore, 110);
      };
      window.setTimeout(restore, 40);
    };
  }, [active, containerRef]);
}
