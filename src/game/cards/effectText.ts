import type { AbilityDefinition, CardDefinition, Trigger } from '../types/index.js';
import { atkDelta, atkFromPower } from './cardFace.js';

// The full rules wording of every card as the live card files define it (one sentence per ability), and the timing
// vocabulary every card surface shares. The legacy resolver plays these definitions; card combat plays its own
// approved versions (cardCombat/cards.ts) and reads its wording from cardCombat/cardText.ts, which falls back to this
// module wherever the two agree. Card faces, the focus panel and Card Inspect never read this directly: they read
// cardPresentation.ts, which pairs every full line with its short battle line. The engine's own `abilities[].text`
// stays as it is; nothing player-facing reads it.
//
// Rules for the copy:
// - one line per ability, in the same order as `card.abilities`;
// - "Unit", never "Hero"; ATK, never Power (1 Power = 15 ATK, see cardFace.ts);
// - durations are "this round" (until the round ends) or "for the rest of the battle";
// - "Once per round" is added by the UI from `oncePerRound`, so the copy does not repeat it.

/**
 * Timing labels, the same on every surface: printed in small caps before each effect on a card ("CLASH", "ROUND END"),
 * in the focus panel, in Card Inspect and in the battle log. The card-text standard (docs/CARD-TEXT.md): one label per
 * effect, from this list or a keyword ("Guard 2", "Shield").
 */
export const TIMING_LABEL: Record<Trigger, string> = {
  ON_PLAY: 'On Play', // legacy resolver only; no card-combat card uses it
  CAST: 'Cast',
  ROUND_START: 'Round Start',
  BEFORE_COMBAT: 'Clash',
  AFTER_COMBAT: 'After Clash',
  ON_DEATH: 'Destroyed',
  ON_ALLY_DEATH: 'Ally Falls',
  ON_ENEMY_DEATH: 'Enemy Falls',
  ON_DIRECT_DAMAGE: 'Direct Attack',
  ROUND_END: 'Round End',
  ON_ALLY_SPELL_PLAYED: 'When you cast a Spell',
  ON_ENEMY_SPELL_PLAYED: 'When the enemy casts a Spell',
  CONTINUOUS: 'Passive',
  PASSIVE: 'Passive',
};

/** What each timing label means (Card Inspect, tooltips). Short, plain sentences: the glossary's own words. */
export const TIMING_HELP: Record<Trigger, string> = {
  ON_PLAY: 'When this card is played.',
  CAST: 'Happens once, when this Spell is cast.',
  ROUND_START: 'Happens at the start of each round.',
  BEFORE_COMBAT: 'Happens each round, just before the lanes fight.',
  AFTER_COMBAT: 'Happens each round, right after the lanes fight.',
  ON_DEATH: 'Happens when this Unit is destroyed: it loses or ties a fight, or an effect destroys it.',
  ON_ALLY_DEATH: 'Happens when one of your other Units is destroyed.',
  ON_ENEMY_DEATH: 'Happens when an enemy Unit is destroyed.',
  ON_DIRECT_DAMAGE: 'Happens when this Unit hits the enemy player directly.',
  ROUND_END: 'Happens at the end of each round.',
  ON_ALLY_SPELL_PLAYED: 'Happens each time you cast a Spell.',
  ON_ENEMY_SPELL_PLAYED: 'Happens each time the enemy casts a Spell.',
  CONTINUOUS: 'Always on while this Spell is in play.',
  PASSIVE: 'Always on while this Unit is in play.',
};

export type EffectKeyword =
  | 'Shield'
  | 'Guard'
  | 'Spell Immune'
  | 'Silence'
  | 'Bypass'
  | 'Summon'
  | 'Token'
  | 'Revive'
  | 'Exile'
  | 'Graveyard'
  | 'Spell in play'
  | 'Lane Spell'
  | 'Attached Spell';

export const KEYWORD_HELP: Record<EffectKeyword, string> = {
  Shield: 'This Unit survives destruction once.',
  Guard: 'If this Unit would lose its lane, it gets ATK this round. Guard 1 = +15. Guard 2 = +30.',
  'Spell Immune': 'Enemy Spells can’t affect this Unit.',
  Silence: 'The Unit’s effects do nothing this round. Its Shield still works.',
  Bypass: 'This Unit skips the fight and attacks the enemy player directly.',
  Summon: 'Put a new token Unit into one of your empty lanes.',
  Token: 'A Unit made during battle. It vanishes when destroyed and never goes to the Graveyard.',
  Revive: 'Move a Unit from your Graveyard into a lane.',
  Exile: 'Remove a card from the Graveyard for the rest of the battle.',
  Graveyard: 'Where your destroyed Units and used Spells go. A card can come back from it once per battle.',
  'Spell in play': 'A Lane Spell or Attached Spell on the battlefield.',
  'Lane Spell': 'Stays in its lane and works every round until it is destroyed.',
  'Attached Spell': 'A Spell placed on a Unit. It stays while that Unit stays.',
};

