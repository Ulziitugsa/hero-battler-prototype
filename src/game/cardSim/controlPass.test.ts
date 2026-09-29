import { describe, expect, it } from 'vitest';
import { validateDeck } from '../engine/deckRules';
import { getCard } from '../cards';
import { BASE_RULES, type Rules, createSimState, resolveRound } from './engine';
import { getStatModel } from './statModels';
import { APPROVED_REBAND, applyCardPatches, withCardPatches } from './overrides';
import { ARCANE_CONTROL_V2, CONTROL_PATCH_SETS, CONTROL_PROPOSAL } from './controlPass';

const baseline = getStatModel('baseline');
const KNIGHT = 'kng-common-knight';
const IMP = 'inf-flame-imp';
const RULES: Rules = { ...BASE_RULES, recursionCap: 1 };

/** Both players hold exactly these hands with empty decks; eight Knights in each deck list give them Starting HP. */
function board(handA: string[], handB: string[]) {
  const hp = Array.from({ length: 8 }, () => KNIGHT);
  const s = createSimState({ model: baseline, rules: RULES, sides: [{ deck: [...handA, ...hp], policy: 'balanced' }, { deck: [...handB, ...hp], policy: 'balanced' }], seed: 1 });
  s.players[0].deck = [];
  s.players[1].deck = [];
  s.players[0].hand = [...handA];
  s.players[1].hand = [...handB];
  return s;
}

describe('control pass (sim-only card patches)', () => {
  it('restores the printed cards after a patched run', () => {
    const printed = getCard('spl-stasis-field').abilities;
    const vharos = getCard('und-vharos').power;
    withCardPatches([APPROVED_REBAND, CONTROL_PROPOSAL], () => {
      expect(getCard('spl-stasis-field').abilities).not.toBe(printed);
      expect(getCard('und-vharos').power).toBe(6);
    });
    expect(getCard('spl-stasis-field').abilities).toBe(printed);
    expect(getCard('und-vharos').power).toBe(vharos);
  });

  it('rebuilds Arcane Control as a legal deck with at least 8 Units', () => {
    expect(validateDeck(ARCANE_CONTROL_V2).errors).toEqual([]);
    expect(ARCANE_CONTROL_V2.filter((id) => getCard(id).type === 'hero').length).toBeGreaterThanOrEqual(8);
  });

  it('Stasis Field (proposal) stops an unopposed attacker and leaves it 15 ATK smaller', () => {
    withCardPatches([CONTROL_PATCH_SETS.stasisPacifyMark], () => {
      const s = board(['spl-stasis-field'], [KNIGHT]);
      resolveRound(s, [[], [{ cardId: KNIGHT, lane: 0 }]]);
      const hpA = s.players[0].hp;
      const atk = s.players[1].units[0]!.atk;
      resolveRound(s, [[{ cardId: 'spl-stasis-field', lane: 0 }], []]);
      expect(s.players[0].hp).toBe(hpA);
      expect(s.players[1].units[0]!.atk).toBe(atk - 15);
      // Next round it attacks again.
      resolveRound(s, [[], []]);
      expect(s.players[0].hp).toBe(hpA - (atk - 15));
    });
  });

  it('PLAYER_SHIELD prevents up to amount x 45 HP this round only', () => {
    withCardPatches([CONTROL_PATCH_SETS.aegisShield3], () => {
      const s = board(['spl-aegis-ward'], [KNIGHT]);
      const hpA = s.players[0].hp;
      const atk = baseline.stats(getCard(KNIGHT)).atk;
      resolveRound(s, [[{ cardId: 'spl-aegis-ward', lane: 1 }], [{ cardId: KNIGHT, lane: 0 }]]);
      expect(s.players[0].hp).toBe(hpA);
      expect(s.totals[0].prevented).toBe(atk);
      expect(s.players[0].shield).toBe(0);
    });
  });

  it('Grave Sage (proposal) returns a Spell from the Graveyard, once per card per match', () => {
    withCardPatches([CONTROL_PATCH_SETS.sageRecall], () => {
      const s = board(['spl-weakness', 'und-grave-sage', 'und-grave-sage'], [IMP]);
      s.players[0].grave = ['spl-weakness'];
      s.players[0].returns['spl-weakness'] = 0;
      resolveRound(s, [[{ cardId: 'und-grave-sage', lane: 0 }], []]);
      expect(s.players[0].hand).toContain('spl-weakness');
      s.players[0].hand = s.players[0].hand.filter((id) => id !== 'spl-weakness');
      s.players[0].grave.push('spl-weakness');
      resolveRound(s, [[{ cardId: 'und-grave-sage', lane: 1 }], []]);
      expect(s.players[0].hand).not.toContain('spl-weakness');
    });
  });

  it('leaves unpatched cards alone when a patch set is applied and removed', () => {
    const restore = applyCardPatches(CONTROL_PROPOSAL);
    expect(getCard('spl-weakness').abilities[0].actions[0]).toMatchObject({ type: 'CHANGE_POWER', amount: -3 });
    restore();
    expect(getCard('kng-archmage-vael').abilities.length).toBe(2);
  });
});
