// First: on an Arcane Trials page load (an experiment build with ?trials), refuses every save write before any other module runs.
import { trialsGuard } from './trials/earlyGuard'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
import App from './App.tsx'
import { migrateToRealCollection } from './game/campaign/collectionMigration'
import { getActiveDeck } from './game/engine/activeDeck'
import { track } from './analytics/track'
import { initMissions } from './game/missions/store'
import { initEvents } from './game/events/store'
import { runSaveMigrations } from './game/save/migrations'
import { runLaunchSetMigration } from './game/save/launchSetMigration'

if (__CARD_LAB__ && trialsGuard) {
  // The Arcane Trials experiment (docs/design/POWER-FANTASY-P1.md) instead of the game: no save migration, no missions or
  // events, no session tracking. A production build has __CARD_LAB__ = false and drops this branch and the trials chunk.
  void import('./trials/mountTrials').then((m) => m.mountTrials(document.getElementById('root')!, trialsGuard))
} else {
  // Before anything renders: make sure a real collection exists (existing prototype progress is carried
  // over, see collectionMigration.ts) and that the stored active deck is one the player can actually field.
  // The launch set first: it records which free Core packages this save holds (the collection migration builds the
  // starter part of a collection from them) and retires the Moonfall Box (see launchSetMigration.ts).
  runLaunchSetMigration()
  migrateToRealCollection()
  // The card-combat release's save migration (versioned, idempotent): refunds Legacy Level Gold once, keeps everything else.
  runSaveMigrations()
  getActiveDeck()
  // Subscribes missions to the analytics stream BEFORE any gameplay event can fire, so progress is tracked
  // even if the player never opens the Missions sheet this session (see game/missions/store.ts).
  initMissions()
  initEvents()
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
}
