import { describe, expect, it } from 'vitest';
import type { ActionDef } from '../types';
import { getCard } from './index';
import { PLAYTEST_ROSTER } from './roster';
import { TOKEN_CARDS } from './tokens';
import { atkDelta, atkFromPower, cardFaceStats, deckStartingHp, HP_CONTRIBUTION_HELP } from './cardFace';
import { cardEffectLines, hasEffectCopy, TIMING_LABEL } from './effectText';
import { cardEffects, cardKeywords, cardSearchText } from './cardPresentation';

const MINUS = '−';
const signedAtk = (powerDelta: number) => `${powerDelta < 0 ? MINUS : '+'}${Math.abs(atkDelta(powerDelta))} ATK`;
const withEffects = [...PLAYTEST_ROSTER.map(getCard), ...TOKEN_CARDS].filter((card) => card.abilities.length > 0);

/** The ATK strings a line must mention, derived from the engine actions it describes. */
function expectedAtk(action: ActionDef): string | null {
  switch (action.type) {
    case 'CHANGE_POWER':
    case 'DEBUFF_ALL_OTHERS':
      return signedAtk(action.amount);
    case 'CHANGE_POWER_BY_COUNT':
      return signedAtk(action.perCount);
    case 'REVIVE_SELF':
      return `${atkFromPower(action.power)} ATK`;
    case 'DAMAGE_HERO':
      return action.legacyPowerSet !== undefined ? `${atkFromPower(action.legacyPowerSet)} ATK` : action.legacyPowerChange ? signedAtk(-action.legacyPowerChange) : null;
    case 'DESTROY':
      return action.maxPower !== undefined && action.maxPower !== null ? `${atkFromPower(action.maxPower)} ATK` : null;
    case 'GRANT_BYPASS':
      return action.reduction ? signedAtk(-action.reduction) : null;
    default:
      return null;
  }
}

describe('card face stats', () => {
  it('prints the approved card-combat ATK and HP Contribution', () => {
    expect(cardFaceStats(getCard('kng-light-priest'))).toEqual({ atk: 78, hpContribution: 103 });
    expect(cardFaceStats(getCard('kng-common-knight'))).toEqual({ atk: 128, hpContribution: 62 });
    expect(cardFaceStats(getCard('spl-fireball'))).toBeNull();
  });

  it('live Power changes ATK only, and keeps the same lane winner as Power', () => {
    const knight = getCard('kng-common-knight');
    expect(cardFaceStats(knight, 8)).toEqual({ atk: 158, hpContribution: 62 });
    for (let a = 1; a < 12; a++) for (let b = 1; b < 12; b++) expect(Math.sign(atkFromPower(a) - atkFromPower(b))).toBe(Math.sign(a - b));
  });

  it('starting HP is the sum of Unit HP Contributions; Spells add nothing', () => {
    expect(deckStartingHp(['kng-light-priest', 'spl-fireball', 'kng-common-knight'].map(getCard))).toBe(165);
    expect(HP_CONTRIBUTION_HELP).toBe('HP Contribution — adds this amount to your starting HP.');
  });
});

describe('player-facing effect copy', () => {
  it('covers every roster card and token that has an effect, one line per ability', () => {
    for (const card of withEffects) {
      expect(hasEffectCopy(card.id), card.id).toBe(true);
      expect(cardEffectLines(card).map((line) => line.text).every(Boolean), card.id).toBe(true);
      expect(cardEffectLines(card)).toHaveLength(card.abilities.length);
    }
  });

  it('states the same ATK numbers the engine applies (1 Power = 15 ATK)', () => {
    for (const card of withEffects) {
      cardEffectLines(card).forEach((line, index) => {
        for (const action of card.abilities[index].actions) {
          const atk = expectedAtk(action);
          if (atk) expect(line.text, `${card.id} #${index}`).toContain(atk);
        }
      });
    }
  });

  it('uses player vocabulary: no Hero, Power, abbreviations or leftover trigger prefixes', () => {
    for (const card of withEffects) {
      const texts = [...cardEffects(card, { rules: 'legacy' }).map((effect) => effect.compact), ...cardEffectLines(card).map((line) => line.text)];
      for (const text of texts) {
        expect(text, card.id).not.toMatch(/\bHero(es)?\b|\bPower\b|\bw\/|\bAdj\b|\bdmg\b|\brnd\b|\bBC:|\bGrv\b|;/);
        expect(text, card.id).not.toMatch(/^(On Play|Before Combat|On Death):/);
      }
    }
  });

  it('gives every effect its own compact battle line, authored, never cut from the full rule', () => {
    for (const card of withEffects) {
      for (const rules of ['card', 'legacy'] as const) {
        for (const effect of cardEffects(card, { rules })) {
          expect(effect.compact.length, card.id).toBeGreaterThan(0);
          expect(effect.compact, card.id).not.toMatch(/…|\.\.\.$/);
          expect(effect.compact, card.id).toMatch(/[.!]$/);
        }
      }
    }
    expect(cardEffects('kng-common-knight')).toHaveLength(0);
  });

  it('labels each line with a normalized timing', () => {
    const lines = cardEffectLines(getCard('inf-pit-fiend'));
    expect(lines.map((line) => line.label)).toEqual(['Destroyed', 'Clash']);
    expect(lines[1].text).toBe('If an enemy Unit was destroyed this round, gain +30 ATK this round.');
    expect(Object.values(TIMING_LABEL)).toContain('Direct Attack');
    expect(cardEffectLines(getCard('und-grave-knight'))[1].oncePerRound).toBe(true);
  });

  it('replaces the old debug shorthand on Royal Guard', () => {
    const guard = getCard('kng-royal-guard');
    expect(guard.boardText).toBe('Adj+1; Spell Immune w/ally');
    expect(cardEffects(guard)[0].compact).toBe('Adjacent allies +15 ATK.');
    expect(cardEffectLines(guard)[0]).toMatchObject({ label: 'On Play', text: 'Adjacent allied Units gain +15 ATK for the rest of the battle.' });
  });

  it('falls back to normalized engine text for cards outside the curated roster', () => {
    const evolved = { ...getCard('kng-royal-guard').abilities[0], text: 'On Play: adjacent allied Heroes gain +2 Power.' };
    expect(cardEffectLines(getCard('kng-royal-guard'), [evolved])[0].text).toBe('Adjacent allied Units gain +30 ATK.');
  });

  it('derives explainable keywords from actions and finds effect text in search', () => {
    expect(cardKeywords(getCard('kng-paladin'))).toEqual(['Shield', 'Guard']);
    expect(cardKeywords(getCard('spl-battle-banner'))).toEqual(['Continuous Spell']);
    expect(cardSearchText(getCard('kng-paladin'))).toContain('shield');
    expect(cardSearchText('kng-royal-guard')).toContain('adjacent allies +15 atk');
    expect(cardSearchText('kng-royal-guard')).toContain('rare');
  });
});
