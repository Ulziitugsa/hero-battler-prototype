import { Fragment, useLayoutEffect, useRef } from 'react';
import { getCard } from '../../game/cards';
import { cardAtk } from '../../game/cardCombat/engine';
import { cardCombatBattleEffects, type BattleEffectLine } from '../../game/cardCombat/cardText';
import { CardArtwork } from '../CardArtwork';
import { Gems, Sigil } from '../CardParts';
import { Icon } from '../Icon';
import '../../styles/collectible.css';
import '../../styles/battleCard.css';

/**
 * A card-combat card as it reads in battle (Battle UX pass), laid out as a collectible card in four zones inside the
 * rarity frame: a name bar, a framed art box (about half the card), a stats and identity row with ATK set into the
 * frame, and a text box with every combat effect as a short battle line after its small-caps timing label
 * ("On Play: Adjacent allies +15 ATK.", cardText.ts BATTLE_LINES). Effects that share a label read as one paragraph
 * under it. This is the first of three layers: a tap in battle opens the focus panel with the full rules and the
 * card's live state (BattleFocusPanel), and Card Inspect holds everything else.
 *
 * hand:    most readable; full name.
 * board:   compact but complete; short name; board wording; shows whether conditional Passives are active.
 * spell:   a Spell in a Spell zone (a Continuous Spell, or a one-time Spell staged for this round): name and text only.
 * inspect: the large face at the top of in-battle Card Inspect: the same card, larger, with HP Contribution beside
 *          ATK. Card Inspect lists the full rules wording under it.
 *
 * Text never ellipsizes and the card body never scrolls. If the effects don't fit, `useFitCard` tightens spacing,
 * then gives the text box what it needs from the art box (down to a floor), then steps the type down (never below
 * 9px), and sets the very longest text slightly condensed. Legacy battles, Collection and Deck Builder keep
 * CollectibleCard.
 */
export type BattleCardVariant = 'hand' | 'board' | 'spell' | 'inspect';

export interface BattleCardProps {
  cardId: string;
  variant: BattleCardVariant;
  /** Current ATK on the board (effective: base, this-round changes and Continuous Spells). Defaults to the printed ATK. */
  atk?: number;
  /** This-round ATK change, shown as a small flag on the art. */
  tempAtk?: number;
  silenced?: boolean;
  shielded?: boolean;
  /** Always-on effects whose condition is currently met (true) or not (false), keyed by ability index. */
  passiveState?: ReadonlyMap<number, boolean>;
  /** Short name on the board; full name in hand. */
  name?: string;
  /** Inspect only: this copy's HP Contribution. */
  hpContribution?: number;
}

/**
 * Presentation levels, tried in order until every effect shows (battleCard.css): a little extra art when the text is
 * short; the standard card; tighter spacing. A card with more text then keeps as much art as its effects leave
 * ("fill"), first at full type, then half a pixel smaller, then at 9px, then at 9px set 8% narrower, each with a floor
 * on the art box (a share of the card's height). No level scrolls.
 */
const CARD_LEVELS = ['roomy', 'base', 'tight'] as const;
const FILL_LEVELS = [
  ['fill', 44],
  ['sm-fill', 41],
  ['xs-fill', 30],
  ['xxs-fill', 26],
] as const;
/** Text is never cut off: the last level takes the art box below its floor if the effects still need it. */
const MIN_ART = 10;
/** Spell zones have no art to give, so their last level sets the 9px text slightly condensed, as long card text is. */
const SPELL_LEVELS = ['base', 'sm', 'xs', 'xxs'] as const;
/** The name stays on one line: full name, then a smaller size, then (hand) the short name. */
const NAME_FITS = ['full', 'full-sm', 'short', 'short-sm'] as const;

/** A number stays on the line with its unit ("+15 ATK", "90 damage", "Guard 2"), as on a printed card. */
const keepTogether = (text: string) => text.replace(/(\d) (ATK|HP|damage|more)\b/g, '$1\u00a0$2').replace(/\bGuard (\d)/g, 'Guard\u00a0$1');

