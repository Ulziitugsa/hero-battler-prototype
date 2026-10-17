import type { ArchetypeBoxId } from '../game/cards/launchRoster';
import type { StarterFaction } from '../game/cards/starterDecks';
import type { MomentKind } from './moments';

// Card Discovery Lab: the nine optimised archetype decks (cards/launchDecks.ts), described from their cards' actual rules
// in the production resolver. Every card named here exists; every number is printed on a card, pinned by a test, or
// measured (labData.test.ts checks the card ids, that key cards are in the list or marked as borrowed, and the Starting
// HP / Unit counts quoted). The AI notes come from scripts/lab-ai-report.mjs; see AI_MEASURED below.

export interface LabCombo {
  title: string;
  cards: string[];
  /** How it works, mechanically. */
  how: string;
  /** What limits it. */
  limit: string;
}

export interface LabArchetype {
  id: ArchetypeBoxId;
  /** The optimised list in cards/launchDecks.ts. */
  deckId: string;
  name: string;
  faction: StarterFaction;
  /** The Box's headline Legendary (in the list). */
  legendary: string;
  strategy: string;
  keyCards: string[];
  combos: LabCombo[];
  strengths: string[];
  weaknesses: string[];
  counters: string[];
  /** Cards from the counters above, to inspect. */
  counterCards: string[];
  /** Facts about the list worth knowing before judging it. */
  notes: string[];
  /** Where the production AI misses this deck's plan (code facts: cardCombat/ai.ts). */
  aiGaps: string[];
  /** Moments that show this deck doing its thing (scripts/lab-ai-report.mjs counts them per game). */
  signatureMoments: MomentKind[];
  /** The arranged combination test for it (scenarios.ts). */
  scenarioId: string;
  /** Starting HP and Units of the list, for the card. */
  startingHp: number;
  units: number;
}

/**
 * Measured with `node scripts/lab-ai-report.mjs --games 30` (seed 20261017; 630 games per pilot per archetype, against
 * all 21 reference decks piloted by the AI). `ai`: the production AI plays the deck. `random`: a pilot that plays every
 * card into a random legal lane, on the same games. A small gap means the AI's choices add little over random lanes,
 * so an AI-piloted result says little about the deck's cards.
 */
export const AI_MEASURED: Readonly<Record<string, { ai: number; random: number }>> = {
  vanguard: { ai: 0.64, random: 0.57 },
  'bone-legion': { ai: 0.65, random: 0.59 },
  hellpack: { ai: 0.59, random: 0.53 },
  arcane: { ai: 0.61, random: 0.6 },
  phantoms: { ai: 0.8, random: 0.73 },
  hellfire: { ai: 0.8, random: 0.79 },
  crusade: { ai: 0.65, random: 0.55 },
  wither: { ai: 0.86, random: 0.82 },
  bloodbound: { ai: 0.69, random: 0.65 },
};

/** "The AI wins 61% … random lanes 60% …" for one archetype. */
export function aiMeasuredLine(deckId: string): string {
  const m = AI_MEASURED[deckId];
  if (!m) return '';
  const gap = Math.round((m.ai - m.random) * 100);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return `Against the 21 reference decks, the AI wins ${pct(m.ai)} with this list; playing its cards into random lanes wins ${pct(m.random)} on the same games (${gap >= 0 ? '+' : '−'}${Math.abs(gap)} points for the AI).`;
}

/** What every deck's AI shares (cardCombat/ai.ts). */
export const AI_SHARED_GAPS: readonly string[] = [
  'It places Units by printed ATK, auras and Guard only. Clash bonuses (“+15 for each…”, “if you have 3 Units…”), Destroyed effects, Bypass and Round End effects are not counted when it picks lanes.',
  'It picks Spells by playing this round once in its head, assuming you play nothing, and scoring only HP, board ATK and cards in hand. Graveyard value, next round and lasting effects beyond this board do not count.',
  'It sees only its own hand and the board. It never holds a card back for a later combination.',
];

