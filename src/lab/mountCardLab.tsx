import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { dismissBootSplash } from '../platform/bootSplash';
import { CardLabApp } from './CardLabApp';
import type { StorageGuard } from './storageGuard';

/** Renders the Card Discovery Lab in place of the game (main.tsx, ?lab in a lab build). */
export function mountCardLab(root: HTMLElement, guard: StorageGuard | null): void {
  createRoot(root).render(
    <StrictMode>
      <CardLabApp guard={guard} />
    </StrictMode>,
  );
  dismissBootSplash();
}