function useFitCard(variant: BattleCardVariant, key: string) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    const rules = root?.querySelector<HTMLElement>('.bc-rules');
    if (!root || !rules) return;
    const name = root.querySelector<HTMLElement>('.bc-namebar .bc-name');
    const names = NAME_FITS.filter((n) => !n.startsWith('short') || root.querySelector('.bc-name-short'));
    const fits = () => rules.scrollHeight <= rules.clientHeight + 1;
    const fit = () => {
      root.style.removeProperty('--bc-art');
      root.style.removeProperty('--bc-art-top');
      if (name) {
        for (const n of names) {
          root.dataset.name = n;
          if (name.scrollWidth <= name.clientWidth + 1) break;
        }
        // A name that still doesn't fit wraps rather than clips.
        if (name.scrollWidth > name.clientWidth + 1) root.dataset.name = `${root.dataset.name} wrap`;
      }
      if (variant === 'spell') {
        for (const level of SPELL_LEVELS) {
          root.dataset.fit = level;
          if (fits()) return;
        }
        return;
      }
      for (const level of CARD_LEVELS) {
        root.dataset.fit = level;
        if (fits()) return;
      }
      // The effects need more room than the standard art box leaves: measure them and give the rest to the art.
      const body = rules.parentElement?.clientHeight ?? 0;
      const card = root.clientHeight;
      const art = root.querySelector<HTMLElement>('.bc-art');
      if (!body || !card || !art) return;
      const setArt = (px: number) => {
        const pct = (px / body) * 100;
        root.style.setProperty('--bc-art', `${pct.toFixed(2)}%`);
        root.style.setProperty('--bc-art-top', `${Math.min(0, (pct - 56) * 0.7).toFixed(1)}%`);
      };
      for (const [level, floor] of FILL_LEVELS) {
        root.dataset.fit = level;
        rules.style.flex = '0 0 auto';
        const need = rules.offsetHeight;
        rules.style.removeProperty('flex');
        const artNow = art.offsetHeight;
        // The art box once the text box has exactly what it needs.
        const artPx = Math.floor(artNow - (need - rules.offsetHeight));
        const last = level === 'xxs-fill';
        const floorPx = Math.ceil(((last && artPx < (floor / 100) * card ? MIN_ART : floor) / 100) * card);
        if (artPx >= floorPx || last) {
          let px = Math.min(artNow, Math.max(floorPx, artPx));
          setArt(px);
          // Heights round to whole pixels, so the estimate can be a pixel out: settle on the largest box that fits.
          for (let i = 0; i < 3 && px > floorPx && !fits(); i++) setArt(--px);
          for (let i = 0; i < 3 && px < artNow && fits(); i++) {
            setArt(px + 1);
            if (!fits()) break;
            px++;
          }
          setArt(px);
          return;
        }
      }
    };
    fit();
    // Web fonts change the measurements once they arrive; refit then too.
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    let live = true;
    fonts?.ready.then(() => live && fit());
    fonts?.addEventListener?.('loadingdone', fit);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(fit);
    observer?.observe(root);
    return () => {
      live = false;
      fonts?.removeEventListener?.('loadingdone', fit);
      observer?.disconnect();
    };
  }, [variant, key]);
  return ref;
}