/**
 * The card words, defined once (How to Play, docs/CARD-TEXT.md): the timing labels, the keywords and the durations every
 * card text uses. Short definitions in plain words.
 */
export const CARD_GLOSSARY: readonly { term: string; text: string }[] = [
  { term: 'Passive', text: 'Always on while this card is in play.' },
  { term: 'Clash', text: TIMING_HELP.BEFORE_COMBAT },
  { term: 'Round Start', text: TIMING_HELP.ROUND_START },
  { term: 'Round End', text: TIMING_HELP.ROUND_END },
  { term: 'Destroyed', text: TIMING_HELP.ON_DEATH },
  { term: 'Ally Falls', text: TIMING_HELP.ON_ALLY_DEATH },
  { term: 'Enemy Falls', text: TIMING_HELP.ON_ENEMY_DEATH },
  { term: 'Direct Attack', text: TIMING_HELP.ON_DIRECT_DAMAGE },
  { term: 'Graveyard', text: KEYWORD_HELP.Graveyard },
  { term: 'Shield', text: KEYWORD_HELP.Shield },
  { term: 'Guard', text: KEYWORD_HELP.Guard },
  { term: 'Lane Spell', text: KEYWORD_HELP['Lane Spell'] },
  { term: 'Attached Spell', text: KEYWORD_HELP['Attached Spell'] },
  { term: 'Spell in play', text: KEYWORD_HELP['Spell in play'] },
  { term: 'Summon', text: KEYWORD_HELP.Summon },
  { term: 'Revive', text: KEYWORD_HELP.Revive },
  { term: 'Exile', text: KEYWORD_HELP.Exile },
  { term: 'Bypass', text: KEYWORD_HELP.Bypass },
  { term: 'Damage', text: 'Damage hits the enemy player, unless the card names a Unit.' },
  { term: 'Next to this', text: 'In the lane beside this card (left or right).' },
  { term: 'If losing', text: 'If this Unit would lose its lane in the fight.' },
  { term: 'Silence', text: KEYWORD_HELP.Silence },
  { term: 'this round', text: 'Until the round ends.' },
  { term: 'for the rest of the battle', text: 'Until the battle ends or this Unit leaves play. A Unit can grow by at most +45 ATK this way.' },
  { term: 'for the battle', text: 'Card faces say this for “for the rest of the battle”.' },
  { term: 'once per round', text: 'At most one time each round.' },
  { term: 'once per battle', text: 'Only the first time in each battle.' },
];

const MINUS = '−';
/** "+30 ATK" / "−45 ATK" for a Power change. */
const atk = (powerDelta: number) => `${powerDelta < 0 ? MINUS : '+'}${Math.abs(atkDelta(powerDelta))} ATK`;
/** "100 ATK" for an absolute Power value. */
const atkIs = (power: number) => `${atkFromPower(power)} ATK`;