export const LAB_ARCHETYPES: readonly LabArchetype[] = [
  {
    id: 'vanguard',
    deckId: 'vanguard',
    name: 'Vanguard',
    faction: 'kingdom',
    legendary: 'kng-marshal-aldric',
    strategy: 'Fill all three lanes with Knights. Most of the list’s bonuses switch on at three Units or count your Knights, and they stack in the same round.',
    keyCards: ['kng-marshal-aldric', 'kng-knight-errant', 'kng-battle-captain', 'spl-war-cry', 'kng-royal-guard'],
    combos: [
      {
        title: 'The full line',
        cards: ['kng-marshal-aldric', 'kng-knight-errant', 'kng-battle-captain', 'spl-war-cry'],
        how: 'With three Units, Aldric gives the other two +15, Knight-Errant gets +15 for each other Knight, Battle Captain gives its neighbours +15, and War Cry gives every Unit +15 and +15 more. In the lab setup Knight-Errant goes from 96 to 171 in one round.',
        limit: 'All of it lasts this round only, and most of it needs three Units in play: lose a lane and the next round’s bonuses shrink.',
      },
      {
        title: 'Captain’s guard',
        cards: ['kng-battle-captain', 'kng-common-knight'],
        how: 'While you have another Knight in play, Battle Captain ignores enemy Unit effects, such as Hellhound’s −30 or Cerberus’s −15.',
        limit: 'Spells still reach it.',
      },
    ],
    strengths: ['Wins several lanes in one round once the line is full.', 'High printed ATK: Common Knight 128, Royal Guard 113, Aldric 105.'],
    weaknesses: ['Nearly every bonus lasts one round; nothing grows.', 'A lost lane switches off Aldric, War Cry’s second +15 and the Knight counts.', 'No recursion, healing or effect damage: it wins only through clashes.'],
    counters: ['Giant’s Bane destroys the Unit in its lane when the enemy has more Units than you: a full line is exactly that.', 'Death Wave (−30 to every enemy) or Cerberus (−15 to every enemy) shrink all three lanes at once.', 'Bypass Units go past the line instead of fighting it.'],
    counterCards: ['spl-giants-bane', 'spl-death-wave', 'inf-cerberus', 'und-wraith-prince'],
    notes: [],
    aiGaps: ['Knight-Errant, Aldric and Battle Captain bonuses are all Clash bonuses, which its lane choice does not count, so it does not aim for a full line of Knights.'],
    signatureMoments: ['turned', 'chain'],
    scenarioId: 'vanguard-line',
    startingHp: 812,
    units: 10,
  },
  {
    id: 'bone-legion',
    deckId: 'bone-legion',
    name: 'Bone Legion',
    faction: 'undead',
    legendary: 'und-morwen',
    strategy: 'Trade Units freely: the Graveyard is the fuel. Bone Dragon and Bone Soldier hit harder for every Unit in it, and several cards bring the dead back.',
    keyCards: ['und-morwen', 'und-bone-dragon', 'und-bone-soldier', 'und-vharos', 'und-mira'],
    combos: [
      {
        title: 'Morwen’s revive',
        cards: ['und-morwen', 'und-bone-soldier', 'und-bone-dragon'],
        how: 'Before lanes fight, Morwen revives your weakest Undead Unit from the Graveyard into an empty lane, and it fights that same round. Bone Dragon and Bone Soldier get +15 for each Unit still in the Graveyard (up to +45).',
        limit: 'Each card can come back from the Graveyard once per battle, and Morwen needs an empty lane: with all three of your lanes full she revives nothing.',
      },
      {
        title: 'Vharos returns',
        cards: ['und-vharos', 'und-mira'],
        how: 'When Vharos is destroyed he comes back in his lane with 95 ATK and returns your strongest other Undead Unit to your hand. Mira returns your weakest other Undead Unit when she falls.',
        limit: 'Once per copy: a Vharos that already came back stays in the Graveyard.',
      },
    ],
    strengths: ['Losing a clash still pays: Units come back or feed the Graveyard counters.', '13 Units: 1,159 Starting HP.'],
    weaknesses: ['Slow: the Graveyard bonuses need Units to die first.', 'Low printed ATK (most Units 92 to 99).', 'Exile empties the Graveyard.'],
    counters: ['Soul Burn exiles the 2 strongest Units from the Graveyard; Relic Warden exiles the strongest before each clash.', 'Fast effect damage (Hellfire, Arcane) before the Graveyard fills.'],
    counterCards: ['spl-soul-burn', 'kng-relic-warden'],
    notes: ['Raise Fallen and Grave Totem, the Core and Box revive Spells, are not in this list.'],
    aiGaps: ['Bone Dragon and Bone Soldier bonuses are Clash bonuses, so their lane value is underrated.', 'It does not keep a lane empty for Morwen.'],
    signatureMoments: ['revive', 'returned'],
    scenarioId: 'bone-legion-morwen',
    startingHp: 1159,
    units: 13,
  },
  {
    id: 'hellpack',
    deckId: 'hellpack',
    name: 'Hellpack',
    faction: 'infernal',
    legendary: 'inf-cerberus',
    strategy: 'A pack of Beasts that hit harder side by side, shrink the enemy line, and leave Hound Pups behind when they fall.',
    keyCards: ['inf-cerberus', 'inf-ash-jackal', 'inf-alpha-hound', 'inf-brimstone-matriarch', 'inf-hellhound'],
    combos: [
      {
        title: 'Pack in a line',
        cards: ['inf-ash-jackal', 'inf-brimstone-matriarch', 'inf-alpha-hound', 'inf-cerberus'],
        how: 'Ash Jackal gets +30 for each Beast next to it, Alpha Hound +15 for each other Unit, the Matriarch +15 with three Units, and Cerberus gives every enemy Unit −15 with three Units.',
        limit: 'All this round, and positional: Ash Jackal only counts Beasts in the lanes next to it.',
      },
      {
        title: 'Pups refill the line',
        cards: ['inf-brimstone-matriarch', 'inf-cerberus'],
        how: 'When the Matriarch or Cerberus is destroyed, a Hound Pup (65 ATK) fills an empty lane, which keeps your Unit count up for the three-Unit lines.',
        limit: 'A Pup is a 65 ATK token: it rarely wins a clash and triggers nothing when it falls.',
      },
    ],
    strengths: ['Hellhound’s −30 and Cerberus’s −15 to every enemy change clashes before they start.', 'Runebreaker destroys the enemy Spell in its lane before lanes fight.'],
    weaknesses: ['Its bonuses last one round and depend on adjacency and three Units.', 'No healing and no recursion.'],
    counters: ['Battle Captain (with another Knight) and Mira (with 3+ Undead in the Graveyard) ignore enemy Unit effects such as Hellhound and Cerberus.', 'Giant’s Bane against a full pack.'],
    counterCards: ['kng-battle-captain', 'und-mira', 'spl-giants-bane'],
    notes: [],
    aiGaps: ['Ash Jackal, Alpha Hound and Matriarch bonuses are Clash bonuses, so it does not arrange Beasts side by side.'],
    signatureMoments: ['token', 'turned'],
    scenarioId: 'hellpack-pups',
    startingHp: 1003,
    units: 12,
  },
  {
    id: 'arcane',
    deckId: 'arcane',
    name: 'Arcane',
    faction: 'kingdom',
    legendary: 'kng-archmage-vael',
    strategy: 'Cast two Spells a round and let the Mages pay off each one. Archmage Vael is the engine: the first one-time Spell each round happens twice.',
    keyCards: ['kng-archmage-vael', 'spl-arcane-bolt', 'kng-apprentice-mage', 'kng-battlemage', 'spl-mirror-image'],
    combos: [
      {
        title: 'Vael and two Arcane Bolts',
        cards: ['kng-archmage-vael', 'spl-arcane-bolt'],
        how: 'With Vael in play, the first Bolt resolves twice (135 + 135), the second Bolt deals 135 + 90 because a Spell was already cast, and Vael deals 90 for the second Spell: 585 damage in one round in the lab setup.',
        limit: 'Vael must already be in play (94 ATK, no protection), and both Bolts must be in your hand together.',
      },
      {
        title: 'Mages answer every Spell',
        cards: ['kng-apprentice-mage', 'kng-battlemage', 'kng-moonlit-savant'],
        how: 'Each Spell you cast gives Apprentice Mage +30 this round, gives the enemy in Battlemage’s lane −30 this round, and gives Moonlit Savant +15 for good (up to +45).',
        limit: 'One Spell per Spell slot: at most three Spells a round.',
      },
      {
        title: 'Spells come back',
        cards: ['spl-mirror-image', 'und-grave-sage', 'kng-archmage-vael'],
        how: 'Mirror Image returns a random Spell from your Graveyard and draws a card; Grave Sage returns one when it falls; Vael returns one at Round End if your hand is empty.',
        limit: 'Each copy comes back from the Graveyard once per battle.',
      },
    ],
    strengths: ['The most damage in one round of the nine lab combinations: 585 with Vael and two Bolts.', 'Damage that ignores blockers.'],
    weaknesses: ['Only 8 Units: 668 Starting HP, the lowest of the nine.', 'Everything runs through Vael; one lost clash removes the engine.', 'Spells are tied to lanes and capped at three a round.'],
    counters: ['Any Unit with more than 94 ATK in Vael’s lane.', 'Runebreaker deals 90 when you cast your second Spell; Spellbreaker gets +30 each time you cast.', 'Null Templar ignores the first enemy Spell aimed at it each round.'],
    counterCards: ['inf-runebreaker', 'kng-spellbreaker', 'kng-null-templar'],
    notes: [],
    aiGaps: ['It casts Spells one at a time, keeping each one that helps this round’s position; it never saves a Bolt for the round Vael is in play.', 'The Mages’ “when you cast” bonuses do not count when it picks their lanes.'],
    signatureMoments: ['echo', 'chain', 'burst'],
    scenarioId: 'arcane-echo',
    startingHp: 668,
    units: 8,
  },
  {
    id: 'phantoms',
    deckId: 'phantoms',
    name: 'Phantoms',
    faction: 'undead',
    legendary: 'und-duchess-nyx',
    strategy: 'Tricksters skip the clash and hit the player directly (Bypass) while you keep a Continuous Spell in play.',
    keyCards: ['und-duchess-nyx', 'und-wraith-prince', 'und-spectral-assassin', 'und-banshee', 'spl-cursed-ground'],
    combos: [
      {
        title: 'Bypass under Cursed Ground',
        cards: ['spl-cursed-ground', 'und-duchess-nyx', 'und-wraith-prince', 'und-spectral-assassin'],
        how: 'With a Continuous Spell in play, Shade Thief, Spectral Assassin, Wraith Prince and Duchess Nyx bypass from the round after they are played. The enemy Unit facing a bypasser does not clash and deals no damage in that lane. Wraith Prince and Nyx grow +15 per direct hit (up to +45).',
        limit: 'Cursed Ground (2 copies) is the list’s only Continuous Spell, and Banshee needs two in play at once. Wraith Prince hits for 15 less and Spectral Assassin for 30 less when they bypass.',
      },
    ],
    strengths: ['Blockers don’t matter: the damage goes straight to the player.', 'A bypasser also takes the Unit facing it out of that round.'],
    weaknesses: ['It all hinges on a Continuous Spell staying in play.', 'A bypasser does nothing special the round it is played.'],
    counters: ['Dispel or Runebreaker destroy Cursed Ground and switch every bypass off.', 'Aegis Ward prevents a hit.'],
    counterCards: ['spl-dispel', 'inf-runebreaker', 'spl-aegis-ward'],
    notes: [],
    aiGaps: ['Bypass is not counted when it picks lanes, and keeping Cursed Ground in play is not something it plans for.'],
    signatureMoments: ['bypass'],
    scenarioId: 'phantoms-bypass',
    startingHp: 1070,
    units: 12,
  },
  {
    id: 'hellfire',
    deckId: 'hellfire',
    name: 'Hellfire',
    faction: 'infernal',
    legendary: 'inf-ignis',
    strategy: 'Burn: damage from effects on top of combat. Units deal damage when you cast and when they fall, and the Spells hit the player too.',
    keyCards: ['inf-hellfire-warlock', 'inf-ember-witch', 'inf-infernal-lord', 'spl-arcane-bolt', 'spl-inferno', 'spl-meteor'],
    combos: [
      {
        title: 'Three-Spell round',
        cards: ['spl-meteor', 'spl-inferno', 'spl-arcane-bolt', 'inf-ember-witch', 'inf-hellfire-warlock', 'inf-infernal-lord'],
        how: 'Meteor, Inferno and Arcane Bolt with Ember Witch, Hellfire Warlock and Infernal Lord in play: 540 effect damage in the lab setup, plus −15 ATK for good on every enemy Unit.',
        limit: 'Ember Witch and the Warlock trigger once a round; Infernal Lord only if you cast that round.',
      },
      {
        title: 'Damage when they fall',
        cards: ['inf-pit-fiend', 'inf-hellfire-warlock', 'inf-flame-herald'],
        how: 'Pit Fiend deals 90 and Hellfire Warlock 45 when destroyed; Flame Herald deals 45 before every clash.',
        limit: 'The damage goes to the player; it does not clear the board.',
      },
    ],
    strengths: ['Damage that blockers can’t stop.', 'Inferno weakens the whole enemy line for good.'],
    weaknesses: ['Modest ATK, and most triggers need Spells.', 'Apart from Meteor, nothing removes enemy Units.'],
    counters: ['High Starting HP lists outlast the burn (Bloodbound 1,234).', 'Aegis Ward prevents the next damage.', 'Runebreaker punishes the second Spell.'],
    counterCards: ['spl-aegis-ward', 'inf-runebreaker'],
    notes: ['Ignis’s Round End damage counts your Continuous Spells in play, and this list has none, so only its “+15 when you cast” line works here. Burning Ground, Siege Fire and Wall of Flame (Hellfire Box) would turn it on.'],
    aiGaps: ['Flame Herald’s damage and the “when you cast” payoffs do not count when it picks lanes; Spells are judged one at a time for this round only.'],
    signatureMoments: ['burst', 'chain', 'removal'],
    scenarioId: 'hellfire-burn',
    startingHp: 838,
    units: 10,
  },
  {
    id: 'crusade',
    deckId: 'crusade',
    name: 'Crusade',
    faction: 'kingdom',
    legendary: 'kng-saint-aveline',
    strategy: 'Attached Spells on Knights that grow stronger while a Spell is in their lane.',
    keyCards: ['kng-saint-aveline', 'kng-crusader-champion', 'kng-banner-knight', 'spl-reliquary-blade', 'spl-oath-blade'],
    combos: [
      {
        title: 'A blade on the Champion',
        cards: ['kng-crusader-champion', 'spl-reliquary-blade'],
        how: 'While you have a Spell in its lane, Crusader Champion has +30 ATK and enemy Spells can’t affect it. Reliquary Blade adds +30: 168 ATK.',
        limit: 'An Attached Spell needs your Unit in its lane and goes to the Graveyard when that Unit leaves play.',
      },
      {
        title: 'Aveline keeps the blade',
        cards: ['kng-saint-aveline', 'spl-reliquary-blade', 'kng-banner-knight'],
        how: 'When an Attached Spell leaves play with its Unit, Saint Aveline returns it to your hand (once a round), and she gets +15 this round whenever you cast a Spell. Banner Knight grows +15 each Round End with a Spell in its lane (up to +45).',
        limit: 'Once a round, and each copy comes back only once per battle.',
      },
    ],
    strengths: ['Big Units that last: a Champion with a Blade fights at 168.', 'The Champion ignores enemy Spells.'],
    weaknesses: ['Card-hungry: a Unit and its Spell both have to land.', 'Losing the Unit loses its Spell too, unless Aveline is in play.'],
    counters: ['Dispel and Runebreaker destroy the Spell in a lane.', 'Hellhound’s −30 is a Unit effect, which the Champion does not ignore.'],
    counterCards: ['spl-dispel', 'inf-runebreaker', 'inf-hellhound'],
    notes: [],
    aiGaps: ['It looks one round ahead, so Banner Knight’s Round End growth and Aveline’s returns count only when they happen this round.'],
    signatureMoments: ['returned', 'turned'],
    scenarioId: 'crusade-aveline',
    startingHp: 828,
    units: 10,
  },
  {
    id: 'wither',
    deckId: 'wither',
    name: 'Wither',
    faction: 'undead',
    legendary: 'und-plague-mother',
    strategy: 'Slow poison: ATK loss that lasts piles up every Round End, healing outlasts the opponent, and the death line finishes Units off.',
    keyCards: ['und-plague-mother', 'und-blightcaster', 'und-withering-lich', 'und-rot-ghoul', 'spl-cursed-ground'],
    combos: [
      {
        title: 'The spread',
        cards: ['und-plague-mother', 'und-blightcaster', 'und-rot-ghoul'],
        how: 'At Round End the Plague Mother gives the enemy in her lane −15 for good and −15 more to every other enemy that has already lost ATK for good (Blightcaster and Rot Ghoul set that up). A Unit at 35 ATK or less is destroyed.',
        limit: 'The Plague Mother must survive to Round End (she has a Shield and Guard 1), and new enemy Units arrive at full ATK.',
      },
      {
        title: 'Outlast',
        cards: ['und-blightcaster', 'und-grave-knight', 'und-grave-sexton', 'und-withering-lich'],
        how: 'Blightcaster and Grave Knight restore 45 HP when an enemy falls (once a round); Grave Sexton restores 45 at Round End with 3+ Units in your Graveyard; Withering Lich grows +15 per enemy that falls (up to +45).',
        limit: 'Heals can’t go above your Starting HP.',
      },
    ],
    strengths: ['Lasting ATK loss carries into every later round.', 'Several heals.', '13 Units: 1,172 Starting HP.'],
    weaknesses: ['Slow: one −15 per source each Round End.', 'Fresh enemy Units start at full ATK.'],
    counters: ['Burst damage (Hellfire, Arcane) wins before the poison matters.', 'Bypass Units hit the player while the poison works on the board.'],
    counterCards: ['spl-arcane-bolt', 'und-wraith-prince'],
    notes: ['The game never tells the player that a Unit at 35 ATK or less is destroyed; the lab says so when it happens.'],
    aiGaps: ['Round End ATK loss is not counted when it picks lanes, so it does not set up the Plague Mother’s spread on purpose.'],
    signatureMoments: ['deathLine', 'turned'],
    scenarioId: 'wither-plague',
    startingHp: 1172,
    units: 13,
  },
  {
    id: 'bloodbound',
    deckId: 'bloodbound',
    name: 'Bloodbound',
    faction: 'infernal',
    legendary: 'inf-kathra',
    strategy: 'Deaths are fuel: Units that deal damage when they fall, and Units that grow when allies fall.',
    keyCards: ['inf-kathra', 'inf-blood-demon', 'inf-blood-imp', 'inf-blood-thrall', 'inf-pit-fiend'],
    combos: [
      {
        title: 'Every death pays',
        cards: ['inf-soot-imp', 'inf-pit-fiend', 'inf-blood-imp', 'inf-blood-demon', 'inf-kathra'],
        how: 'Soot Imp deals 45 and Pit Fiend 90 when destroyed. Blood Imp gives your other Units +15 for good when it falls. Blood Demon and Kathra grow +15 per ally that falls (up to +45), and Blood Demon gets +30 more the round an ally died.',
        limit: 'Growth stops at +45 above the ATK a Unit entered with.',
      },
      {
        title: 'Sacrifice (Box cards)',
        cards: ['spl-blood-pact', 'inf-kathra', 'inf-blood-imp'],
        how: 'Blood Pact destroys your own Unit, then the enemy Unit in its lane. Kathra deals 45 when one of your own cards destroyed the ally.',
        limit: 'The optimised list runs no Blood Pact, Dark Ritual or Flesh Altar, so Kathra’s sacrifice line never fires in it. Those cards are in the Bloodbound Box.',
      },
    ],
    strengths: ['Losing a clash still deals damage.', 'Blood Thrall deals 90 whenever it would lose its lane.', '15 Units: 1,234 Starting HP, the highest of the nine.'],
    weaknesses: ['No Spells: nothing to answer the enemy’s Spells, and no tricks of its own.', 'Every lost clash still costs Clash Damage.'],
    counters: ['Hush silences a Unit for the round, so its Destroyed effect does not fire if it falls.', 'Aegis Ward prevents the next damage.'],
    counterCards: ['spl-hush', 'spl-aegis-ward'],
    notes: ['15 Units and no Spells.'],
    aiGaps: ['Destroyed effects and “when an ally falls” growth are not counted when it picks lanes: it blocks to absorb ATK, not to trade on purpose.'],
    signatureMoments: ['chain', 'burst', 'sacrifice'],
    scenarioId: 'bloodbound-pact',
    startingHp: 1234,
    units: 15,
  },
];

export function getArchetype(id: string): LabArchetype {
  const a = LAB_ARCHETYPES.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown lab archetype: ${id}`);
  return a;
}
