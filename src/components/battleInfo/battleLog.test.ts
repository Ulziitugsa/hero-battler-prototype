import { describe, expect, it } from 'vitest';
import { battleLogEntries, type BattleLogEntry } from './battleLog';
import { buildBattleScene, scriptedMatch, type ScriptedRound } from '../../pages/battleScenes';
import { resolveCardRound } from '../../game/cardCombat/engine';
import { resolveRound } from '../../game/engine/resolveRound';
import { getCard } from '../../game/cards';
import type { GameState, HeroInstance, LaneId, PlayerState, Side } from '../../game/types';

// The battle log (Info layers pass, layer 3), read from real resolver logs: the scripted QA board (battleScenes.ts) and
// a few one- or two-round matches set up for one rule each.

const line = (e: BattleLogEntry) => (e.kind === 'round' ? `— ${e.who} —` : `${e.who} — ${e.label ? `${e.label}: ` : ''}${e.text}`);

const PLAYER = ['kng-archer', 'kng-archer', 'kng-apprentice-mage', 'kng-archmage-vael', 'kng-light-priest', 'kng-common-knight', 'kng-royal-guard', 'kng-paladin', 'spl-aegis-ward', 'spl-power-surge', 'spl-fireball', 'spl-war-cry', 'kng-battle-captain', 'kng-spellbreaker', 'kng-null-templar'];
const ENEMY = ['und-vharos', 'und-bone-soldier', 'kng-light-priest', 'kng-common-knight', 'spl-cursed-ground', 'spl-power-surge', 'inf-hellhound', 'inf-hellhound', 'inf-infernal-lord', 'und-dark-priest', 'und-mira', 'spl-hush', 'und-grave-knight', 'und-crypt-warden', 'spl-stasis-field'];
const logOf = (rounds: ScriptedRound[]) => battleLogEntries(scriptedMatch({ playerDeck: PLAYER, enemyDeck: ENEMY, rounds }).events).map(line);

