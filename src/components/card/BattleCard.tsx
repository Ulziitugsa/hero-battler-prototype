import { useLayoutEffect, useRef } from 'react';
import { getCard } from '../../game/cards';
import { cardAtk } from '../../game/cardCombat/engine';
import { cardCombatBattleEffects } from '../../game/cardCombat/cardText';
import { CardArtwork } from '../CardArtwork';
import { Gems, Sigil } from '../CardParts';
import { Icon } from '../Icon';
import { AtkIcon } from './CardIcons';
import '../../styles/collectible.css';
import '../../styles/battleCard.css';

/**
 * A card-combat card as it reads in battle (Battle UX pass): large artwork, name and current ATK on one line, then
 * every combat effect as a compact row: a small timing chip and a short battle phrase (cardText.ts BATTLE_LINES).
 * Card Inspect keeps the full sentences, HP Contribution, Mastery and keyword help, but no rule lives only there.
 * Legacy battles, Collection and Deck Builder keep CollectibleCard.
 *
 * hand:  the largest battle version, full name.
 * board: the Unit in a Hero zone, short name; also shows whether conditional Passives are active.
 * spell: a Spell in a Spell zone (a Continuous Spell, or a one-time Spell staged for this round); no art.
 *
 * Text never ellipsizes and the card body never scrolls. If the effects don't fit, `useFitRules` tightens spacing,
 * then type (never below 9px), then gives up some artwork, and QA lists any card that needs the last levels.
 */
export type BattleCardVariant = 'hand' | 'board' | 'spell';

export interface BattleCardProps {
  cardId: string;
  variant: BattleCardVariant;
  /** Current ATK on the board (effective: base, this-round changes and Continuous Spells). Defaults to the printed ATK. */
  atk?: number;
  /** This-round ATK change, shown as a small chip. */
  tempAtk?: number;
  silenced?: boolean;
  shielded?: boolean;
  /** Always-on effects whose condition is currently met (true) or not (false), keyed by ability index. */
  passiveState?: ReadonlyMap<number, boolean>;
  /** Short name on the board; full name in hand. */
  name?: string;
}

/**
 * Presentation levels, tried in order until every effect shows: extra artwork when the effects are short, the
 * standard card (about half artwork), tighter spacing, 9.5px type, then less artwork and 9px type for the few
 * cards with the most text. There is no scrolling level.
 */
const CARD_LEVELS = ['roomy', 'base', 'tight', 'sm', 'art-md', 'art-sm', 'art-xs'] as const;
const SPELL_LEVELS = ['base', 'sm', 'xs'] as const;
/**
 * Name + ATK: on one row where the standard artwork allows; otherwise ATK moves to the artwork's corner so the name has
 * the full row, then (hand only) the short name. A name that still wraps is accepted at the last level.
 */
const HEADS = ['row', 'overlay', 'short'] as const;

/** Picks the first presentation level at which every effect shows, with the name on one line where possible. */
function useFitRules(levels: readonly string[], key: string) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    const el = root?.querySelector<HTMLElement>('.bc-rules');
    if (!root || !el) return;
    const name = root.querySelector<HTMLElement>('.bc-head .bc-name');
    const heads = name ? HEADS.filter((h) => h !== 'short' || name.querySelector('.bc-name-short')) : (['row'] as const);
    const rulesFit = () => el.scrollHeight <= el.clientHeight + 1;
    const nameFits = () => !name || name.clientHeight <= parseFloat(getComputedStyle(name).fontSize) * 1.6;
    // Name and ATK on one row wins over extra artwork, but not over giving up the standard artwork size.
    const steps: [string, string][] = [
      ...levels.filter((l) => !l.startsWith('art')).map((l): [string, string] => [l, 'row']),
      ...levels.flatMap((l) => heads.filter((h) => h !== 'row' || l.startsWith('art')).map((h): [string, string] => [l, h])),
    ];
    const fit = () => {
      for (const [level, head] of steps) {
        root.dataset.fit = level;
        root.dataset.head = head;
        if (rulesFit() && nameFits()) return;
      }
      // Nothing fit completely: keep the smallest level with the name on the fewest lines.
      root.dataset.head = heads[heads.length - 1];
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    return () => observer.disconnect();
  }, [levels, key]);
  return ref;
}

