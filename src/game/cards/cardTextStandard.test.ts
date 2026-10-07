import { describe, expect, it } from 'vitest';
import { LAUNCH_CARD_IDS } from './launchRoster';
import { CARD_GLOSSARY, cardEffects, TIMING_LABEL } from './cardPresentation';
import { getCard } from './index';

// The card-text standard (docs/CARD-TEXT.md): every launch card's text uses the approved labels and words.
const APPROVED_LABELS = new Set(['Passive', 'Cast', 'Clash', 'Round Start', 'Round End', 'Destroyed', 'Ally Falls', 'Enemy Falls', 'Direct Attack', 'When you cast a Spell', 'When the enemy casts a Spell']);
const KEYWORD_LABEL = /^(Shield|Guard [1-3])$/;

/** Old or vague wording the standard replaced, with what to say instead. */
const BANNED: [RegExp, string][] = [
  [/\bhere\b/i, '"in this lane"'],
  [/\b(may|nearby|empower\w*|weaken\w*|curse[sd]?|fallen|grave)\b/i, 'a plain game word'],
  [/restore strength/i, 'a plain game word'],
  [/\ballied\b|\bcontrol\b/i, '"your Units" / "you have"'],
  [/Continuous Spell/, '"Spell in play"'],
  [/\b(dies|died)\b/i, '"is destroyed"'],
  [/\bif losing\b|\bfell\b/i, '"would lose its lane" / "was destroyed"'],
  [/\bgain (your|a random|a Graveyard)\b/i, '"return ... to your hand"'],
  [/\bOn Play\b|\bBefore Combat\b/, 'the approved timing labels'],
];

const effectsOf = (id: string) => cardEffects(id).map((e) => ({ id, ...e }));
const all = LAUNCH_CARD_IDS.flatMap(effectsOf);

describe('card-text standard', () => {
  it('every launch card with an ability has non-empty rules text on every surface', () => {
    for (const id of LAUNCH_CARD_IDS) {
      const effects = cardEffects(id);
      if (getCard(id).abilities.length > 0) expect(effects.length, id).toBeGreaterThan(0);
      for (const e of effects) for (const t of [e.compact, e.board, e.full]) expect(t.trim().length, id).toBeGreaterThan(0);
    }
  });

  it('every effect uses one approved timing label or a keyword (Shield, Guard N)', () => {
    for (const e of all) expect(APPROVED_LABELS.has(e.label) || KEYWORD_LABEL.test(e.label), `${e.id}: ${e.label}`).toBe(true);
    for (const trigger of ['BEFORE_COMBAT', 'ON_DEATH', 'ON_ALLY_SPELL_PLAYED', 'ON_ENEMY_SPELL_PLAYED'] as const) expect(APPROVED_LABELS.has(TIMING_LABEL[trigger])).toBe(true);
  });

  it('a keyword prints alone on the card ("Guard 2.", "Shield.")', () => {
    for (const e of all.filter((x) => x.keyword)) expect(e.compact.startsWith(e.label), `${e.id}: ${e.compact}`).toBe(true);
  });

  it('no card uses the old or vague wording', () => {
    for (const e of all) {
      for (const [pattern, instead] of BANNED) {
        for (const t of [e.compact, e.board, e.full]) expect(t, `${e.id}: "${t}" (use ${instead})`).not.toMatch(pattern);
      }
    }
  });

  it('every ATK change it gives says how long it lasts', () => {
    for (const e of all) {
      for (const sentence of e.full.split(/(?<=\.)\s+/)) {
        if (/\bgive\b.*[+−]\d+ (more )?ATK/i.test(sentence)) {
          expect(sentence, e.id).toMatch(/this round|for the rest of the battle/);
        }
      }
    }
  });

  it('a once-per-round effect says so (a "2nd Spell this round" or Direct Attack effect can only happen once a round anyway)', () => {
    for (const e of all.filter((x) => x.oncePerRound)) expect(`${e.label}: ${e.compact}`, e.id).toMatch(/Once per round|each round|2nd Spell this round|^Direct Attack/);
  });

  it('the glossary defines every card word in short, plain sentences', () => {
    const terms = CARD_GLOSSARY.map((g) => g.term);
    for (const term of ['Clash', 'Round Start', 'Round End', 'Destroyed', 'Graveyard', 'Shield', 'Guard', 'Lane Spell', 'Attached Spell', 'Revive', 'Summon', 'Exile', 'this round', 'for the rest of the battle', 'once per battle']) {
      expect(terms, term).toContain(term);
    }
    for (const g of CARD_GLOSSARY) expect(g.text.length, g.term).toBeLessThanOrEqual(110);
  });
});
