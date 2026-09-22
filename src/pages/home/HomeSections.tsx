import { CardArtwork } from '../../components/CardArtwork';
import type { ReactNode } from 'react';
import { Gems, Sigil } from '../../components/CardParts';
import { GemBalance, GemIcon } from '../../components/GemIcon';
import { Icon } from '../../components/Icon';
import { MasteryCrest } from '../../components/MasteryCrest';
import { getCard } from '../../game/cards';
import { cardArtUrl } from '../../game/cards/art';
import type { StarterFaction } from '../../game/cards/starterDecks';
import { chapterWorldArtUrl } from '../../game/campaign/art';
import { CHAPTER_1 } from '../../game/campaign/chapter1';
import { formatCountdown, type EnergyState } from '../../game/campaign/energy';
import type { DeckOption } from '../../game/engine/deckOptions';
import type { CampaignHub, HubNote } from '../../game/home/hubState';
import { MASTERIES, rankNumeral } from '../../game/mastery/definitions';
import { MAX_LEVEL, xpToNextLevel } from '../../game/progression/config';
import type { AccountState } from '../../game/progression/types';
import type { SummonBanner } from '../../game/summon/banners';
import { SUMMON_CONFIG } from '../../game/summon/config';

// The Home hub's sections. Each one is presentational: it takes real state as props and reports one intent
// (open Campaign, open Summon, ...). The hierarchy - what is big, what is small, what is reserved - is set by
// HomePage and home.css, not here.

const FACTION_LABEL: Record<StarterFaction, string> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal' };

/** A wax dot: the quiet "something is waiting here" marker (never a red count badge). */
export function WaxDot({ label }: { label: string }) {
  return <span className="hh-dot" role="img" aria-label={label} />;
}

// ---- Who am I ---------------------------------------------------------------------------------

export function PlayerIdentity({ account, onOpen }: { account: AccountState; onOpen: () => void }) {
  const atMax = account.level >= MAX_LEVEL;
  const need = xpToNextLevel(account.level);
  const pct = atMax ? 100 : Math.round((account.xp / need) * 100);
  const mastery = account.equippedMasteryId ? MASTERIES[account.equippedMasteryId] : null;
  return (
    <button type="button" className="hh-identity" onClick={onOpen} aria-label={`Profile - Level ${account.level}`}>
      <span className="hh-avatar">
        <span className="hh-avatar-face" />
        <span className="hh-level-seal">{account.level}</span>
      </span>
      <span className="hh-identity-text">
        <span className="hh-name">Wanderer</span>
        <span className="hh-xp" role="progressbar" aria-valuemin={0} aria-valuemax={need} aria-valuenow={account.xp} aria-label="Experience">
          <span style={{ width: `${pct}%` }} />
        </span>
        <span className="hh-xp-text">{atMax ? 'Max level' : `Level ${account.level} · ${account.xp} / ${need} XP`}</span>
        <span className="hh-mastery">
          {mastery ? (
            <>
              <MasteryCrest id={mastery.id} size={12} />
              <span>
                {mastery.name} {rankNumeral(account.unlockedMasteries[mastery.id] ?? 1)}
              </span>
            </>
          ) : (
            <span>No Mastery equipped</span>
          )}
        </span>
      </span>
    </button>
  );
}

/**
 * The one Gem indicator. `trailing` is the reserved slot for the future Shop entry (a chest medallion sits
 * beside the balance) - nothing renders there today.
 */
export function GemPlate({ trailing }: { trailing?: ReactNode }) {
  return (
    <span className="hh-gems">
      <GemBalance />
      {trailing}
    </span>
  );
}

// ---- Visual anchor ----------------------------------------------------------------------------

