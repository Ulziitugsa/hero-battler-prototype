import { describe, expect, it } from 'vitest';
import type { GameState, HeroInstance, LaneId, PlayerAction, Side } from '../types/index.js';
import { getCard } from '../cards/index.js';
import { STARTER_DECKS } from '../cards/starterDecks.js';
import { cardAtk, createCardMatch, resolveCardRound } from './engine.js';

// The archetype gates on the three most portable Legendaries (2026-10-09, measured in the Legendary transplant matrix):
//  - Infernal Lord's Round End damage needs a Spell cast this round (Hellfire);
//  - The Plague Mother weakens the enemy in her lane and only spreads to enemies with lasting ATK loss (Wither), read
//    from the new `lastingLoss` flag (any "for the rest of the battle" ATK loss);
//  - Kathra's damage needs a death her owner's own effect caused (a sacrifice: Bloodbound), the new DEATH_BY_OWN_EFFECT.
// Each is checked through the real round resolver on a hand-built board.

const KNIGHT = 'kng-common-knight'; // vanilla: no effect
const NONE: PlayerAction = { plays: [] };

function blankMatch(): GameState {
  const s = createCardMatch({ seed: 9, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead }).nextState;
  for (const side of ['player', 'enemy'] as Side[]) {
    s[side].hand = [];
    s[side].deck = [];
    s.cardCombat!.deckMarks[side] = [];
  }
  return s;
}

let uid = 0;
function put(s: GameState, side: Side, lane: LaneId, cardId: string, atk = cardAtk(cardId)): HeroInstance {
  const card = getCard(cardId);
  const unit: HeroInstance = { instanceId: `lg-${uid++}`, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power: atk, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, enteredRound: 0, entryAtk: atk };
  s[side].heroZones[lane] = unit;
  return unit;
}
function hand(s: GameState, side: Side, cardId: string) {
  const h = { handId: `h-${side}-${uid++}`, cardId };
  s[side].hand.push(h);
  return h;
}
const unitIn = (s: GameState, side: Side, lane: LaneId) => s[side].heroZones[lane]!;

describe('Infernal Lord: Round End damage only in a round you cast a Spell', () => {
  const damage = (castSpell: boolean) => {
    const s = blankMatch();
    put(s, 'player', 'left', 'inf-infernal-lord', 129);
    put(s, 'enemy', 'left', KNIGHT, 100); // the Lord wins its lane and is alive at Round End
    put(s, 'player', 'center', KNIGHT, 100);
    put(s, 'enemy', 'center', KNIGHT, 100);
    const plays: PlayerAction = castSpell ? { plays: [{ handId: hand(s, 'player', 'spl-power-surge').handId, cardId: 'spl-power-surge', lane: 'right' }] } : NONE;
    if (castSpell) {
      // Power Surge needs your Unit in its lane.
      put(s, 'player', 'right', KNIGHT, 60);
      put(s, 'enemy', 'right', KNIGHT, 200);
    }
    const before = s.enemy.hp;
    const r = resolveCardRound(s, plays, NONE);
    const lordDamage = r.events.filter((e) => e.type === 'DIRECT_DAMAGE' && e.sourceName === 'Infernal Lord');
    return { lordFired: lordDamage.length > 0, hpLost: before - r.nextState.enemy.hp };
  };
  it('no Spell cast: no Round End damage', () => {
    expect(damage(false).lordFired).toBe(false);
  });
  it('a Spell cast this round: deals 45 at Round End', () => {
    expect(damage(true).lordFired).toBe(true);
  });
});

