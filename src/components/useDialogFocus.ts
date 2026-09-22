import { useEffect, useRef } from 'react';

/** Keep keyboard focus inside the active sheet and restore its trigger on dismissal. */
export function useDialogFocus(onEscape: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const selector = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]';
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter(el => el.getClientRects().length > 0);
    (focusable()[0] ?? dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      // A nested inspector owns its own keyboard interaction.
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onEscape(); }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', keydown);
    return () => { dialog.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow; if (previous?.isConnected) previous.focus(); };
  }, [onEscape]);
  return ref;
}
