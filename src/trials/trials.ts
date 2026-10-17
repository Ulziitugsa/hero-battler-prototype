import type { LaneId } from '../game/types';
import type { ArrangedPosition } from './arrange';

// The three experimental Arcane Trials (docs/design/POWER-FANTASY-P1.md, Part D). Each arranges a position on a real card
// match and sets an objective; the player makes every decision on the real battle screen, the production resolver decides
// what happens and the production AI plays the opponent. Nothing is scripted: trials.test.ts searches every line of play
// with solver.ts and pins how many win, that the intended line is one of them and that failing is possible.
//
// Every objective is the same rule: bring the enemy to 0 HP by the end of the last round. Running out of rounds, a draw
// or reaching 0 HP yourself fails the trial.

export type TrialTheme = 'immortal-army' | 'apocalypse' | 'champion';

export interface ArcaneTrial {
  id: string;
  theme: TrialTheme;
  title: string;
  /** The combination this trial is built around. */
  combination: string;
  /** What the player needs to know before playing, in plain sentences. */
  brief: string[];
  /** The win condition, in one line. */
  objective: string;
  /** How many rounds the player has, counting this one. */
  rounds: number;
  /** Cards worth inspecting first. */
  keyCards: string[];
  /** Progressively stronger hints. */
  hints: string[];
  /** The intended solution, one entry per round (later rounds only when the trial lasts that long). */
  solution: { cardId: string; lane: LaneId }[][];
  /** Why it works, shown after a success (or on request after a failure). */
  explanation: string[];
  /** What would stop it in a real battle (Part F). */
  counter: string;
  position: ArrangedPosition;
}

