import type { DeckOption } from '../../game/engine/deckOptions';
import { DECK_SIZE } from '../../game/engine/deckRules';
import { getCollection } from '../../game/collection/collection';
import { getStarterDeckUnlockProgress, type StarterUnlockProgress } from '../../game/collection/starterUnlock';
import type { OwnedMap } from '../../game/collection/types';
import { FACTION_LABEL } from '../heroes/collection';
import { getDeckStatus, type DeckStatus } from './deckStatus';

// The one place that decides how a deck should be described to the player. Five distinct kinds, each
// with its own status language, so a locked starter (progression content) never reads like a broken
// custom deck (rules problem):
//   starter-ready   a starter deck the player owns the cards for
//   starter-locked  a starter deck still waiting on cards - a goal, not an error
//   custom-ready    a legal custom deck
//   custom-draft    an unfinished custom deck ("still being built")
//   custom-invalid  a custom deck breaking copy limits or using cards the player doesn't own

export type DeckKind = 'starter-ready' | 'starter-locked' | 'custom-ready' | 'custom-draft' | 'custom-invalid';

export interface DeckPresentation {
  kind: DeckKind;
  status: DeckStatus;
  /** Set for starter decks only. */
  unlock: StarterUnlockProgress | null;
  /** Can be activated / fought with. */
  playable: boolean;
  /** Short line for banners and warnings. */
  message: string;
  /** What the plaque/seal counts: collected/total for a locked starter, cards in the deck otherwise. */
  progressText: string;
}

export function getDeckPresentation(deck: DeckOption, owned: OwnedMap = getCollection()): DeckPresentation {
  const status = getDeckStatus(deck.cardIds, owned);
  const unlock = getStarterDeckUnlockProgress(deck.id, owned);

  if (unlock) {
    if (!unlock.unlocked) {
      const faction = FACTION_LABEL[unlock.faction];
      return {
        kind: 'starter-locked',
        status,
        unlock,
        playable: false,
        message: `Collect the required ${faction} cards to unlock this deck.`,
        progressText: `${unlock.collected}/${unlock.total}`,
      };
    }
    return { kind: 'starter-ready', status, unlock, playable: status.valid, message: status.message, progressText: `${status.count}/${unlock.total}` };
  }

  const kind: DeckKind = status.state === 'ready' ? 'custom-ready' : status.state === 'building' ? 'custom-draft' : 'custom-invalid';
  return { kind, status, unlock: null, playable: status.valid, message: status.message, progressText: `${status.count}/${DECK_SIZE}` };
}

export const isLockedStarter = (p: DeckPresentation) => p.kind === 'starter-locked';
