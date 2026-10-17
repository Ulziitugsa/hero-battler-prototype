import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { dismissBootSplash } from '../platform/bootSplash';
import { registerTrialCards } from './cards';
import { TrialsApp } from './TrialsApp';
import type { StorageGuard } from '../lab/storageGuard';

/** Renders the Arcane Trials in place of the game (main.tsx, ?trials in an experiment build). */
export function mountTrials(root: HTMLElement, guard: StorageGuard | null): void {
  // The experimental cards exist for this page load only.
  registerTrialCards();
  createRoot(root).render(
    <StrictMode>
      <TrialsApp guard={guard} />
    </StrictMode>,
  );
  dismissBootSplash();
}