/** Full rules, one sentence per ability, index-aligned with `card.abilities`. */
const COPY: Record<string, string[]> = {
  // ---- Kingdom ----------------------------------------------------------------------------------
  'kng-archer': [`If your Continuous Spell is in this lane, gain ${atk(2)} this round.`],
  'kng-royal-guard': [`Adjacent allied Units gain ${atk(1)} for the rest of the battle.`, 'While another Kingdom Unit is in play, enemy Spells can’t affect this Unit.'],
  'kng-light-priest': ['Restore 3 HP to your player.', 'This Unit gains a Shield.', `Gain ${atk(1)} this round.`],
  'kng-battle-captain': [`All allied Units gain ${atk(1)} this round.`, 'While another Knight is in play, enemy Unit effects can’t affect this Unit.'],
  'kng-paladin': ['This Unit gains a Shield.', `If this Unit would lose its lane, gain ${atk(4)} this round.`, 'If this Unit loses its lane, you take 2 less damage from it.'],
  'kng-apprentice-mage': [`Gain ${atk(2)} this round.`],
  'kng-archmage-vael': ['The first one-time Spell you cast each round resolves twice.', 'The second time you cast a Spell in a round, deal 2 damage to the enemy player.'],
  'kng-spellbreaker': [`Gain ${atk(2)} this round.`],
  'kng-null-templar': ['The first enemy Spell that would affect this Unit each round has no effect.'],
  'spl-power-surge': [`Your Unit in this lane gains ${atk(3)} this round.`],
  'spl-war-cry': [`All allied Units gain ${atk(2)} this round.`, `If you control 2 or more Kingdom Units, all allied Units gain an extra ${atk(1)} this round.`],
  'spl-dispel': ['Destroy the enemy Continuous Spell in this lane.'],
  'spl-battle-banner': [`Your Unit in this lane has ${atk(2)}.`],
  'spl-fortify': [`Your Unit in this lane gains ${atk(1)} for the rest of the battle.`],
  'spl-aegis-ward': ['Prevent the next damage you would take this round.'],
  'spl-ward-circle': ['Summon a Ward token in up to 2 of your empty lanes.'],
  'spl-giants-bane': ['If the enemy controls more Units than you, destroy the enemy Unit in this lane.'],

  // ---- Undead -----------------------------------------------------------------------------------
  'und-bone-soldier': ['Shuffle this card back into your deck.', `Gain ${atk(1)} this round for each card in your Graveyard.`],
  'und-cursed-warrior': ['Return this card to your hand.'],
  'und-dark-priest': [`Gain ${atk(1)} for the rest of the battle.`, `If your Graveyard has 3 or more cards, gain ${atk(2)} this round.`],
  'und-grave-knight': [`Gain ${atk(1)} for the rest of the battle.`, 'Restore 2 HP to your player.'],
  'und-mira': ['If your hand has 4 or fewer cards, return your weakest Undead Unit from your Graveyard to your hand.', 'While your Graveyard has 3 or more Undead Units, enemy Unit effects can’t affect this Unit.'],
  'und-vharos': [`Revive this Unit in the same lane with ${atkIs(4)}.`, 'Also return a random Undead Unit from your Graveyard to your hand.'],
  'und-grave-sage': ['If your hand has 3 or more cards, draw a card.', 'The second time you cast a Spell in a round, adjacent allied Units gain a Shield.'],
  'und-shade-thief': ['Bypass: while you control a Continuous Spell, this Unit skips the clash and attacks the enemy player directly at full ATK. Starts the round after it is played.'],
  'und-wraith-prince': [
    `Bypass: while you control a Continuous Spell, this Unit skips the clash and attacks the enemy player directly with ${atk(-1)}. Starts the round after it is played.`,
    `Gain ${atk(1)} for the rest of the battle.`,
  ],
  'und-crypt-warden': ['If your Graveyard has 2 or more cards, this Unit gains a Shield.'],
  'spl-second-chance': ['Return the strongest Unit in your Graveyard to your hand.'],
  'spl-raise-fallen': ['If your Graveyard has 3 or more Undead Units, revive the weakest one into this lane.'],
  'spl-grave-totem': ['The first allied Unit destroyed in this lane each round returns to your hand.'],
  'spl-cursed-ground': [`Your Unit in this lane gains ${atk(1)} for the rest of the battle.`],
  'spl-hush': ['Silence the enemy Unit in this lane for the rest of the round.'],
  'spl-stasis-field': ['The enemy Unit in this lane can’t fight this round, so no clash happens here.'],

  // ---- Infernal ---------------------------------------------------------------------------------
  'inf-flame-imp': ['Deal 1 extra damage to the enemy player.'],
  'inf-cultist': [`Gain ${atk(1)} this round.`],
  'inf-pit-fiend': ['Deal 2 damage to the enemy player.', `If an enemy Unit was destroyed this round, gain ${atk(2)} this round.`],
  'inf-hellhound': ['Silence the enemy Unit in this lane for the rest of the round.', `The enemy Unit in this lane gets ${atk(-2)} this round.`],
  'inf-blood-demon': [`Gain ${atk(1)} for the rest of the battle.`, `Gain ${atk(1)} for the rest of the battle.`, `If an allied Unit was destroyed this round, gain ${atk(3)} this round.`],
  'inf-infernal-lord': [`Every other Unit gets ${atk(-2)} this round.`, 'Destroy the enemy Continuous Spell in this lane.'],
  'inf-runebreaker': [
    'Destroy the enemy Continuous Spell in this lane.',
    'While another Mage Slayer is in play, enemy Spells can’t affect this Unit.',
    'The second time the enemy casts a Spell in a round, deal 2 damage to the enemy player.',
  ],
  'inf-ash-jackal': [`Gain ${atk(2)} this round for each adjacent allied Beast.`],
  'inf-packhound': ['When another allied Beast is destroyed, summon a Hound Pup token in an empty lane.'],
  'inf-alpha-hound': [`Gain ${atk(1)} this round for each allied Unit, including this one.`, 'If you control 3 Units, deal 2 damage to the enemy player.'],
  'inf-mirage-imp': ['Bypass: while your Continuous Spell is in this lane, this Unit skips the clash and attacks the enemy player directly at full ATK. Starts the round after it is played.'],
  'spl-weakness': [`The enemy Unit in this lane gets ${atk(-3)} this round.`],
  'spl-fireball': [`The enemy Unit in this lane gets ${atk(-4)} for the rest of the battle.`, `If the enemy has a Continuous Spell in this lane, that Unit’s ATK becomes ${atkIs(1)} instead.`],
  'spl-soul-burn': ['Exile the strongest Unit in the enemy’s Graveyard.'],
  'spl-burning-ground': [`The enemy Unit in this lane gets ${atk(-1)} for the rest of the battle.`],
  'spl-siege-fire': ['If the enemy has no Unit in this lane, deal 1 damage to the enemy player.'],
  'spl-arcane-bolt': ['Deal 3 damage to the enemy player.', 'If you already cast a Spell this round, deal 2 more.'],
  'spl-blood-pact': [`Destroy your Unit in this lane, then destroy the enemy Unit in this lane if it has ${atkIs(6)} or less.`],

  // ---- Outside the playtest roster (developer battle scenes) -----------------------------------------
  'spl-execute': [`Destroy the enemy Unit in this lane if it has ${atkIs(3)} or less.`],
  'spl-death-wave': [`All enemy Units get ${atk(-2)} this round.`],
  'spl-growth-totem': [`Your Unit in this lane gains ${atk(1)} for the rest of the battle.`],
  'wld-forest-wolf': [`If the enemy has no Unit in this lane, gain ${atk(2)}.`],
  'wld-ancient-treant': [`Gain ${atk(1)} for the rest of the battle.`],
  'wld-titanroot': [`Gain ${atk(2)} for the rest of the battle.`],

  // ---- Tokens -----------------------------------------------------------------------------------
  'tok-ward': ['If this token loses its lane, you take 2 less damage from it.'],
};

