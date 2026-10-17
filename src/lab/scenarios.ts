import type { GameEvent, GameState, HandCard, HeroInstance, LaneId, Side, SpellZoneInstance } from '../game/types';
import { createCardMatch } from '../game/cardCombat/engine';
import { getCombatCard } from '../game/cardCombat/cards';
import { cardAtk } from '../game/cardCombat/engine';
import { getLaunchDeck, launchDeckList } from '../game/cards/launchDecks';
import type { ArchetypeBoxId } from '../game/cards/launchRoster';

// Card Discovery Lab: arranged combination tests. Each one sets up a board, a hand and a Graveyard so one of the
// archetype's signature combinations is available this round, then hands the position to the real battle screen and
// the real resolver. Nothing about the outcome is scripted: the player makes the play (or a different one), the
// resolver decides, and the opponent's AI plays its own cards from the next round on. scenarios.test.ts plays each
// suggested play through resolveCardRound and pins what the "What should happen" text says.
//
// What is arranged, every time:
//   - both decks are the named reference decks (launchDecks.ts) minus the cards placed in hand, on the board or in the
//     Graveyard, so Starting HP is each full deck's own;
//   - the Units already on the board entered the round before, so "from the round after you play it" lines are live;
//   - the opponent holds no cards in the arranged round, so the combination resolves against a fixed board; it draws
//     normally from the next round, and the battle continues as an ordinary match.

export interface ArrangedUnit {
  cardId: string;
  /** Stored ATK, when the arrangement says earlier rounds already changed it (Wither). */
  atk?: number;
  /** It has lost ATK "until the battle ends" before (Wither's Plague Mother reads this). */
  lastingLoss?: boolean;
}

export interface ArrangedSide {
  deck: string;
  board: Partial<Record<LaneId, ArrangedUnit>>;
  /** Continuous Spells in play; `attached` binds an Attached Spell to the Unit in its lane. */
  spells?: Partial<Record<LaneId, { cardId: string; attached?: boolean }>>;
  hand: string[];
  graveyard?: string[];
}

export interface LabScenario {
  id: string;
  archetype: ArchetypeBoxId;
  title: string;
  /** The combination's idea, from the cards' own rules. */
  idea: string;
  /** Cards to inspect before playing. */
  cards: string[];
  /** Which cards are not in the archetype's optimised list (borrowed from its Box). */
  borrowed?: string[];
  /** What is arranged beyond the defaults above. */
  arranged: string;
  /** The suggested play, in the player's words. */
  steps: string;
  /** The suggested play, for the test. */
  play: { cardId: string; lane: LaneId }[];
  /** What the resolver does with the suggested play (pinned by scenarios.test.ts). */
  expected: string;
  round: number;
  seed: number;
  player: ArrangedSide;
  enemy: ArrangedSide;
}