describe('The Plague Mother: her lane, then only enemies with lasting ATK loss', () => {
  it('weakens the enemy in her lane and leaves an unweakened enemy elsewhere alone', () => {
    const s = blankMatch();
    put(s, 'player', 'left', 'und-plague-mother', 300); // survives her lane
    put(s, 'enemy', 'left', KNIGHT, 100);
    put(s, 'enemy', 'center', KNIGHT, 100); // no ally in center: it attacks directly but never loses ATK
    const next = resolveCardRound(s, NONE, NONE).nextState;
    expect(next.enemy.heroZones.left).toBeNull(); // lost to 300
    expect(unitIn(next, 'enemy', 'center').power).toBe(100);
  });
  it('the lane enemy gets −15 for the rest of the battle and is marked with lasting ATK loss', () => {
    const s = blankMatch();
    put(s, 'player', 'left', 'und-plague-mother', 92);
    put(s, 'enemy', 'left', KNIGHT, 60);
    s.enemy.heroZones.left!.shielded = true; // survives losing the Clash, so its ATK can be read after Round End
    const next = resolveCardRound(s, NONE, NONE).nextState;
    const foe = unitIn(next, 'enemy', 'left');
    expect(foe.power).toBe(45);
    expect(foe.lastingLoss).toBe(true);
  });
  it('an enemy elsewhere that already has lasting ATK loss loses 15 more', () => {
    const s = blankMatch();
    put(s, 'player', 'left', 'und-plague-mother', 300);
    put(s, 'player', 'center', KNIGHT, 300);
    const weakened = put(s, 'enemy', 'right', KNIGHT, 100);
    weakened.lastingLoss = true;
    put(s, 'player', 'right', KNIGHT, 40); // loses to it, so the weakened enemy stays in play
    const fresh = put(s, 'enemy', 'center', KNIGHT, 400); // beats our center Knight and stays; never weakened
    const next = resolveCardRound(s, NONE, NONE).nextState;
    expect(unitIn(next, 'enemy', 'right').power).toBe(85);
    expect(unitIn(next, 'enemy', 'center').power).toBe(fresh.power);
  });
  it('any "for the rest of the battle" ATK loss marks lasting loss; "this round" does not', () => {
    const play = (spell: string) => {
      const s = blankMatch();
      put(s, 'player', 'left', KNIGHT, 400);
      put(s, 'enemy', 'center', KNIGHT, 120);
      put(s, 'player', 'center', KNIGHT, 10);
      const h = hand(s, 'player', spell);
      return unitIn(resolveCardRound(s, { plays: [{ handId: h.handId, cardId: spell, lane: 'center' }] }, NONE).nextState, 'enemy', 'center');
    };
    expect(play('spl-enfeeble').lastingLoss).toBe(true); // −30 this round, −15 for the battle
    expect(play('spl-weakness').lastingLoss).toBeFalsy(); // −45 this round only
  });
});

describe('Kathra: grows on any ally death, deals damage only for a sacrifice', () => {
  const round = (sacrifice: boolean) => {
    const s = blankMatch();
    put(s, 'player', 'left', 'inf-kathra', 300);
    put(s, 'enemy', 'left', KNIGHT, 100); // Kathra wins her lane and stays in play
    put(s, 'player', 'center', KNIGHT, 50);
    put(s, 'enemy', 'center', KNIGHT, 200); // our center Knight dies in the Clash (not our effect)
    const plays: PlayerAction = sacrifice ? { plays: [{ handId: hand(s, 'player', 'spl-dark-ritual').handId, cardId: 'spl-dark-ritual', lane: 'center' }] } : NONE;
    const r = resolveCardRound(s, plays, NONE);
    const burns = r.events.filter((e) => e.type === 'DIRECT_DAMAGE' && e.sourceName === 'Kathra, Blood Queen');
    return { damage: burns.reduce((a, e) => a + (e.type === 'DIRECT_DAMAGE' ? e.amount : 0), 0), growth: unitIn(r.nextState, 'player', 'left').power - 300 };
  };
  it('a Clash death grows her but deals no damage', () => {
    const r = round(false);
    expect(r.growth).toBe(15);
    expect(r.damage).toBe(0);
  });
  it('Dark Ritual destroying your own Unit is a sacrifice: growth and 45 damage', () => {
    const r = round(true);
    expect(r.growth).toBe(15);
    expect(r.damage).toBe(45);
  });
});