export const ARCANE_TRIALS: readonly ArcaneTrial[] = [
  {
    id: 'endless-legion',
    theme: 'immortal-army',
    title: 'The Endless Legion',
    combination: 'Deathless Legionary + Mordrath, the Endless King',
    brief: [
      'Your two Deathless Legionaries rise again each time they are destroyed, stronger every time.',
      'Mordrath grows whenever one of your Units returns to play, and so does the Unit that returned.',
      'The enemy has 200 HP and plays nothing this round.',
    ],
    objective: 'Bring the enemy to 0 HP this round.',
    rounds: 1,
    keyCards: ['xp-deathless-legionary', 'xp-mordrath', 'spl-blood-pact', 'spl-dark-ritual'],
    hints: [
      'Fighting fairly will not get there. Who has to die for your army to win?',
      'Blood Pact and Dark Ritual destroy your own Unit first. A Legionary destroyed before lanes fight rises before lanes fight.',
      'Sacrifice both Legionaries, then make sure Mordrath wins the center.',
    ],
    solution: [
      [
        { cardId: 'spl-blood-pact', lane: 'right' },
        { cardId: 'spl-dark-ritual', lane: 'left' },
        { cardId: 'spl-power-surge', lane: 'center' },
      ],
    ],
    explanation: [
      'Each sacrifice destroys a Legionary in the Spells step. It rises at 110 ATK, and Mordrath gives it and himself +45: both Legionaries fight at 155.',
      'Blood Pact also destroys the enemy Unit in its lane, so that Legionary hits the enemy player directly.',
      'Mordrath grows twice, to 185, and Power Surge takes him to 230: enough to beat the 210 Ogre in the center.',
      'Destroying your own Units made your army stronger. That is the Immortal Army: every death feeds it.',
    ],
    counter: 'Silence or exile. A Legionary Silenced as it dies does not rise, a Silenced Mordrath does not grow, and Unmaking exiles a Unit that has grown, so it never reaches the Graveyard. Graveyard exile (Soul Burn) is too late: the Legionary rises the moment it dies.',
    position: {
      round: 2,
      seed: 11,
      player: {
        hp: 300,
        board: { left: { cardId: 'xp-deathless-legionary' }, center: { cardId: 'xp-mordrath' }, right: { cardId: 'xp-deathless-legionary' } },
        hand: ['spl-blood-pact', 'spl-dark-ritual', 'spl-power-surge'],
      },
      enemy: {
        hp: 200,
        board: { left: { cardId: 'und-ghoul-brute' }, center: { cardId: 'inf-brimstone-ogre', atk: 210 }, right: { cardId: 'kng-common-knight' } },
        hand: [],
      },
    },
  },
  {
    id: 'ashfall',
    theme: 'apocalypse',
    title: 'Ashfall',
    combination: 'Ashen Hierophant + Cataclysm',
    brief: [
      'While the Ashen Hierophant is in play, your one-time Spells that affect the enemy Unit in their lane also affect the enemy Units next to it.',
      'Cataclysm destroys more the later it is cast: 100 ATK or less, plus 50 for each Spell you cast before it this round. Spells resolve left to right.',
      'Null Templar ignores the first enemy Spell that would affect it each round. Crypt Warden has a Shield.',
      'The enemy has 400 HP and plays nothing this round.',
    ],
    objective: 'Bring the enemy to 0 HP this round.',
    rounds: 1,
    keyCards: ['xp-ashen-hierophant', 'xp-cataclysm', 'kng-null-templar', 'und-crypt-warden'],
    hints: [
      'Only a lane with no enemy Unit lets your Unit hit the enemy player. You need all three open.',
      'From the center, a Spell reaches all three lanes. Something has to take the Null Templar’s protection first.',
      'Death Wave on the left, Cataclysm in the center, and one more Spell on the right for whatever survives.',
    ],
    solution: [
      [
        { cardId: 'spl-death-wave', lane: 'left' },
        { cardId: 'xp-cataclysm', lane: 'center' },
        { cardId: 'spl-weakness', lane: 'right' },
      ],
    ],
    explanation: [
      'Death Wave resolves first, so Null Templar spends its protection on it; the other enemy Units get −30.',
      'Cataclysm is your second Spell: it destroys anything at 150 ATK or less. Cast in the center, the Hierophant spreads it to all three lanes: Royal Guard and Null Templar fall, and the Crypt Warden’s Shield breaks.',
      'Weakness on the right resolves last and takes the Warden under 35 ATK: it falls too.',
      'Every enemy lane is empty before a single clash. All three of your Units hit the enemy player directly.',
    ],
    counter: 'Silence or remove the Hierophant before your Spells resolve. An enemy Hush in its lane, with initiative or from an earlier lane, turns the spread off; any removal that resolves first does the same. Spell immunity (Null Templar) and Shields each cost the Apocalypse a Spell.',
    position: {
      round: 2,
      seed: 12,
      player: {
        hp: 300,
        board: { left: { cardId: 'inf-brimstone-ogre' }, center: { cardId: 'xp-ashen-hierophant' }, right: { cardId: 'inf-pit-fiend' } },
        hand: ['xp-cataclysm', 'spl-weakness', 'spl-spark', 'spl-death-wave'],
      },
      enemy: {
        hp: 400,
        board: { left: { cardId: 'kng-null-templar' }, center: { cardId: 'kng-royal-guard' }, right: { cardId: 'und-crypt-warden' } },
        hand: [],
        graveyard: ['und-bone-soldier', 'und-cursed-warrior'],
      },
    },
  },
  {
    id: 'the-unbroken',
    theme: 'champion',
    title: 'The Unbroken',
    combination: 'Aurelian, the Unbroken + Vow of the Unbroken',
    brief: [
      'Aurelian entered two rounds ago at 65 ATK and has doubled at every Round End since: he is 260 now.',
      'His Vow gives him a Shield before each fight and, while it is in his lane, enemy Spells can’t affect him.',
      'The enemy holds Unmaking, which exiles a Unit that has grown, and Hush. Runebreaker destroys your Spell in its lane before lanes fight.',
      'The enemy has 550 HP; you have 400.',
    ],
    objective: 'Bring the enemy to 0 HP by the end of next round.',
    rounds: 2,
    keyCards: ['xp-aurelian', 'xp-vow-unbroken', 'xp-unmaking', 'inf-runebreaker'],
    hints: [
      'The Runebreaker will break this Vow. When will Unmaking be able to reach Aurelian?',
      'A second Vow is only useful in a lane with no Spell in it, and it protects from the moment it is revealed.',
      'Keep your second Vow for next round. This round, stop the Ghoul from hitting you.',
    ],
    solution: [[{ cardId: 'spl-stasis-field', lane: 'left' }], [{ cardId: 'xp-vow-unbroken', lane: 'center' }, { cardId: 'spl-power-surge', lane: 'left' }]],
    explanation: [
      'This round the Runebreaker breaks the Vow before lanes fight, but Aurelian (260) still beats it, then doubles to 520. Stasis Field stops the Ghoul’s 122 damage.',
      'Next round the Vow is gone, so the enemy casts Unmaking on Aurelian. Your second Vow is revealed before any Spell resolves: Aurelian is immune again and Unmaking does nothing.',
      'At 520 ATK, whatever blocks him barely matters: the Clash Damage alone takes most of the enemy’s HP.',
    ],
    counter: 'Break the protection, then answer the Champion while it is exposed. Dispel or Runebreaker removes the Vow; Unmaking then exiles him through any Shield. Racing works too: he only grows if he survives, and Bypass Units never have to face him.',
    position: {
      round: 4,
      seed: 13,
      player: {
        hp: 400,
        board: { left: { cardId: 'kng-shieldbearer' }, center: { cardId: 'xp-aurelian', atk: 260 } },
        spells: { center: { cardId: 'xp-vow-unbroken', attached: true } },
        hand: ['xp-vow-unbroken', 'spl-aegis-ward', 'spl-stasis-field'],
        deck: ['spl-power-surge', 'spl-weakness', 'kng-royal-guard'],
      },
      enemy: {
        hp: 550,
        board: { left: { cardId: 'und-ghoul-brute' }, center: { cardId: 'inf-runebreaker' }, right: { cardId: 'inf-brimstone-ogre' } },
        hand: ['xp-unmaking', 'spl-hush'],
        deck: ['kng-common-knight', 'inf-pit-fiend', 'spl-dispel'],
      },
    },
  },
];

export function getTrial(id: string): ArcaneTrial {
  const trial = ARCANE_TRIALS.find((t) => t.id === id);
  if (!trial) throw new Error(`Unknown Arcane Trial: ${id}`);
  return trial;
}