export function BattleCard({ cardId, variant, atk, tempAtk = 0, silenced = false, shielded = false, passiveState, name, hpContribution }: BattleCardProps) {
  const card = getCard(cardId);
  const unit = card.type === 'hero';
  const continuous = card.spellKind === 'CONTINUOUS';
  const effects = cardCombatBattleEffects(cardId);
  const printed = unit ? cardAtk(cardId) : 0;
  const current = atk ?? printed;
  const shift = current > printed ? 'up' : current < printed ? 'down' : '';
  const title = name ?? (variant === 'board' || variant === 'spell' ? card.shortName : card.name);
  // Re-fit whenever something that changes the name or the text box's length changes (the Silenced line, state tags).
  const passiveKey = passiveState ? [...passiveState].map(([i, on]) => `${i}${on ? '+' : '-'}`).join(',') : '';
  const fitRef = useFitCard(variant, `${cardId}|${variant}|${title}|${silenced}|${passiveKey}`);
  const hasShort = variant === 'hand' && !name && card.shortName !== card.name;
  const inspect = variant === 'inspect';
  // A Spell names its kind where a Unit shows ATK. (Card Inspect lists a Unit's role under the card.)
  const spellKind = continuous ? (inspect ? 'Continuous Spell' : 'Continuous') : 'Spell';

  // Effects that share a label read as one paragraph under it ("On Play: Restore 135 HP. Gain a Shield.").
  const groups: { chip: string; trigger: BattleEffectLine['trigger']; implied: boolean; effects: BattleEffectLine[] }[] = [];
  for (const effect of effects) {
    // A one-time Spell happens when it is played, so "On Play" goes without saying on it (as on a printed card).
    const implied = !unit && !continuous && effect.trigger === 'ON_PLAY';
    const last = groups[groups.length - 1];
    if (last && last.chip === effect.chip && last.implied === implied) last.effects.push(effect);
    else groups.push({ chip: effect.chip, trigger: effect.trigger, implied, effects: [effect] });
  }
  const stateDot = (state: boolean | undefined) =>
    state !== undefined && !silenced && <span className={`bc-state ${state ? 'on' : 'off'}`} role="img" aria-label={state ? 'active now' : 'inactive now'} title={state ? 'Active now' : 'Not active now'} />;

  const rules = (
    <span className="bc-rules">
      {variant === 'spell' && (
        <span className="bc-name bc-name-inline">
          <Icon name={continuous ? 'continuousSpell' : 'spell'} size={10} />
          {title}
        </span>
      )}
      {silenced && <span className="bc-silenced">Silenced this round</span>}
      {effects.length === 0 && <span className="bc-none">No effect</span>}
      {groups.map((group, g) => {
        const states = group.effects.map((effect) => passiveState?.get(effect.abilityIndex));
        const single = group.effects.length === 1;
        return (
          <span className={`bc-effect ${silenced || states.every((state) => state === false) ? 'is-off' : ''}`} key={g} data-trigger={group.trigger}>
            {!group.implied && (
              <>
                <span className="bc-when">
                  {single && stateDot(states[0])}
                  {group.chip}:
                </span>{' '}
              </>
            )}
            {group.effects.map((effect, k) => (
              <Fragment key={k}>
                {k > 0 && ' '}
                <span className={`bc-text ${silenced || states[k] === false ? 'is-off' : ''}`}>
                  {!single && stateDot(states[k])}
                  {keepTogether(variant === 'board' ? effect.board : effect.compact)}
                </span>
              </Fragment>
            ))}
          </span>
        );
      })}
    </span>
  );

  return (
    <span
      className={`collectible battle-card v-${variant} r-${card.rarity} ${card.faction} ${unit ? 'is-unit' : 'is-spell'} ${silenced ? 'is-silenced' : ''}`}
      data-mode={`battle-${variant}`}
      data-fit={variant === 'spell' ? SPELL_LEVELS[0] : CARD_LEVELS[0]}
      data-name="full"
      ref={fitRef}
    >
      <span className="collectible-frame" aria-hidden="true" />
      <span className="bc-body">
        {variant !== 'spell' && (
          <>
            <span className="bc-namebar">
              <span className="bc-name">
                {hasShort ? (
                  <>
                    <span className="bc-name-full">{title}</span>
                    <span className="bc-name-short">{card.shortName}</span>
                  </>
                ) : (
                  title
                )}
              </span>
            </span>
            <span className="bc-art">
              <CardArtwork cardId={cardId} animated={false} />
              {(shielded || (unit && tempAtk !== 0)) && (
                <span className="bc-flags">
                  {shielded && (
                    <span className="bc-flag shield" title="Shield: survives the first time it would be destroyed">
                      Shield
                    </span>
                  )}
                  {unit && tempAtk !== 0 && (
                    <span className={`bc-flag bc-temp ${tempAtk > 0 ? 'up' : 'down'}`} title="Until the end of this round">
                      {tempAtk > 0 ? '+' : '−'}
                      {Math.abs(tempAtk)} this round
                    </span>
                  )}
                </span>
              )}
            </span>
            <span className="bc-statrow">
              <span className="bc-identity" aria-hidden="true">
                <Sigil faction={card.faction} size="sm" />
                <Gems rarity={card.rarity} />
              </span>
              {!unit && (
                <span className="bc-stat bc-kind-stat">
                  <span className="bc-stat-label">{spellKind}</span>
                </span>
              )}
              {unit && inspect && hpContribution !== undefined && (
                <span className="bc-stat bc-hpc" aria-label={`HP Contribution +${hpContribution}`}>
                  <span className="bc-stat-label">HP</span>
                  <strong>+{hpContribution}</strong>
                </span>
              )}
              {unit && (
                <span className={`bc-stat bc-atk ${shift}`} aria-label={`${current} ATK${shift ? `, printed ${printed}` : ''}`}>
                  <span className="bc-stat-label">ATK</span>
                  <strong>{current}</strong>
                  {shift && <s className="bc-atk-printed">{printed}</s>}
                </span>
              )}
            </span>
          </>
        )}
        {rules}
      </span>
    </span>
  );
}
