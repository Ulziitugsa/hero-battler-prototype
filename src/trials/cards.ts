import type { CardDefinition } from '../game/types';
import { getCard, isExperimentalCardId, registerExperimentalCards } from '../game/cards';
import type { CombatAbility, CombatCard } from '../game/cardCombat/cards';
import { PIXEL_CARD_ART } from '../game/cards/pixelArt';

// Power Fantasy Phase 1 (docs/design/POWER-FANTASY-P1.md): the experimental cards. They exist only here. They are
// registered for one page load of the Arcane Trials experiment (and by tests) and are in no list the game reads: not
// the collection, a Box, the Deck Builder, a reference deck or an opponent. Their rules are the resolver's own
// experimental rules (cardCombat/cards.ts ExperimentalAction), so they resolve the same in any mode that would ever
// play them.
//
// Card text: each ability's text is the full card-text sentence (docs/CARD-TEXT.md register); card faces read it.

const ability = (trigger: CombatAbility['trigger'], actions: CombatAbility['actions'], text: string, extra: Partial<CombatAbility> = {}): CombatAbility => ({ trigger, actions, text, ...extra });

const unit = (card: Omit<CombatCard, 'type' | 'cost' | 'role'> & { role?: string }): CombatCard => ({ type: 'hero', cost: 0, role: 'Fighter', ...card });
const spell = (card: Omit<CombatCard, 'type' | 'cost' | 'role'>): CombatCard => ({ type: 'spell', cost: 0, role: 'Spell', ...card });

// ---- The Immortal Army ----------------------------------------------------------------------------------------------

export const DEATHLESS_LEGIONARY = unit({
  id: 'xp-deathless-legionary',
  name: 'Deathless Legionary',
  shortName: 'Legionary',
  faction: 'undead',
  rarity: 'rare',
  power: 3,
  tags: ['Undead', 'Skeleton', 'Experimental'],
  boardText: 'Undying 3: rises +30 stronger',
  abilities: [ability('ON_DEATH', [{ type: 'UNDYING', returns: 3, atkPerReturn: 30 }], 'Undying. When this is destroyed, it rises again in its lane, 30 ATK stronger each time (up to 3 times per battle).')],
});

export const MORDRATH = unit({
  id: 'xp-mordrath',
  name: 'Mordrath, the Endless King',
  shortName: 'Mordrath',
  faction: 'undead',
  rarity: 'legendary',
  power: 4,
  role: 'Commander',
  tags: ['Undead', 'Lich', 'Experimental'],
  boardText: 'Ally returns: both +45 (no limit)',
  abilities: [
    ability(
      'ON_ALLY_RETURN',
      [
        { type: 'EMPOWER', atk: 45, target: 'SELF' },
        { type: 'EMPOWER', atk: 45, target: 'RETURNED_ALLY' },
      ],
      'Whenever another of your Units returns from the Graveyard to play, this Unit and that Unit gain +45 ATK until the battle ends (no +45 limit).',
    ),
  ],
});

// ---- The Apocalypse -------------------------------------------------------------------------------------------------

export const ASHEN_HIEROPHANT = unit({
  id: 'xp-ashen-hierophant',
  name: 'Ashen Hierophant',
  shortName: 'Hierophant',
  faction: 'infernal',
  rarity: 'legendary',
  power: 5,
  role: 'Mage',
  tags: ['Demon', 'Mage', 'Experimental'],
  boardText: 'Conduit: your Spells spread',
  abilities: [ability('PASSIVE', [{ type: 'CONDUIT' }], 'Conduit. Your one-time Spells that affect the enemy Unit in their lane also affect the enemy Units in the lanes next to it.')],
});

export const CATACLYSM = spell({
  id: 'xp-cataclysm',
  name: 'Cataclysm',
  shortName: 'Cataclysm',
  faction: 'infernal',
  spellKind: 'ONE_TIME',
  rarity: 'epic',
  tags: ['Spell', 'Experimental'],
  boardText: 'Destroy ≤100, +50 per Spell before; 45',
  abilities: [
    ability('CAST', [{ type: 'DESTROY_SCALING', baseAtk: 100, atkPerSpell: 50, target: 'ENEMY_SAME_LANE' }], 'Destroy the enemy Unit in this lane if its ATK is 100 or less, plus 50 for each other Spell you cast earlier this round.'),
    ability('CAST', [{ type: 'PLAYER_DAMAGE', amount: 1 }], 'Deal 45 damage to the enemy player.'),
  ],
});

