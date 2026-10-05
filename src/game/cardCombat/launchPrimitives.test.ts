import { describe, expect, it } from 'vitest';
import type { GameState, HeroInstance, LaneId, PlayerAction, Side, SpellZoneInstance } from '../types/index.js';
import { getCard } from '../cards/index.js';
import { STARTER_DECKS } from '../cards/starterDecks.js';
import { beginCardRound, cardAtk, createCardMatch, resolveCardRound } from './engine.js';

// The launch set's new engine primitives (docs/CARD-COMBAT-DESIGN.md, launch set): a Units-only Graveyard count, a
// capped count, "would lose its lane" targeting, the Attached Spell return without loops, a revive into an empty lane,
// a once-per-battle lane Spell per physical copy, and the enemy-Spell condition (cast this round OR in play). Each is
// checked through the real round resolver on a hand-built board, with plain ATK numbers rather than win rates.

const KNIGHT = 'kng-common-knight'; // vanilla: no effect
const NONE: PlayerAction = { plays: [] };

function blankMatch(): GameState {
  const s = createCardMatch({ seed: 5, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead }).nextState;
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
  const unit: HeroInstance = { instanceId: `lp-${uid++}`, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power: atk, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, enteredRound: 0, entryAtk: atk };
  s[side].heroZones[lane] = unit;
  return unit;
}
function spellIn(s: GameState, side: Side, lane: LaneId, cardId: string, extra: Partial<SpellZoneInstance> = {}): SpellZoneInstance {
  const card = getCard(cardId);
  const zone: SpellZoneInstance = { instanceId: `lz-${uid++}`, cardId, faction: card.faction, name: card.name, shortName: card.shortName, usedThisRound: false, ...extra };
  s[side].spellZones[lane] = zone;
  return zone;
}
function grave(s: GameState, side: Side, cards: string[]) {
  s[side].graveyard = [...cards];
  s.cardCombat!.graveMarks[side] = cards.map(() => false);
}
function hand(s: GameState, side: Side, cardId: string) {
  const h = { handId: `h-${side}-${uid++}`, cardId };
  s[side].hand.push(h);
  return h;
}
const destroyed = (r: ReturnType<typeof resolveCardRound>, unit: HeroInstance) => r.events.some((e) => e.type === 'HERO_DESTROYED' && e.instanceId === unit.instanceId);

describe('Units-only Graveyard count (Grave Sexton, Bone Wall)', () => {
  const heal = (graveyard: string[]) => {
    const s = blankMatch();
    s.player.hp = s.player.maxHp! - 200;
    put(s, 'player', 'left', 'und-grave-sexton', 300);
    grave(s, 'player', graveyard);
    return resolveCardRound(s, NONE, NONE).nextState.player.hp - s.player.hp;
  };
  it('3 Units in the Graveyard restore 45 HP; Spells in the Graveyard do not count', () => {
    expect(heal(['und-bone-soldier', 'und-cursed-warrior', KNIGHT])).toBe(45);
    expect(heal(['und-bone-soldier', 'und-cursed-warrior', 'spl-raise-fallen', 'spl-second-chance'])).toBe(0);
  });
});

describe('capped Graveyard count (Bone Dragon: +15 per Unit, up to +45)', () => {
  const clash = (units: number, enemyAtk: number) => {
    const s = blankMatch();
    const dragon = put(s, 'player', 'left', 'und-bone-dragon', 92);
    const foe = put(s, 'enemy', 'left', KNIGHT, enemyAtk);
    grave(s, 'player', Array.from({ length: units }, () => 'und-bone-soldier'));
    const r = resolveCardRound(s, NONE, NONE);
    return { dragonDied: destroyed(r, dragon), foeDied: destroyed(r, foe) };
  };
  it('counts Units: 2 give +30, 3 give +45', () => {
    expect(clash(2, 130).dragonDied).toBe(true); // 122 < 130
    expect(clash(3, 130).foeDied).toBe(true); // 137 > 130
  });
  it('never more than +45, however full the Graveyard', () => {
    expect(clash(8, 140).dragonDied).toBe(true); // capped at 137 < 140
  });
});

describe('"would lose its lane" targeting (Dawnshield Paladin: adjacent allies that would lose gain +15)', () => {
  it('lifts an adjacent ally that would lose, and only adjacent ones', () => {
    const s = blankMatch();
    put(s, 'player', 'center', 'kng-paladin', 400);
    const left = put(s, 'player', 'left', KNIGHT, 120);
    const leftFoe = put(s, 'enemy', 'left', KNIGHT, 130);
    const r = resolveCardRound(s, NONE, NONE);
    expect(destroyed(r, leftFoe)).toBe(true); // 120 + 15 = 135 > 130
    expect(destroyed(r, left)).toBe(false);

    const t = blankMatch();
    put(t, 'player', 'left', 'kng-paladin', 400);
    const right = put(t, 'player', 'right', KNIGHT, 120); // not adjacent to the left lane
    put(t, 'enemy', 'right', KNIGHT, 130);
    expect(destroyed(resolveCardRound(t, NONE, NONE), right)).toBe(true);
  });
});

