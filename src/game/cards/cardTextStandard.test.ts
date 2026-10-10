import { describe, expect, it } from 'vitest';
import { LAUNCH_CARD_IDS } from './launchRoster';
import { CARD_GLOSSARY, cardEffects, TIMING_LABEL } from './cardPresentation';
import { getCard } from './index';

// The card-text standard (docs/CARD-TEXT.md): every launch card's text uses the approved labels and words.
const APPROVED_LABELS = new Set(['Passive', 'Cast', 'Clash', 'Round Start', 'Round End', 'Destroyed', 'Ally Falls', 'Enemy Falls', 'Direct Attack', 'When you cast a Spell', 'When the enemy casts a Spell']);
const KEYWORD_LABEL = /^(Shield|Guard [1-3])$/;

/** Old or vague wording the standard replaced, with what to say instead. */
const BANNED: [RegExp, string][] = [
  [/\b(may|nearby|empower\w*|weaken\w*|curse[sd]?|fallen|grave)\b/i, 'a plain game word'],
  [/restore strength/i, 'a plain game word'],
  [/\ballied\b|\bcontrol\b/i, '"your Units" / "you have"'],
  [/Continuous Spell/, '"Spell in play"'],
  [/\b(dies|died)\b/i, '"is destroyed"'],
  [/\bfell\b/i, '"was destroyed"'],
  [/\bgain (your|a random|a Graveyard)\b/i, '"return ... to your hand"'],
  [/\bOn Play\b|\bBefore Combat\b/, 'the approved timing labels'],
];

/** Shortcuts a card face must spell out (ozi 2026-10-07): the face explains the effect without Inspect. */
const FACE_BANNED: [RegExp, string][] = [
  [/\b(Shield|Guard \d)\.?$/, 'its meaning ("Survives destruction once.", "If this would lose its lane, it gets +30 ATK this round.")'],
  [/\bGuard\b/, '"If this would lose its lane, it gets +15 ATK this round."'],
  [/\bBypass\b/, '"attacks the enemy player directly"'],
  [/\bif losing\b/i, '"if this would lose its lane"'],
  [/\bwhen this fights\b/i, '"Before lanes fight," (it happens even with no enemy Unit)'],
  [/\bfor the (rest of the )?battle\b/i, '"until the battle ends"'],
  [/\bevery round\b/i, '"At the end of each round," / "this round"'],
  [/^(Clash|Passive|Direct Attack|Your Spell|Enemy Spell|Round Start|Round End|Destroyed):/, 'a natural sentence ("Before lanes fight, ...")'],
  [/\badjacent\b/i, '"allies next to this"'],
  [/\bhere\b/i, '"in this lane"'],
  [/\bAttached Unit\b/i, '"The Unit with this Spell"'],
  [/−\d/, '"loses 15 ATK"'],
  [/an empty lane/, '"one of your empty lanes"'],
];
/** The full line keeps the exact rules words. */
const FULL_BANNED: [RegExp, string][] = [
  [/\bhere\b/i, '"in this lane"'],
  [/\bif losing\b/i, '"would lose its lane"'],
  [/\badjacent\b/i, '"next to this Unit"'],
  [/\battached Unit\b/i, '"the Unit with this Spell"'],
];

