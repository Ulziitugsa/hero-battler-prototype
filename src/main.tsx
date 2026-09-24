import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { migrateToRealCollection } from './game/campaign/collectionMigration'
import { getActiveDeck } from './game/engine/activeDeck'
import { track } from './analytics/track'

// Before anything renders: make sure a real collection exists (existing prototype progress is carried
// over, see collectionMigration.ts) and that the stored active deck is one the player can actually field.
migrateToRealCollection()
getActiveDeck()
track('session_started')

// Dev-only console helpers for testing the collection loop; stripped from production builds.
if (import.meta.env.DEV) {
  void import('./game/collection/devTools').then((m) => {
    ;(window as unknown as { skyloomDev: unknown }).skyloomDev = m.devTools
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