describe('revive into an empty lane (Morwen)', () => {
  it('brings the weakest Undead Unit back into the first empty lane', () => {
    const s = blankMatch();
    put(s, 'player', 'center', 'und-morwen', 400);
    grave(s, 'player', ['und-bone-soldier', KNIGHT]);
    const r = resolveCardRound(s, NONE, NONE).nextState;
    const revived = (['left', 'right'] as LaneId[]).map((l) => r.player.heroZones[l]?.cardId).filter(Boolean);
    expect(revived).toEqual(['und-bone-soldier']);
    expect(r.player.graveyard).not.toContain('und-bone-soldier');
  });
  it('with no empty lane, nothing is revived', () => {
    const s = blankMatch();
    put(s, 'player', 'center', 'und-morwen', 400);
    put(s, 'player', 'left', KNIGHT, 400);
    put(s, 'player', 'right', KNIGHT, 400);
    grave(s, 'player', ['und-bone-soldier']);
    expect(resolveCardRound(s, NONE, NONE).nextState.player.graveyard).toContain('und-bone-soldier');
  });
});

describe('Attached Spell return without loops (Saint Aveline)', () => {
  it('an expiring Attached Spell returns to hand once; the returned copy goes to the Graveyard next time', () => {
    const s = blankMatch();
    put(s, 'player', 'center', 'kng-saint-aveline', 400);
    put(s, 'player', 'left', KNIGHT, 60);
    put(s, 'enemy', 'left', KNIGHT, 300);
    const banner = hand(s, 'player', 'spl-battle-banner');
    const first = resolveCardRound(s, { plays: [{ handId: banner.handId, cardId: 'spl-battle-banner', lane: 'left' }] }, NONE).nextState;
    const back = first.player.hand.find((h) => h.cardId === 'spl-battle-banner');
    expect(back).toBeDefined();
    expect(first.player.graveyard).not.toContain('spl-battle-banner');

    const next = beginCardRound(first).nextState;
    next.player.hand = next.player.hand.filter((h) => h.cardId === 'spl-battle-banner');
    const knight = hand(next, 'player', KNIGHT);
    next.enemy.heroZones.left = null;
    put(next, 'enemy', 'left', KNIGHT, 300);
    const again = next.player.hand.find((h) => h.cardId === 'spl-battle-banner')!;
    const second = resolveCardRound(next, { plays: [{ handId: knight.handId, cardId: KNIGHT, lane: 'left' }, { handId: again.handId, cardId: 'spl-battle-banner', lane: 'left' }] }, NONE).nextState;
    expect(second.player.hand.some((h) => h.cardId === 'spl-battle-banner')).toBe(false);
    expect(second.player.graveyard).toContain('spl-battle-banner');
  });
});

describe('once per battle per physical lane Spell (Grave Totem)', () => {
  it('the first ally lost in its lane returns to hand; the second does not', () => {
    const s = blankMatch();
    const totem = spellIn(s, 'player', 'left', 'spl-grave-totem');
    put(s, 'player', 'left', KNIGHT, 60);
    put(s, 'enemy', 'left', KNIGHT, 300);
    const first = resolveCardRound(s, NONE, NONE).nextState;
    expect(first.player.hand.map((h) => h.cardId)).toContain(KNIGHT);
    expect(first.player.spellZones.left).toMatchObject({ instanceId: totem.instanceId, usedThisBattle: true });

    const next = beginCardRound(first).nextState;
    next.player.hand = [];
    put(next, 'player', 'left', 'kng-pikeman', 60);
    const second = resolveCardRound(next, NONE, NONE).nextState;
    expect(second.player.graveyard).toContain('kng-pikeman');
  });
  it('a new copy of the Totem starts fresh', () => {
    const s = blankMatch();
    spellIn(s, 'player', 'left', 'spl-grave-totem', { usedThisBattle: false });
    put(s, 'player', 'left', KNIGHT, 60);
    put(s, 'enemy', 'left', KNIGHT, 300);
    expect(resolveCardRound(s, NONE, NONE).nextState.player.hand.map((h) => h.cardId)).toContain(KNIGHT);
  });
});

describe('enemy Spell condition: cast this round OR in play (Grave Totem +30)', () => {
  const totemClash = (setup: (s: GameState) => PlayerAction) => {
    const s = blankMatch();
    spellIn(s, 'player', 'left', 'spl-grave-totem', { usedThisBattle: true });
    put(s, 'player', 'left', KNIGHT, 120);
    const foe = put(s, 'enemy', 'left', KNIGHT, 140);
    const enemyAction = setup(s);
    return destroyed(resolveCardRound(s, NONE, enemyAction), foe);
  };
  it('no enemy Spell: no bonus (120 < 140)', () => {
    expect(totemClash(() => NONE)).toBe(false);
  });
  it('an enemy Spell in play anywhere: +30 (150 > 140)', () => {
    expect(totemClash((s) => { spellIn(s, 'enemy', 'right', 'spl-cursed-ground'); return NONE; })).toBe(true);
  });
  it('an enemy Spell cast this round: +30', () => {
    expect(totemClash((s) => {
      put(s, 'enemy', 'right', KNIGHT, 100);
      const bolt = hand(s, 'enemy', 'spl-cinder-bolt');
      return { plays: [{ handId: bolt.handId, cardId: 'spl-cinder-bolt', lane: 'right' }] };
    })).toBe(true);
  });
});