/** Longest face sentence and face box (all effects) a launch card may print; the card lab checks they fit at 390px. */
const FACE_LINE_MAX = 130;
const FACE_BOX_MAX = 280;

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

  it('every effect uses one approved timing label or a keyword (Shield, Guard N) in the panels, and none on the face', () => {
    for (const e of all) expect(APPROVED_LABELS.has(e.label) || KEYWORD_LABEL.test(e.label), `${e.id}: ${e.label}`).toBe(true);
    // The card face prints no timing label: each effect is one natural sentence that says when it happens.
    for (const e of all) expect(e.faceLabel, `${e.id}: ${e.faceLabel}`).toBe('');
    for (const trigger of ['BEFORE_COMBAT', 'ON_DEATH', 'ON_ALLY_SPELL_PLAYED', 'ON_ENEMY_SPELL_PLAYED'] as const) expect(APPROVED_LABELS.has(TIMING_LABEL[trigger])).toBe(true);
  });

  it('a card face spells out keywords and shortcuts in plain words', () => {
    for (const e of all) {
      for (const [pattern, instead] of FACE_BANNED) {
        for (const t of [e.compact, e.board]) expect(t, `${e.id}: "${t}" (say ${instead})`).not.toMatch(pattern);
      }
    }
  });

  it('no card uses the old or vague wording', () => {
    for (const e of all) {
      for (const [pattern, instead] of BANNED) {
        for (const t of [e.compact, e.board, e.full]) expect(t, `${e.id}: "${t}" (use ${instead})`).not.toMatch(pattern);
      }
      for (const [pattern, instead] of FULL_BANNED) expect(e.full, `${e.id}: "${e.full}" (use ${instead})`).not.toMatch(pattern);
    }
  });

  it('the card face is short battle text: one sentence per effect, a short box per card', () => {
    for (const e of all) expect(e.compact.length, `${e.id}: ${e.compact}`).toBeLessThanOrEqual(FACE_LINE_MAX);
    for (const id of LAUNCH_CARD_IDS) {
      const box = cardEffects(id).map((e) => e.compact).join(' ');
      expect(box.length, `${id}: ${box}`).toBeLessThanOrEqual(FACE_BOX_MAX);
    }
  });

  it('the card face keeps how long an ATK change lasts ("this round", "until the battle ends")', () => {
    for (const e of all) {
      if (/until the battle ends/.test(e.full)) expect(e.compact, e.id).toMatch(/until the battle ends/);
      if (/ATK this round/.test(e.full)) expect(e.compact, e.id).toMatch(/this round|\+\d+ more\b/);
      // A gain or loss that is not always on (a Passive's "gets +15 ATK" lasts while it is in play) says how long.
      const always = e.trigger === 'PASSIVE' || e.trigger === 'CONTINUOUS';
      if (!always && /\b(gets?|loses?) \+?\d+ ATK/.test(e.compact)) expect(e.compact, e.id).toMatch(/this round|until the battle ends/);
    }
  });

  it('damage to a player names the enemy player', () => {
    for (const e of all) {
      if (/\bdeal \d+ (more |extra )?damage\b/i.test(e.compact)) expect(e.compact, e.id).toMatch(/enemy player/);
    }
  });

  it('every ATK change it gives says how long it lasts', () => {
    for (const e of all) {
      for (const sentence of e.full.split(/(?<=\.)\s+/)) {
        if (/\bgive\b.*[+−]\d+ (more )?ATK/i.test(sentence)) {
          expect(sentence, e.id).toMatch(/this round|until the battle ends/);
        }
      }
    }
  });

  it('a once-per-round effect says so (a "2nd Spell this round" or Direct Attack effect can only happen once a round anyway)', () => {
    for (const e of all.filter((x) => x.oncePerRound)) {
      expect(e.compact, e.id).toMatch(/Once per round|each round|2nd Spell|^When this attacks the enemy player directly/);
      expect(`${e.label}: ${e.full}`, e.id).toMatch(/Once per round|each round|2nd Spell this round|^Direct Attack/);
    }
  });

  it('the glossary defines every card word in short, plain sentences', () => {
    const terms = CARD_GLOSSARY.map((g) => g.term);
    for (const term of ['Clash', 'Round Start', 'Round End', 'Destroyed', 'Graveyard', 'Shield', 'Guard', 'Lane Spell', 'Attached Spell', 'Revive', 'Summon', 'Exile', 'Before lanes fight', 'Bypass', 'Would lose its lane', 'this round', 'until the battle ends', 'once per battle']) {
      expect(terms, term).toContain(term);
    }
    for (const g of CARD_GLOSSARY) expect(g.text.length, g.term).toBeLessThanOrEqual(110);
  });
});