export const LAB_SCENARIOS: readonly LabScenario[] = [
  {
    id: 'arcane-echo',
    archetype: 'arcane',
    title: 'Vael’s spell storm',
    idea: 'Archmage Vael makes the first one-time Spell each round happen twice, and deals 90 when you cast a second Spell. Arcane Bolt deals 135, plus 90 more if you already cast a Spell this round.',
    cards: ['kng-archmage-vael', 'spl-arcane-bolt', 'spl-mirror-image'],
    arranged: 'Vael is in play (center). Two Arcane Bolts and a Mirror Image are in your hand.',
    steps: 'Put an Arcane Bolt in the left Spell slot and the other in the right Spell slot, then Fight.',
    play: [
      { cardId: 'spl-arcane-bolt', lane: 'left' },
      { cardId: 'spl-arcane-bolt', lane: 'right' },
    ],
    expected: 'The left Bolt resolves twice (135 + 135). The right Bolt is your second Spell: 135 + 90. Vael adds 90 for the second Spell. 585 damage before a single clash.',
    round: 2,
    seed: 101,
    player: { deck: 'arcane', board: { center: { cardId: 'kng-archmage-vael' } }, hand: ['spl-arcane-bolt', 'spl-arcane-bolt', 'spl-mirror-image'] },
    enemy: { deck: 'kingdom-starter', board: { left: { cardId: 'kng-shieldbearer' }, right: { cardId: 'kng-common-knight' } }, hand: [] },
  },
  {
    id: 'bone-legion-morwen',
    archetype: 'bone-legion',
    title: 'Morwen raises the line',
    idea: 'Morwen revives your weakest Undead Unit from the Graveyard into an empty lane before lanes fight. Bone Dragon and Bone Soldier get +15 ATK for each Unit in your Graveyard (up to +45).',
    cards: ['und-morwen', 'und-bone-dragon', 'und-bone-soldier'],
    arranged: 'Bone Dragon (left) and Morwen (center) are in play; your right lane is empty. Bone Soldier, Crypt Warden and Cursed Warrior are in your Graveyard.',
    steps: 'Put Power Surge in the left Spell slot (on Bone Dragon). Leave the right lane empty for Morwen, then Fight.',
    play: [{ cardId: 'spl-power-surge', lane: 'left' }],
    expected: 'Bone Dragon counts 3 Units in the Graveyard (+45) and Power Surge adds +45: 182 ATK. Morwen then revives Bone Soldier into the empty right lane, and it fights the same round with +30 (2 Units left in the Graveyard).',
    round: 2,
    seed: 202,
    player: { deck: 'bone-legion', board: { left: { cardId: 'und-bone-dragon' }, center: { cardId: 'und-morwen' } }, hand: ['spl-power-surge', 'und-bonecaller', 'und-mira'], graveyard: ['und-bone-soldier', 'und-crypt-warden', 'und-cursed-warrior'] },
    enemy: { deck: 'kingdom-starter', board: { left: { cardId: 'kng-royal-guard' }, center: { cardId: 'kng-light-priest' }, right: { cardId: 'kng-shieldbearer' } }, hand: [] },
  },
  {
    id: 'bloodbound-pact',
    archetype: 'bloodbound',
    title: 'Blood Pact sacrifice',
    idea: 'Blood Pact destroys your own Unit, then the enemy Unit in its lane. Kathra grows when an ally falls and deals 45 when your own card destroyed it. Blood Imp, when destroyed, gives your other Units +15 ATK for the rest of the battle.',
    cards: ['spl-blood-pact', 'inf-kathra', 'inf-blood-imp'],
    borrowed: ['spl-blood-pact'],
    arranged: 'Blood Imp (left) and Kathra (center) are in play. Blood Pact is in your hand: it is a Bloodbound Box card that the optimised Bloodbound list does not run.',
    steps: 'Put Blood Pact in the left Spell slot, then Fight.',
    play: [{ cardId: 'spl-blood-pact', lane: 'left' }],
    expected: 'Blood Pact destroys your Blood Imp: Kathra gains +15 from Blood Imp and +15 from Ally Falls (145 ATK) and deals 45. Then it destroys the enemy Common Knight. Kathra beats Royal Guard in the center.',
    round: 2,
    seed: 303,
    player: { deck: 'bloodbound', board: { left: { cardId: 'inf-blood-imp' }, center: { cardId: 'inf-kathra' } }, hand: ['spl-blood-pact', 'inf-soot-imp'] },
    enemy: { deck: 'kingdom-starter', board: { left: { cardId: 'kng-common-knight' }, center: { cardId: 'kng-royal-guard' }, right: { cardId: 'kng-shieldbearer' } }, hand: [] },
  },
  {
    id: 'wither-plague',
    archetype: 'wither',
    title: 'The Plague Mother’s spread',
    idea: 'At Round End the Plague Mother gives the enemy in its lane −15 ATK until the battle ends, and −15 more to every other enemy that has already lost ATK that way. A Unit at 35 ATK or less is destroyed.',
    cards: ['und-plague-mother', 'und-blightcaster', 'spl-cursed-ground'],
    arranged: 'Plague Mother (center) and Blightcaster (right) are in play. Earlier Wither effects have already taken the enemy Common Knight (left) down to 50 ATK.',
    steps: 'Put Cursed Ground in the center Spell slot (under the Plague Mother), then Fight.',
    play: [{ cardId: 'spl-cursed-ground', lane: 'center' }],
    expected: 'Cursed Ground (+15) and her Guard (+15) lift the Plague Mother past Royal Guard, and Cursed Ground grows her +15 for each enemy that falls. At Round End her spread takes the worn Common Knight to 35 ATK, which destroys it, and Blightcaster gives Light Priest −15 for good.',
    round: 4,
    seed: 404,
    player: { deck: 'wither', board: { center: { cardId: 'und-plague-mother' }, right: { cardId: 'und-blightcaster' } }, hand: ['spl-cursed-ground', 'und-grave-knight'] },
    enemy: { deck: 'kingdom-starter', board: { left: { cardId: 'kng-common-knight', atk: 50, lastingLoss: true }, center: { cardId: 'kng-royal-guard' }, right: { cardId: 'kng-light-priest' } }, hand: [] },
  },
  {
    id: 'phantoms-bypass',
    archetype: 'phantoms',
    title: 'Phantoms slip past',
    idea: 'While you have a Continuous Spell in play, Tricksters attack the enemy player directly from the round after they are played (Bypass). The enemy Unit facing them does not clash with them. Wraith Prince and Duchess Nyx grow +15 each time they hit directly (up to +45).',
    cards: ['und-duchess-nyx', 'und-wraith-prince', 'spl-cursed-ground'],
    arranged: 'Wraith Prince (left) and Duchess Nyx (center) are in play, and Cursed Ground is in your center Spell slot.',
    steps: 'Put Weakness in the right Spell slot (on the enemy Common Knight), then Fight.',
    play: [{ cardId: 'spl-weakness', lane: 'right' }],
    expected: 'Wraith Prince (15 less ATK when it bypasses) and Duchess Nyx (+15 from Cursed Ground) both hit you past Royal Guard and Paladin, and both grow +15. Those blockers do nothing this round.',
    round: 2,
    seed: 505,
    player: { deck: 'phantoms', board: { left: { cardId: 'und-wraith-prince' }, center: { cardId: 'und-duchess-nyx' } }, spells: { center: { cardId: 'spl-cursed-ground' } }, hand: ['spl-weakness', 'und-spectral-assassin', 'und-bone-soldier'] },
    enemy: { deck: 'kingdom-starter', board: { left: { cardId: 'kng-royal-guard' }, center: { cardId: 'kng-paladin' }, right: { cardId: 'kng-common-knight' } }, hand: [] },
  },
  {
    id: 'hellfire-burn',
    archetype: 'hellfire',
    title: 'Hellfire burn round',
    idea: 'Hellfire Units deal damage whenever you cast: Ember Witch 45 (once a round), Hellfire Warlock 90 on your second Spell, Infernal Lord 45 at Round End if you cast. The Spells hit too: Meteor, Inferno, Arcane Bolt.',
    cards: ['inf-hellfire-warlock', 'inf-ember-witch', 'inf-infernal-lord', 'spl-meteor', 'spl-inferno', 'spl-arcane-bolt'],
    arranged: 'Hellfire Warlock (left), Ember Witch (center) and Infernal Lord (right) are in play. Meteor, Inferno and Arcane Bolt are in your hand.',
    steps: 'Meteor in the left Spell slot, Inferno in the center, Arcane Bolt in the right, then Fight.',
    play: [
      { cardId: 'spl-meteor', lane: 'left' },
      { cardId: 'spl-inferno', lane: 'center' },
      { cardId: 'spl-arcane-bolt', lane: 'right' },
    ],
    expected: 'Meteor destroys Kingdom Archer and deals 90; Ember Witch 45; Inferno 45 and −15 ATK to every enemy for good; Warlock 90 for the second Spell; Arcane Bolt 225; Infernal Lord 45 at Round End.',
    round: 2,
    seed: 606,
    player: { deck: 'hellfire', board: { left: { cardId: 'inf-hellfire-warlock' }, center: { cardId: 'inf-ember-witch' }, right: { cardId: 'inf-infernal-lord' } }, hand: ['spl-meteor', 'spl-inferno', 'spl-arcane-bolt'] },
    enemy: { deck: 'kingdom-starter', board: { left: { cardId: 'kng-archer' }, center: { cardId: 'kng-shieldbearer' }, right: { cardId: 'kng-common-knight' } }, hand: [] },
  },
  {
    id: 'crusade-aveline',
    archetype: 'crusade',
    title: 'Saint Aveline keeps the blade',
    idea: 'An Attached Spell goes to the Graveyard when its Unit leaves play. Saint Aveline returns it to your hand instead (once a round), and gets +15 ATK this round whenever you cast a Spell.',
    cards: ['kng-saint-aveline', 'spl-reliquary-blade', 'kng-banner-knight', 'spl-oath-blade'],
    arranged: 'Saint Aveline (left) and Banner Knight (center, carrying Reliquary Blade) are in play. The enemy Common Knight in the center carries a Battle Banner.',
    steps: 'Put Oath Blade in the left Spell slot (it attaches to Aveline), then Fight.',
    play: [{ cardId: 'spl-oath-blade', lane: 'left' }],
    expected: 'Banner Knight (134) loses to the bannered Common Knight (143). Reliquary Blade leaves play with it, and Aveline returns it to your hand for next round.',
    round: 2,
    seed: 707,
    player: { deck: 'crusade', board: { left: { cardId: 'kng-saint-aveline' }, center: { cardId: 'kng-banner-knight' } }, spells: { center: { cardId: 'spl-reliquary-blade', attached: true } }, hand: ['spl-oath-blade', 'spl-consecrate', 'kng-knight-errant'] },
    enemy: { deck: 'kingdom-starter', board: { left: { cardId: 'kng-shieldbearer' }, center: { cardId: 'kng-common-knight' } }, spells: { center: { cardId: 'spl-battle-banner', attached: true } }, hand: [] },
  },
  {
    id: 'vanguard-line',
    archetype: 'vanguard',
    title: 'The full Knight line',
    idea: 'With three Units: Marshal Aldric gives your other Units +15, Knight-Errant gets +15 per other Knight, Battle Captain gives its neighbours +15, and War Cry gives +15 and +15 more. All this round.',
    cards: ['kng-marshal-aldric', 'kng-knight-errant', 'kng-battle-captain', 'spl-war-cry'],
    arranged: 'Knight-Errant (left), Marshal Aldric (center) and Battle Captain (right) are in play against Vharos, Ghoul Brute and Crypt Warden.',
    steps: 'Put War Cry in any Spell slot, then Fight.',
    play: [{ cardId: 'spl-war-cry', lane: 'center' }],
    expected: 'Knight-Errant 96 → 171, Aldric 105 → 150, Battle Captain 102 → 147: all three clashes won, Vharos (130) included. Vharos comes straight back at 95 ATK (his own Destroyed line) and Crypt Warden survives on its Shield.',
    round: 2,
    seed: 808,
    player: { deck: 'vanguard', board: { left: { cardId: 'kng-knight-errant' }, center: { cardId: 'kng-marshal-aldric' }, right: { cardId: 'kng-battle-captain' } }, hand: ['spl-war-cry', 'spl-consecrate', 'spl-power-surge'] },
    enemy: { deck: 'undead-starter', board: { left: { cardId: 'und-vharos' }, center: { cardId: 'und-ghoul-brute' }, right: { cardId: 'und-crypt-warden' } }, hand: [] },
  },
  {
    id: 'hellpack-pups',
    archetype: 'hellpack',
    title: 'The pack refills',
    idea: 'Ash Jackal gets +30 per Beast next to it, Alpha Hound +15 per other Unit, Brimstone Matriarch +15 with three Units, and when the Matriarch is destroyed it leaves a Hound Pup (65 ATK) in an empty lane.',
    cards: ['inf-ash-jackal', 'inf-brimstone-matriarch', 'inf-alpha-hound', 'spl-power-surge'],
    arranged: 'Ash Jackal (left), Brimstone Matriarch (center) and Alpha Hound (right) are in play against Ghoul Brute, Vharos and Crypt Warden.',
    steps: 'Put Power Surge in the left Spell slot (on Ash Jackal), then Fight.',
    play: [{ cardId: 'spl-power-surge', lane: 'left' }],
    expected: 'Ash Jackal 84 → 159 and Alpha Hound 93 → 123 win their lanes. The Matriarch (122) loses to Vharos and leaves a Hound Pup in the center.',
    round: 2,
    seed: 909,
    player: { deck: 'hellpack', board: { left: { cardId: 'inf-ash-jackal' }, center: { cardId: 'inf-brimstone-matriarch' }, right: { cardId: 'inf-alpha-hound' } }, hand: ['spl-power-surge', 'spl-war-cry', 'inf-hellhound'] },
    enemy: { deck: 'undead-starter', board: { left: { cardId: 'und-ghoul-brute' }, center: { cardId: 'und-vharos' }, right: { cardId: 'und-crypt-warden' } }, hand: [] },
  },
];

