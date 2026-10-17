import { useEffect, useRef } from 'react';

/** Keep keyboard focus inside the active sheet and restore its trigger on dismissal. */
export function useDialogFocus(onEscape: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  // The latest close handler, without re-running the effect: callers pass inline closures, and a re-run on every parent
  // render would hand focus back to the trigger and then to the sheet's first control (Pass 5).
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  });
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
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); escape.current(); }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    // Focus can fall out of the sheet without leaving it: the focused control is disabled or removed (a reward's Claim
    // button once claimed) and focus drops to the page. Escape and Tab then still belong to the topmost open sheet,
    // instead of doing nothing or walking into the screen behind it.
    const stray = (event: KeyboardEvent) => {
      if (event.defaultPrevented || dialog.contains(document.activeElement) || (event.key !== 'Escape' && event.key !== 'Tab')) return;
      const open = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')).filter(d => d.getClientRects().length > 0);
      if (open.at(-1) !== dialog) return;
      event.preventDefault();
      if (event.key === 'Escape') escape.current();
      else (focusable()[0] ?? dialog).focus();
    };
    dialog.addEventListener('keydown', keydown);
    document.addEventListener('keydown', stray);
    return () => { dialog.removeEventListener('keydown', keydown); document.removeEventListener('keydown', stray); document.body.style.overflow = previousOverflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return ref;
}