export function BattleCard({ cardId, variant, atk, tempAtk = 0, silenced = false, shielded = false, passiveState, name }: BattleCardProps) {
  const card = getCard(cardId);
  const unit = card.type === 'hero';
  const continuous = card.spellKind === 'CONTINUOUS';
  const effects = cardCombatBattleEffects(cardId);
  const printed = unit ? cardAtk(cardId) : 0;
  const current = atk ?? printed;
  const shift = current > printed ? 'up' : current < printed ? 'down' : '';
  const levels = variant === 'spell' ? SPELL_LEVELS : CARD_LEVELS;
  // Re-fit whenever something that changes the rules panel's length changes (the Silenced line, flags, states).
  const passiveKey = passiveState ? [...passiveState].map(([i, on]) => `${i}${on ? '+' : '-'}`).join(',') : '';
  const fitRef = useFitRules(levels, `${cardId}|${variant}|${silenced}|${shielded}|${tempAtk !== 0}|${passiveKey}`);
  const title = name ?? (variant === 'hand' ? card.name : card.shortName);

  return (
    <span className={`collectible battle-card v-${variant} r-${card.rarity} ${card.faction} ${unit ? 'is-unit' : 'is-spell'} ${silenced ? 'is-silenced' : ''}`} data-mode={`battle-${variant}`} data-fit={levels[0]} data-head="row" ref={fitRef}>
      <span className="collectible-frame" aria-hidden="true" />
      {card.rarity === 'legendary' && variant !== 'spell' && <span className="collectible-crest" aria-hidden="true" />}
      <span className="bc-body">
        {variant !== 'spell' && (
          <span className="bc-art">
            <CardArtwork cardId={cardId} animated={false} />
            <span className="bc-identity" aria-hidden="true">
              <Sigil faction={card.faction} size="sm" />
              <Gems rarity={card.rarity} />
            </span>
            {!unit && (
              <span className="bc-kind">
                <Icon name={continuous ? 'continuousSpell' : 'spell'} size={11} />
                {continuous ? 'Continuous' : 'Spell'}
              </span>
            )}
            {unit && tempAtk !== 0 && (
              <span className={`bc-temp ${tempAtk > 0 ? 'up' : 'down'}`} title="Until the end of this round">
                {tempAtk > 0 ? '+' : '−'}
                {Math.abs(tempAtk)} this round
              </span>
            )}
            {shielded && (
              <span className="bc-flag shield" title="Shield: survives the first time it would be destroyed">
                Shield
              </span>
            )}
          </span>
        )}
        {variant !== 'spell' && (
          <span className="bc-head">
            <span className="bc-name">
              {title}
              {/* A long full name gives way to the short name in hand when it would wrap (data-head="short"). */}
              {variant === 'hand' && !name && card.shortName !== card.name && <span className="bc-name-short">{card.shortName}</span>}
            </span>
            {unit && (
              <span className={`bc-atk ${shift}`} aria-label={`${current} ATK${shift ? `, printed ${printed}` : ''}`}>
                <AtkIcon size={10} />
                <strong>{current}</strong>
                {shift && <s className="bc-atk-printed">{printed}</s>}
              </span>
            )}
          </span>
        )}
        <span className="bc-rules">
          {variant === 'spell' && (
            <span className="bc-name">
              <Icon name={continuous ? 'continuousSpell' : 'spell'} size={10} />
              {title}
            </span>
          )}
          {silenced && <span className="bc-silenced">Silenced this round</span>}
          {effects.length === 0 && <span className="bc-none">No effect</span>}
          {effects.map((effect, i) => {
            const state = passiveState?.get(effect.abilityIndex);
            const live = state !== undefined && !silenced;
            return (
              <span className={`bc-effect ${state === false || silenced ? 'is-off' : ''}`} key={i} data-trigger={effect.trigger}>
                {/* A one-time Spell in its zone is being cast this round, so "On Play" goes without saying there. */}
                <span className={`bc-when ${variant === 'spell' && !continuous && effect.trigger === 'ON_PLAY' ? 'bc-when-implied' : ''}`}>
                  {live && <span className={`bc-state ${state ? 'on' : 'off'}`} role="img" aria-label={state ? 'active now' : 'inactive now'} title={state ? 'Active now' : 'Not active now'} />}
                  {effect.chip}
                </span>{' '}
                <span className="bc-text">{effect.compact}</span>
              </span>
            );
          })}
        </span>
      </span>
    </span>
  );
}