export interface CardEffectLine {
  trigger: Trigger;
  label: string;
  text: string;
  oncePerRound: boolean;
}

/** Fallback for cards outside the curated roster: the engine text, with the old vocabulary and the "Trigger:" prefix removed. */
function normalizeEngineText(ability: AbilityDefinition): string {
  const prefix = /^[A-Za-z ]+:\s*/;
  const text = ability.text.replace(prefix, (match) => (match.length <= 20 ? '' : match));
  return text
    .replace(/\bHeroes\b/g, 'Units')
    .replace(/\bHero\b/g, 'Unit')
    .replace(/([+-]?)(\d+) Power\b/g, (_, sign: string, n: string) => `${sign === '-' ? MINUS : sign}${atkDelta(Number(n))} ATK`)
    .replace(/\bPower\b/g, 'ATK')
    .replace(/^./, (first) => first.toUpperCase());
}

export function hasEffectCopy(cardId: string): boolean {
  return cardId in COPY;
}

/** Full rules lines for a card, in ability order. Abilities that are not the card's own (Mastery) fall back to normalized engine text. */
export function cardEffectLines(card: CardDefinition, abilities: readonly AbilityDefinition[] = card.abilities): CardEffectLine[] {
  return abilities.map((ability) => ({
    trigger: ability.trigger,
    label: TIMING_LABEL[ability.trigger],
    text: copyForAbility(card, ability) ?? normalizeEngineText(ability),
    oncePerRound: !!ability.oncePerRound,
  }));
}

/** Curated copy for one of the card's own base abilities; other ability objects get null. */
function copyForAbility(card: CardDefinition, ability: AbilityDefinition): string | null {
  const lines = COPY[card.id];
  const index = card.abilities.indexOf(ability);
  return lines && index >= 0 ? (lines[index] ?? null) : null;
}