describe('battle log', () => {
  it('reads the QA board’s two rounds as one short line per effect and clash', () => {
    const { events } = buildBattleScene('3');
    expect(battleLogEntries(events).map(line)).toEqual([
      '— Round 1 —',
      'Battle Banner — Passive: Unit here +15 ATK',
      'Clash Damage — Left: 35 to Enemy (Common Knight 128 beat Bone Soldier 93)',
      'Dark Priest — Direct Attack: 84 to You',
      'Bone Soldier — Destroyed: Returned to deck',
      '— Round 2 —',
      'Royal Guard — On Play: Common Knight and Light Priest +15 ATK',
      'Light Priest — On Play: Restored 84 HP, gained a Shield',
      // Dark Priest has two Before Combat effects with different labels (Guard 2, Clash): the log can't tell which fired.
      'Dark Priest — Before Combat: Gained +30 ATK this round',
      'Clash Damage — Left: 13 to Enemy (Common Knight 143 beat Vharos 130)',
      'Clash Damage — Center: 29 to Enemy (Royal Guard 128 beat Cursed Warrior 99)',
      'Clash Damage — Right: 21 to You (Dark Priest 114 beat Light Priest 93)',
      'Light Priest — Shield: Survived the clash, Shield used up',
      // Cursed Warrior's own Destroyed effect then had nothing to do (it was already back in hand): no row.
      'Vharos — Destroyed: Revived with 95 ATK, Cursed Warrior returned to hand',
      '— Round 3 —',
    ]);
  });

  it('colors each row by the side that acted: a clash by its winner, a tie by neither', () => {
    const entries = battleLogEntries(buildBattleScene('3').events);
    const find = (text: string) => entries.find((e) => line(e).startsWith(text))!;
    expect(find('Clash Damage — Left: 35').side).toBe('player');
    expect(find('Clash Damage — Right: 21').side).toBe('enemy');
    expect(find('Dark Priest — Direct Attack').side).toBe('enemy');
    expect(find('Royal Guard — On Play')).toMatchObject({ side: 'player', kind: 'effect' });
    expect(logOf([{ hands: { player: ['kng-apprentice-mage'], enemy: ['und-bone-soldier'] }, plays: { player: [['kng-apprentice-mage', 'center']], enemy: [['und-bone-soldier', 'center']] } }])).toContain(
      'Tie — Center: Apprentice Mage and Bone Soldier destroyed at 93 ATK each, no damage',
    );
  });

  it('names Aegis Ward for the damage it stops, including the barrier it puts up silently', () => {
    expect(logOf([{ hands: { player: ['kng-archer', 'spl-aegis-ward'], enemy: ['und-vharos'] }, plays: { player: [['kng-archer', 'left'], ['spl-aegis-ward', 'left']], enemy: [['und-vharos', 'left']] } }])).toEqual([
      '— Round 1 —',
      'Aegis Ward — Spell: Next damage to You this round is prevented, Kingdom Archer gained a Shield',
      'Aegis Ward — Left: Prevented 40 Clash Damage to You (Vharos 130 beat Kingdom Archer 90)',
      'Kingdom Archer — Shield: Survived the clash, Shield used up',
      '— Round 2 —',
    ]);
  });

  it('shows Archmage Vael’s echo, and the Spell resolving twice', () => {
    const log = logOf([
      { hands: { player: ['kng-archmage-vael'], enemy: [] }, plays: { player: [['kng-archmage-vael', 'left']], enemy: [] } },
      { hands: { player: ['spl-power-surge'], enemy: [] }, plays: { player: [['spl-power-surge', 'left']], enemy: [] } },
    ]);
    expect(log.slice(log.indexOf('— Round 2 —'))).toEqual([
      '— Round 2 —',
      'Archmage Vael — Passive: Power Surge resolves twice',
      'Power Surge — Spell: Archmage Vael +45 ATK this round',
      'Power Surge — Spell: Archmage Vael +45 ATK this round',
      'Archmage Vael — Direct Attack: 184 to Enemy',
      'Archmage Vael — Round End: Power Surge returned to hand',
      '— Round 3 —',
    ]);
  });

  it('turns “Your Spell” round for an enemy card, so it never describes the opponent’s cast', () => {
    const log = logOf([
      { hands: { player: [], enemy: ['kng-light-priest'] }, plays: { player: [], enemy: [['kng-light-priest', 'right']] } },
      { hands: { player: [], enemy: ['spl-power-surge'] }, plays: { player: [], enemy: [['spl-power-surge', 'right']] } },
    ]);
    expect(log).toContain('Light Priest — Their Spell: Gained +15 ATK this round');
    expect(log.join('\n')).not.toContain('Your Spell');
  });

  it('adds up one Unit’s ATK changes from one effect, and counts repeated names', () => {
    const fireball = logOf([
      { hands: { player: [], enemy: ['kng-common-knight', 'spl-cursed-ground'] }, plays: { player: [], enemy: [['kng-common-knight', 'left'], ['spl-cursed-ground', 'left']] } },
      { hands: { player: ['spl-fireball'], enemy: [] }, plays: { player: [['spl-fireball', 'left']], enemy: [] } },
    ]);
    // −60, then "with their Continuous Spell here, it becomes 50 ATK instead": one net change, not two.
    expect(fireball).toContain('Fireball — Spell: Common Knight −78 ATK');
    const lord = logOf([
      { hands: { player: ['kng-archer', 'kng-common-knight'], enemy: ['inf-hellhound', 'inf-hellhound'] }, plays: { player: [['kng-archer', 'left'], ['kng-common-knight', 'right']], enemy: [['inf-hellhound', 'center'], ['inf-hellhound', 'right']] } },
      { hands: { player: [], enemy: ['inf-infernal-lord'] }, plays: { player: [], enemy: [['inf-infernal-lord', 'left']] } },
    ]);
    expect(lord).toContain('Infernal Lord — On Play: Kingdom Archer and two Hellhounds −30 ATK this round');
    // The Hellhound with no enemy in its lane did nothing: it leaves no "No effect" row.
    expect(lord.filter((l) => l.startsWith('Hellhound — On Play'))).toEqual(['Hellhound — On Play: Silenced Common Knight']);
  });

  it('marks where each entry ends, so the live log can show it once playback reaches it', () => {
    const { state } = buildBattleScene('2');
    const hand = (cardId: string) => state.player.hand.find((h) => h.cardId === cardId)!.handId;
    const { events } = resolveCardRound(
      state,
      { plays: [{ handId: hand('kng-royal-guard'), cardId: 'kng-royal-guard', lane: 'center' }] },
      { plays: [] },
    );
    const entries = battleLogEntries(events, state);
    expect(entries.length).toBeGreaterThan(1);
    for (const entry of entries) {
      expect(entry.until).toBeGreaterThanOrEqual(Number(entry.key));
      expect(entry.until).toBeLessThan(events.length);
    }
    expect(entries.map((e) => e.until)).toEqual([...entries.map((e) => e.until)].sort((a, b) => a - b));
  });
});

describe('battle log in a legacy battle', () => {
  function legacyUnit(cardId: string, power: number, id: string): HeroInstance {
    const card = getCard(cardId);
    return { instanceId: id, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power, tempPower: 0, shielded: false, silenced: false, usedThisRound: false };
  }
  function side(s: Side, units: Partial<Record<LaneId, HeroInstance>>): PlayerState {
    return { side: s, hp: 20, deck: [], hand: [], graveyard: [], heroZones: { left: null, center: null, right: null, ...units }, spellZones: { left: null, center: null, right: null } };
  }
  const legacyLog = (board: GameState) => battleLogEntries(resolveRound(board, { plays: [] }, { plays: [] }, 1).events, undefined, 'legacy').map(line);

  it('names the clash winner and the HP the legacy rules deal, with no ATK arithmetic', () => {
    const board: GameState = { round: 1, rngState: 42, status: 'IN_PROGRESS', player: side('player', { left: legacyUnit('kng-common-knight', 7, 'p1') }), enemy: side('enemy', { left: legacyUnit('kng-archer', 4, 'e1') }) };
    const lines = legacyLog(board);
    expect(lines).toContain('Clash Damage — Left: 3 to Enemy (Common Knight beat Kingdom Archer)');
    expect(lines.join(' ')).not.toMatch(/\bPower\b|\d+ beat/);
  });

  it('a tie destroys both for no damage', () => {
    const board: GameState = { round: 1, rngState: 42, status: 'IN_PROGRESS', player: side('player', { left: legacyUnit('kng-common-knight', 5, 'p1') }), enemy: side('enemy', { left: legacyUnit('kng-archer', 5, 'e1') }) };
    expect(legacyLog(board).join(' | ')).toMatch(/Tie — Left: Common Knight and Kingdom Archer destroyed/);
  });
});
