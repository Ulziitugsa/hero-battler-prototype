import type { CardDefinition } from '../types';

// Lightweight, loud-failure validator for CardDefinition shape (README "Card Definition Validation").
// Not exhaustive type-checking (TypeScript already owns that at compile time) - this exists to catch
// the mistakes TypeScript can't: a missing id, an empty name, a Hero with no Power, a Spell with no
// spellKind. Run by a test that loads every card in the game (see cards/validate.test.ts) so a bad
// definition fails the test suite immediately during development, not at runtime in the browser.

export function validateCardDefinition(card: CardDefinition): string[] {
  const errors: string[] = [];
  const label = card.id || card.name || '<unknown card>';

  if (!card.id) errors.push(`${label}: missing id`);
  if (!card.name) errors.push(`${label}: missing name`);
  if (!card.shortName) errors.push(`${label}: missing shortName`);
  if (!card.faction) errors.push(`${label}: missing faction`);
  if (!card.rarity) errors.push(`${label}: missing rarity`);
  if (!card.abilities) errors.push(`${label}: missing abilities array`);
  if (!Array.isArray(card.tags)) errors.push(`${label}: missing tags array`);

  if (card.type === 'hero') {
    if (card.power === undefined || card.power === null) errors.push(`${label}: Hero missing Power`);
    else if (card.power < 0) errors.push(`${label}: Hero has negative Power`);
    if (card.spellKind !== undefined) errors.push(`${label}: Hero should not have a spellKind`);
  } else if (card.type === 'spell') {
    if (!card.spellKind) errors.push(`${label}: Spell missing spellKind`);
    if (card.power !== undefined) errors.push(`${label}: Spell should not have Power`);
  } else {
    errors.push(`${label}: unknown card type ${String(card.type)}`);
  }

  for (const ability of card.abilities ?? []) {
    if (!ability.trigger) errors.push(`${label}: ability missing trigger`);
    if (!ability.text) errors.push(`${label}: ability missing player-facing text`);
    if (!ability.actions || ability.actions.length === 0) errors.push(`${label}: ability has no actions`);
  }

  return errors;
}

export function validateAllCards(cards: CardDefinition[]): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  for (const card of cards) {
    errors.push(...validateCardDefinition(card));
    if (seenIds.has(card.id)) errors.push(`Duplicate card id: ${card.id}`);
    seenIds.add(card.id);
  }
  return errors;
}
