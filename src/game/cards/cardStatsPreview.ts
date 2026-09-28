import type { CardDefinition } from '../types/index.js';

export function cardStatsPreviewEnabled(): boolean {
  return import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('cardPreview') === '1';
}

/**
 * Temporary card-frame values for the card-design preview. These are a linear translation of the
 * existing Power bands into the proposed two-stat shape, not production combat numbers. Combat and
 * deck Life remain unchanged until the card-combat simulation and a separate migration are approved.
 */
export interface CardStatsPreview {
  atk: number;
  lp: number;
}

export function cardStatsPreview(card: CardDefinition, effectivePower = card.power): CardStatsPreview | null {
  if (card.type !== 'hero') return null;
  const basePower = Math.max(1, card.power ?? 1);
  const power = Math.max(1, effectivePower ?? basePower);
  return {
    atk: 40 + 15 * power,
    lp: Math.max(45, 145 - 10 * basePower),
  };
}

export function deckLifePreview(cards: readonly CardDefinition[]): number {
  return cards.reduce((life, card) => life + (cardStatsPreview(card)?.lp ?? 0), 0);
}