/** The featured Hero (the active deck's Legendary): a framed portrait leaning on the terrace wall. Tap to inspect. */
export function HeroAnchor({ cardId, faction, onInspect }: { cardId: string | null; faction: StarterFaction; onInspect: (id: string) => void }) {
  if (!cardId) return <span className={`hh-hero empty ${faction}`} aria-hidden="true" />;
  const card = getCard(cardId);
  const url = cardArtUrl(cardId);
  return (
    <button type="button" className={`hh-hero ${faction}`} onClick={() => onInspect(cardId)} aria-label={`Inspect ${card.name}`}>
      <span className="hh-hero-frame">
        <span className="hh-hero-art">{url ? <CardArtwork cardId={cardId} /> : <Sigil faction={faction} size="lg" />}</span>
      </span>
      <span className="hh-hero-plate">
        <span className="hh-hero-name">{card.name}</span>
        <span className="hh-hero-meta">
          <Gems rarity={card.rarity} /> {FACTION_LABEL[faction]}
        </span>
      </span>
    </button>
  );
}

// ---- What should I do next --------------------------------------------------------------------

export function ContinueCampaign({ hub, energy, onOpen }: { hub: CampaignHub; energy: EnergyState; onOpen: () => void }) {
  const art = chapterWorldArtUrl(CHAPTER_1.id);
  const kicker = hub.status === 'complete' ? 'Chapter complete' : hub.status === 'fresh' ? 'Begin the Campaign' : 'Continue Campaign';
  const title = hub.status === 'complete' ? hub.region : (hub.nextName ?? hub.region);
  const sub = hub.status === 'complete' ? 'Replay any stage · more regions soon' : hub.chapterLine;
  const pct = hub.total > 0 ? Math.round((hub.cleared / hub.total) * 100) : 0;
  const cost = hub.energyCost ?? 0;
  const short = cost > energy.current;
  return (
    <button type="button" className={`hh-plate hh-campaign ${hub.status}`} onClick={onOpen} aria-label={`${kicker}: ${title}`}>
      {art && <span className="hh-campaign-art" style={{ backgroundImage: `url(${art})` }} aria-hidden="true" />}
      <span className="hh-campaign-text">
        <span className="hh-kicker">{kicker}</span>
        <span className="hh-campaign-title">{title}</span>
        <span className="hh-campaign-sub">{sub}</span>
        <span className="hh-campaign-progress">
          <span className="hh-pips" role="progressbar" aria-valuemin={0} aria-valuemax={hub.total} aria-valuenow={hub.cleared} aria-label="Chapter progress">
            <span style={{ width: `${pct}%` }} />
          </span>
          <span className="hh-campaign-count">
            {hub.cleared} / {hub.total}
          </span>
        </span>
      </span>
      <span className="hh-play-seal">
        <span className="hh-play-seal-core">
          <Icon name="battle" size={22} />
        </span>
        {hub.status !== 'complete' && cost > 0 && (
          <span className={`hh-energy ${short ? 'low' : ''}`} title={short ? `Next Energy in ${formatCountdown(energy.msUntilNextTick)}` : undefined}>
            <Icon name="power" size={11} />
            {cost}
          </span>
        )}
      </span>
    </button>
  );
}

/** Summon's presence on Home: the banner you last browsed, its chase card, its Legendary guarantee and the price. Compact - rates live in Summon. */
export function FeaturedSummon({ banner, pity, canSummon, onOpen }: { banner: SummonBanner; pity: number; canSummon: boolean; onOpen: () => void }) {
  const main = getCard(banner.featured.main);
  const url = cardArtUrl(main.id);
  return (
    <button type="button" className={`hh-plate hh-summon theme-${banner.faction} ${canSummon ? 'ready' : ''}`} onClick={onOpen} aria-label={`Summon - ${banner.name}`}>
      <span className="hh-summon-card">
        <span className="hh-summon-card-art">{url ? <CardArtwork cardId={main.id} /> : <Sigil faction={banner.faction} size="md" />}</span>
      </span>
      <span className="hh-summon-text">
        <span className="hh-kicker">Summon</span>
        <span className="hh-summon-name">{banner.name}</span>
        <span className="hh-summon-feat">Featured · {main.shortName}</span>
        <span className="hh-summon-guar">
          <span>Guarantee</span>
          <span>
            {pity}/{SUMMON_CONFIG.pityThreshold}
          </span>
        </span>
        <span className="hh-summon-foot">
          <span className="hh-summon-pity" aria-label={`Legendary guarantee ${pity} of ${SUMMON_CONFIG.pityThreshold}`}>
            <span style={{ width: `${(pity / SUMMON_CONFIG.pityThreshold) * 100}%` }} />
          </span>
          <span className="hh-summon-cost">
            <GemIcon size={12} />
            {SUMMON_CONFIG.singleCost}
          </span>
        </span>
      </span>
      {canSummon && <WaxDot label="Enough Gems to summon" />}
    </button>
  );
}