// ---- The Unstoppable Champion ---------------------------------------------------------------------------------------

export const AURELIAN = unit({
  id: 'xp-aurelian',
  name: 'Aurelian, the Unbroken',
  shortName: 'Aurelian',
  faction: 'kingdom',
  rarity: 'legendary',
  power: 2,
  role: 'Champion',
  tags: ['Knight', 'Experimental'],
  boardText: 'Round End: double ATK; Spell here: immune',
  abilities: [
    ability('ROUND_END', [{ type: 'MULTIPLY_ATK', factor: 2, target: 'SELF' }], 'At the end of each round, double this Unit’s ATK until the battle ends (up to 9,999).'),
    // The Crusader Champion's protection line, as data: an existing rule.
    ability('PASSIVE', [{ type: 'GRANT_IMMUNITY', immunity: 'SPELL', target: 'SELF' }], 'While your Spell is in this lane, enemy Spells can’t affect this Unit.', { conditions: [{ type: 'SELF_LANE_HAS_SPELL' }] }),
  ],
});

export const VOW_OF_THE_UNBROKEN = spell({
  id: 'xp-vow-unbroken',
  name: 'Vow of the Unbroken',
  shortName: 'Vow',
  faction: 'kingdom',
  spellKind: 'CONTINUOUS',
  spellBinding: 'UNIT',
  rarity: 'rare',
  tags: ['Spell', 'Experimental'],
  boardText: 'Attached: Shield each round',
  abilities: [ability('BEFORE_COMBAT', [{ type: 'GRANT_SHIELD', target: 'ALLY_SAME_LANE' }], 'Before lanes fight each round, the Unit with this Spell gains a Shield.')],
});

// ---- The counter ----------------------------------------------------------------------------------------------------

export const UNMAKING = spell({
  id: 'xp-unmaking',
  name: 'Unmaking',
  shortName: 'Unmaking',
  faction: 'kingdom',
  spellKind: 'ONE_TIME',
  rarity: 'rare',
  tags: ['Spell', 'Experimental'],
  boardText: 'Exile a grown enemy here',
  abilities: [
    ability('CAST', [{ type: 'UNMAKE', target: 'ENEMY_SAME_LANE', onlyIfGrown: true }], 'If the enemy Unit in this lane has more ATK than its printed ATK, exile it: it leaves play without being destroyed. No Shield saves it, no Destroyed effect happens and it never reaches the Graveyard.'),
  ],
});

export const EXPERIMENTAL_CARDS: readonly CombatCard[] = [DEATHLESS_LEGIONARY, MORDRATH, ASHEN_HIEROPHANT, CATACLYSM, AURELIAN, VOW_OF_THE_UNBROKEN, UNMAKING];

/** Existing portraits the experimental cards borrow (still frames, like the launch set's shared art). */
const ART: Record<string, string> = {
  'xp-deathless-legionary': 'und-bone-soldier',
  'xp-mordrath': 'und-vharos',
  'xp-ashen-hierophant': 'inf-ignis',
  'xp-cataclysm': 'spl-fireball',
  'xp-aurelian': 'kng-common-knight',
  'xp-vow-unbroken': 'spl-aegis-ward',
  'xp-unmaking': 'spl-soul-burn',
};

/** Makes the experimental cards playable for this page load (idempotent). */
export function registerTrialCards(): void {
  if (isExperimentalCardId(EXPERIMENTAL_CARDS[0].id)) return;
  registerExperimentalCards(EXPERIMENTAL_CARDS as unknown as CardDefinition[]);
  for (const [id, source] of Object.entries(ART)) {
    const asset = PIXEL_CARD_ART[source] ?? PIXEL_CARD_ART[getCard(source).id];
    if (asset) PIXEL_CARD_ART[id] = { ...asset, frames: 1 };
  }
}