export function getScenario(id: string): LabScenario {
  const s = LAB_SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown lab scenario: ${id}`);
  return s;
}

const SIDES: Side[] = ['player', 'enemy'];
const LANES: LaneId[] = ['left', 'center', 'right'];

/** `deck` minus one copy of each card in `used` that it holds (cards it doesn't hold were borrowed). */
function without(deck: readonly string[], used: readonly string[]): string[] {
  const rest = [...deck];
  for (const id of used) {
    const i = rest.indexOf(id);
    if (i >= 0) rest.splice(i, 1);
  }
  return rest;
}

function unit(side: Side, lane: LaneId, arranged: ArrangedUnit, round: number): HeroInstance {
  const card = getCombatCard(arranged.cardId);
  const printed = cardAtk(arranged.cardId);
  return {
    instanceId: `lab-h-${side}-${lane}`,
    cardId: card.id,
    faction: card.faction,
    name: card.name,
    shortName: card.shortName,
    power: arranged.atk ?? printed,
    tempPower: 0,
    shielded: false,
    silenced: false,
    usedThisRound: false,
    enteredRound: round - 1,
    entryAtk: printed,
    ...(arranged.lastingLoss ? { lastingLoss: true } : {}),
  };
}

/**
 * The arranged position, ready for the battle screen: a real card match (createCardMatch, so Starting HP and the seeded
 * RNG are the engine's own) with its hands, boards, Spell zones and Graveyards set as the scenario says. Deterministic.
 */
export function buildScenario(scenario: LabScenario): { state: GameState; events: GameEvent[] } {
  const decks: Record<Side, string[]> = { player: launchDeckList(getLaunchDeck(scenario.player.deck)), enemy: launchDeckList(getLaunchDeck(scenario.enemy.deck)) };
  const state = structuredClone(createCardMatch({ seed: scenario.seed, playerDeck: decks.player, enemyDeck: decks.enemy }).nextState);
  state.round = scenario.round;
  for (const side of SIDES) {
    const spec = scenario[side];
    const p = state[side];
    const placed = LANES.flatMap((lane) => [spec.board[lane]?.cardId, spec.spells?.[lane]?.cardId]).filter((id): id is string => !!id);
    // The match already drew three cards; they go back, and the deck is the full list minus what the scenario uses,
    // in the engine's own shuffled order.
    const shuffled = [...p.hand.map((h) => h.cardId), ...p.deck];
    p.deck = without(shuffled, [...placed, ...spec.hand, ...(spec.graveyard ?? [])]);
    state.cardCombat!.deckMarks[side] = p.deck.map(() => false);
    p.hand = spec.hand.map((cardId, i): HandCard => ({ handId: `lab-hand-${side}-${i}`, cardId }));
    p.graveyard = [...(spec.graveyard ?? [])];
    state.cardCombat!.graveMarks[side] = p.graveyard.map(() => false);
    for (const lane of LANES) {
      const arranged = spec.board[lane];
      p.heroZones[lane] = arranged ? unit(side, lane, arranged, scenario.round) : null;
      const spell = spec.spells?.[lane];
      if (!spell) {
        p.spellZones[lane] = null;
        continue;
      }
      const card = getCombatCard(spell.cardId);
      const zone: SpellZoneInstance = { instanceId: `lab-s-${side}-${lane}`, cardId: card.id, faction: card.faction, name: card.name, shortName: card.shortName, usedThisRound: false };
      if (spell.attached && p.heroZones[lane]) zone.boundTo = p.heroZones[lane]!.instanceId;
      p.spellZones[lane] = zone;
    }
  }
  return { state, events: [{ type: 'ROUND_START', round: scenario.round }] };
}