export function QuickBattlePlate({ last, onOpen }: { last: string | null; onOpen: () => void }) {
  return (
    <button type="button" className="hh-plate hh-quick" onClick={onOpen}>
      <span className="hh-medal">
        <Icon name="battle" size={16} />
      </span>
      <span className="hh-mini-text">
        <span className="hh-mini-name">Quick Battle</span>
        <span className="hh-mini-sub">{last ?? 'Practice vs the AI'}</span>
      </span>
    </button>
  );
}

/**
 * The reserved "what else can I play right now" slot beside Quick Battle. Today `event` is always null, so it
 * renders the quiet Coming-soon stone. When Events ship they pass a HomeEvent here and this plate becomes a live
 * entry in the same footprint - Home's layout does not change.
 */
export interface HomeEvent {
  id: string;
  name: string;
  sub: string;
  onOpen: () => void;
}
export function EventSlot({ event }: { event: HomeEvent | null }) {
  if (!event)
    return (
      <span className="hh-plate hh-event reserved" aria-label="Event - coming soon">
        <span className="hh-medal stone">
          <Icon name="lock" size={14} />
        </span>
        <span className="hh-mini-text">
          <span className="hh-mini-name">Event</span>
          <span className="hh-mini-sub">Coming soon</span>
        </span>
      </span>
    );
  return (
    <button type="button" className="hh-plate hh-event live" onClick={event.onOpen}>
      <span className="hh-medal">
        <Icon name="trophy" size={16} />
      </span>
      <span className="hh-mini-text">
        <span className="hh-mini-name">{event.name}</span>
        <span className="hh-mini-sub">{event.sub}</span>
      </span>
    </button>
  );
}

// ---- What am I taking into battle -------------------------------------------------------------

export function ActiveDeck({ deck, onOpen }: { deck: DeckOption; onOpen: () => void }) {
  return (
    <button type="button" className="hh-plate hh-deck" onClick={onOpen} aria-label={`${deck.label} - open Decks`}>
      <span className={`hh-fan ${deck.faction}`} aria-hidden="true">
        <span className="hh-fan-card c0" />
        <span className="hh-fan-card c1" />
        <span className="hh-fan-card c2" />
      </span>
      <span className="hh-deck-text">
        <span className="hh-kicker">Battle deck</span>
        <span className="hh-deck-name">{deck.label}</span>
        <span className="hh-deck-meta">
          <Sigil faction={deck.faction} size="sm" />
          {FACTION_LABEL[deck.faction]} · {deck.cardIds.length} cards · Ready
        </span>
      </span>
      <span className="hh-edit">
        <Icon name="edit" size={15} />
        <span>Edit</span>
      </span>
    </button>
  );
}

// ---- The one note -----------------------------------------------------------------------------

export function HubNoteLine({ note, onOpenProfile, onOpenDecks, onOpenHeroes }: { note: HubNote; onOpenProfile: () => void; onOpenDecks: () => void; onOpenHeroes: () => void }) {
  if (note.kind === 'mastery')
    return (
      <button type="button" className="hh-note" onClick={onOpenProfile}>
        <WaxDot label="Attention" />
        <span>
          <strong>Mastery Point ready</strong> — spend it in Profile
        </span>
      </button>
    );
  if (note.kind === 'starter')
    return (
      <button type="button" className="hh-note" onClick={onOpenDecks}>
        <WaxDot label="Attention" />
        <span>
          <strong>{note.name}</strong> · {note.collected} / {note.total} cards — {note.total - note.collected} to go
        </span>
      </button>
    );
  return (
    <button type="button" className="hh-note" onClick={onOpenHeroes}>
      <WaxDot label="Attention" />
      <span>
        New card · <strong>{getCard(note.cardId).name}</strong>
      </span>
    </button>
  );
}
