import { CardArtwork } from '../components/CardArtwork';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardDefinition, Faction, Rarity } from '../game/types';
import { getCard } from '../game/cards';
import { cardArtUrl } from '../game/cards/art';
import { PLAYTEST_ROSTER } from '../game/cards/roster';
import { DECK_SIZE, maxCopiesFor } from '../game/engine/deckRules';
import type { StarterFaction } from '../game/cards/starterDecks';
import { listDeckOptions, type DeckOption } from '../game/engine/deckOptions';
import { deleteSavedDeck, makeDeckId, upsertSavedDeck } from '../game/engine/localDecks';
import { loadPreferences, savePreferences } from '../game/engine/preferences';
import { getActiveDeck } from '../game/engine/activeDeck';
import { useCollection } from '../game/collection/useCollection';
import { getOwnedCount, usableCopies } from '../game/collection/collection';
import { CardDetail } from '../components/CardDetail';
import { Icon } from '../components/Icon';
import { CardStatPair } from '../components/CardStatPair';
import { cardStatsPreviewEnabled } from '../game/cards/cardStatsPreview';
import { Gems, Sigil } from '../components/CardParts';
import { countCopies, getDeckStatus, plural, sortedEntries } from './decks/deckStatus';
import { DeckSummaryBar, STARTING_HP_HELP, StartingHpBadge } from './decks/DeckSummaryBar';
import { FavoriteStar } from './decks/FavoriteStar';
import { baseAtk, deckSummary, hpContribution } from '../game/decks/deckSummary';
import { DEFAULT_POOL_OPTIONS, SORT_LABEL, activeFilterCount, availableSorts, queryCardPool, type CardPoolOptions, type CardSort, type OwnershipFilter } from '../game/decks/cardPool';
import { getCardPopularity } from '../game/decks/cardPopularity';
import { autoFillDeck } from '../game/decks/autoFill';
import { useCardMarks } from '../game/collection/useCardMarks';
import { toggleFavorite } from '../game/collection/cardMarks';
import { getDeckPresentation, type DeckPresentation } from './decks/deckPresentation';
import { primaryAcquisitionLabel } from '../game/collection/acquisition';
import type { StarterRequirement } from '../game/collection/starterUnlock';
import { useAscension } from '../game/ascension/useAscension';
import { getAscensionRank } from '../game/ascension/store';
import { ascensionNumeral } from '../game/ascension/ascend';
import '../styles/decks.css';
import '../styles/ascension.css';

// Decks screen (Embervale). Saved decks hang as carved plaques on a shelf rail; the selected one is
// lifted and lit, the active one wears a wax seal. A single banner under the shelf names the deck,
// says whether it's battle-ready and holds the two actions (use / edit); the cards themselves fill
// the rest of the screen. The editor splits into a sticky carved "Current deck" dock above a
// separate "Available cards" pool so the two are never confused. Rules are untouched - DECK_SIZE,
// copy limits and validateDeck come from deckRules.ts, decks from starterDecks.ts + localDecks.ts,
// and "active" is still exactly preferences.selectedDeckId (what Home, Campaign and Quick Battle read).

const STARTER_FACTIONS: StarterFaction[] = ['kingdom', 'undead', 'infernal'];
const FACTION_LABEL: Record<StarterFaction, string> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal' };
const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const NAME_MAX = 32;

type TypeFilter = CardPoolOptions['type'];
const OWNERSHIP_LABEL: Record<OwnershipFilter, string> = { owned: 'Owned', all: 'All', missing: 'Missing' };

const isSaved = (id: string) => id.startsWith('deck-');

/** Art layer shared by every card face (deck tile, pool tile, strip chit): real art when the card has it, otherwise the faction sigil / spell rune fallback. */
function CardArt({ card, sigil }: { card: CardDefinition; sigil: 'lg' | 'md' }) {
  const isHero = card.type === 'hero';
  const url = cardArtUrl(card.id);
  return (
    <span className={`dk-art ${isHero ? card.faction : 'spell'}`}>
      {url && <CardArtwork cardId={card.id} />}
      {!url && isHero && <Sigil faction={card.faction} size={sigil} />}
      {!url && !isHero && <span className={`dk-rune ${card.spellKind === 'CONTINUOUS' ? 'continuous' : ''}`} aria-hidden="true" />}
    </span>
  );
}

/** One card tile. In a deck view `count` is the deck's copies of it; in the pool it is "how many are already in the deck" and 0 is normal. */
function DeckCard({
  card,
  count,
  ownedCount,
  ascension = 0,
  pool,
  deckFull,
  sortKey,
  favorite = false,
  onToggleFavorite,
  onClick,
  onInspect,
}: {
  card: CardDefinition;
  count: number;
  /** Copies of this card the player owns. */
  ownedCount: number;
  /** Ascension rank of this card (0 = Base) - shown as a small mark. */
  ascension?: number;
  pool?: boolean;
  deckFull?: boolean;
  /** Pool sort in effect - ATK / HP Contribution sorts show that value on the tile so the order reads. */
  sortKey?: CardSort;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  onClick?: () => void;
  onInspect?: () => void;
}) {
  const isHero = card.type === 'hero';
  const gameLimit = maxCopiesFor(card.id);
  // Usable copies = min(owned, game limit). Over means the deck asks for more than that (a card you don't own enough of, or past the copy limit).
  const limit = Math.min(ownedCount, gameLimit);
  const over = count > limit;
  const maxed = count >= limit && count > 0;
  const ownedShort = ownedCount < gameLimit;
  const unowned = pool && ownedCount === 0;
  const role = isHero ? card.role : card.spellKind === 'CONTINUOUS' ? 'Continuous' : 'One use';
  const badge = unowned ? null : pool ? (count > 0 ? `${count}/${limit}` : null) : over && ownedShort ? `Own ${ownedCount}` : count > 1 ? `×${count}` : null;
  const atk = baseAtk(card);
  const sortValue = isHero && sortKey === 'atk' && atk !== null ? { icon: 'attack' as const, text: `${atk}`, label: `${atk} ATK` } : isHero && sortKey === 'hp' ? { icon: 'lp' as const, text: `+${hpContribution(card)}`, label: `HP Contribution +${hpContribution(card)}` } : null;

  return (
    <span className="dk-card-wrap">
    <button
      type="button"
      className={`dk-card r-${card.rarity} ${unowned ? 'unowned' : ''} ${pool && (maxed || deckFull) ? 'blocked' : ''} ${pool && maxed && !unowned ? 'maxed' : ''} ${!pool && count > 1 ? 'stacked' : ''} ${over ? 'over' : ''}`}
      onClick={unowned ? onInspect : onClick}
      aria-label={unowned ? `Inspect ${card.name} (not owned)` : pool ? `Add ${card.name}${maxed ? ' (at copy limit)' : ''}` : `Inspect ${card.name}`}
    >
      {!pool && count > 1 && <span className="dk-card-under" aria-hidden="true" />}
      <span className="dk-card-frame">
        <span className="dk-card-face">
          <CardArt card={card} sigil="lg" />
          <span className="dk-card-gems">
            <Gems rarity={card.rarity} />
          </span>
          {isHero && cardStatsPreviewEnabled() ? (
          <span className="dk-card-stats"><CardStatPair card={card} compact /></span>
          ) : isHero ? (
            <span className="dk-card-power">{card.power}</span>
          ) : (
            <span className="dk-card-power spell">
              <Icon name={card.spellKind === 'CONTINUOUS' ? 'continuousSpell' : 'spell'} size={13} />
            </span>
          )}
          {badge && (
            <span className={`dk-card-count ${maxed ? 'full' : ''} ${over ? 'over' : ''}`}>
              {pool && maxed && <Icon name="lock" size={9} />}
              {badge}
            </span>
          )}
          {ascension > 0 && <span className="asc-mark">{ascensionNumeral(ascension)}</span>}
          {unowned && (
            <span className="dk-card-count full">
              <Icon name="lock" size={9} />
              Not owned
            </span>
          )}
          {pool && !maxed && (
            <span className="dk-card-add" aria-hidden="true">
              <Icon name="plus" size={13} />
            </span>
          )}
        </span>
        <span className="dk-card-plate">
          <span className="dk-card-name">{card.shortName}</span>
          <span className="dk-card-role">
            <Sigil faction={isHero ? card.faction : 'spell'} size="sm" />
            {sortValue ? (
              <span className="dk-card-sortval" title={sortValue.label}>
                <Icon name={sortValue.icon} size={10} filled={sortValue.icon === 'lp'} />
                {sortValue.text}
              </span>
            ) : (
              <span>{unowned ? primaryAcquisitionLabel(card.id) : pool && maxed ? (ownedShort ? `Own ${ownedCount}` : card.rarity === 'legendary' ? 'Only 1' : `Max ${gameLimit}`) : role}</span>
            )}
          </span>
        </span>
      </span>
    </button>
    {pool && onInspect && <button type="button" className="dk-card-inspect" aria-label={`Inspect ${card.name}`} onClick={(event) => { event.stopPropagation(); onInspect(); }}><Icon name="help" size={12} /></button>}
    {pool && onToggleFavorite && (
      <button type="button" className={`dk-card-fav ${favorite ? 'on' : ''}`} aria-label={favorite ? `Unfavorite ${card.name}` : `Favorite ${card.name}`} aria-pressed={favorite} onClick={(event) => { event.stopPropagation(); onToggleFavorite(); }}>
        <FavoriteStar filled={favorite} size={12} />
      </button>
    )}
    </span>
  );
}

/** One card a locked starter needs: art-first, "have / need" badge, and where to earn it while it is still missing. */
function RequirementTile({ req }: { req: StarterRequirement }) {
  const card = getCard(req.cardId);
  const have = Math.min(req.have, req.need);
  return (
    <div className={`dk-card dk-req r-${card.rarity} ${req.met ? 'met' : 'blocked'}`}>
      <span className="dk-card-frame">
        <span className="dk-card-face">
          <CardArt card={card} sigil="lg" />
          <span className="dk-card-gems">
            <Gems rarity={card.rarity} />
          </span>
          <span className={`dk-card-count ${req.met ? 'met' : ''}`}>
            {req.met && <Icon name="check" size={10} />}
            {have}/{req.need}
          </span>
        </span>
        <span className="dk-card-plate">
          <span className="dk-card-name">{card.shortName}</span>
          <span className="dk-req-source">{req.met ? 'Collected' : primaryAcquisitionLabel(req.cardId)}</span>
        </span>
      </span>
    </div>
  );
}

export function DecksPage() {
  const [decks, setDecks] = useState<DeckOption[]>(() => listDeckOptions());
  const owned = useCollection();
  const ascensions = useAscension();
  // getActiveDeck() first: it repairs a stored active deck that is no longer playable before anything renders it.
  const [prefs, setPrefs] = useState(() => ({ ...loadPreferences(), selectedDeckId: getActiveDeck().id }));
  const [selectedId, setSelectedId] = useState(() => (decks.some((d) => d.id === prefs.selectedDeckId) ? prefs.selectedDeckId : (decks[0]?.id ?? '')));

  const [mode, setMode] = useState<'browse' | 'edit' | 'requirements'>('browse');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('New Deck');
  const [deckFaction, setDeckFaction] = useState<StarterFaction>('kingdom');
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [baseline, setBaseline] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [poolOpts, setPoolOpts] = useState<CardPoolOptions>(DEFAULT_POOL_OPTIONS);
  const setPool = (patch: Partial<CardPoolOptions>) => setPoolOpts((prev) => ({ ...prev, ...patch }));
  const marks = useCardMarks();
  const [inspectCardId, setInspectCardId] = useState<string | null>(null);

  const shelfRef = useRef<HTMLDivElement>(null);

  const selectedDeck = decks.find((d) => d.id === selectedId) ?? decks[0];
  const activeId = prefs.selectedDeckId;

  // Every mode/selection change starts from the top; the shelf keeps the selected plaque in view.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [mode]);

  useEffect(() => {
    if (mode !== 'browse') return;
    // Scroll the shelf itself - scrollIntoView would also nudge every scrollable ancestor sideways.
    const row = shelfRef.current;
    const el = row?.querySelector<HTMLElement>('[data-selected="true"]');
    if (row && el) row.scrollTo({ left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [selectedId, mode, decks.length]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), Math.max(2400, notice.length * 45));
    return () => window.clearTimeout(t);
  }, [notice]);

  const copies = useMemo(() => countCopies(cardIds), [cardIds]);
  const summary = useMemo(() => deckSummary(cardIds), [cardIds]);
  const status = useMemo(() => getDeckStatus(cardIds, owned), [cardIds, owned]);
  const dirty = mode === 'edit' && JSON.stringify([name, cardIds]) !== baseline;

  function setActive(id: string) {
    const next = { ...prefs, selectedDeckId: id };
    savePreferences(next);
    setPrefs(next);
  }

  function refreshDecks(nextSelected?: string) {
    setDecks(listDeckOptions());
    if (nextSelected) setSelectedId(nextSelected);
  }

  function openEdit(deck: DeckOption, forceNew: boolean) {
    // A locked starter has nothing to edit yet - show what it needs instead of an editor full of cards the player doesn't own.
    if (!forceNew && getDeckPresentation(deck, owned).kind === 'starter-locked') {
      setMode('requirements');
      return;
    }
    const saved = isSaved(deck.id);
    const nextName = forceNew ? 'New Deck' : saved ? deck.label : `${deck.label} (custom)`;
    const nextCards = forceNew ? [] : [...deck.cardIds];
    setEditingId(forceNew || !saved ? null : deck.id);
    setName(nextName);
    setDeckFaction(deck.faction);
    setCardIds(nextCards);
    setBaseline(JSON.stringify([nextName, nextCards]));
    setPoolOpts(DEFAULT_POOL_OPTIONS);
    setNotice(null);
    setConfirmDiscard(false);
    setMode('edit');
  }

  function leaveEditor() {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      setNotice('Unsaved changes — tap back again to discard them');
      return;
    }
    setMode('browse');
  }

  function addCard(card: CardDefinition) {
    if (cardIds.length >= DECK_SIZE) {
      setNotice(`Deck is full — tap a card above to make room`);
      return;
    }
    const have = getOwnedCount(card.id, owned);
    const gameLimit = maxCopiesFor(card.id);
    if ((copies.get(card.id) ?? 0) >= Math.min(have, gameLimit)) {
      setNotice(have < gameLimit ? `You own ${have} ${card.shortName}` : card.rarity === 'legendary' ? `Only ${gameLimit} ${card.shortName} per deck` : `Max ${gameLimit} of ${card.shortName}`);
      return;
    }
    setConfirmDiscard(false);
    setNotice(null);
    setCardIds((prev) => [...prev, card.id]);
  }

  function removeOneCopy(cardId: string) {
    setConfirmDiscard(false);
    setNotice(null);
    setCardIds((prev) => {
      const idx = prev.lastIndexOf(cardId);
      if (idx < 0) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
  }

  /** Deterministic completion from owned cards (game/decks/autoFill.ts) - never touches cards already chosen. */
  function fillDeck() {
    const add = autoFillDeck(cardIds, PLAYTEST_ROSTER, (id) => getOwnedCount(id, owned), deckFaction);
    if (add.length === 0) {
      setNotice('No more owned cards fit this deck');
      return;
    }
    setConfirmDiscard(false);
    setNotice(`Added ${plural(add.length, 'card')} — tap any to swap it out`);
    setCardIds((prev) => [...prev, ...add]);
  }

  /** Incomplete decks save as drafts - only a legal deck can ever be made active or fought with. */
  function saveDeck() {
    const id = editingId ?? makeDeckId();
    upsertSavedDeck({ id, name: name.trim().slice(0, NAME_MAX) || 'Unnamed Deck', faction: deckFaction, cardIds });
    // An active deck that stops being playable can't stay active: getActiveDeck() falls back to a playable one (the draft stays saved).
    if (id === activeId && !status.valid) setPrefs({ ...prefs, selectedDeckId: getActiveDeck().id });
    refreshDecks(id);
    setMode('browse');
  }

  function deleteDeck(id: string) {
    deleteSavedDeck(id);
    const list = listDeckOptions();
    setDecks(list);
    setConfirmDelete(false);
    if (selectedId === id) setSelectedId(list.find((d) => d.id === activeId)?.id ?? list[0]?.id ?? '');
    if (activeId === id) setActive('starter-kingdom');
  }

  if (!selectedDeck) return null;

  // ---- Editor ------------------------------------------------------------------------------------
  if (mode === 'edit') {
    const entries = sortedEntries(cardIds);
    const popularity = getCardPopularity();
    const sorts = availableSorts(popularity);
    const pool = queryCardPool(PLAYTEST_ROSTER.map(getCard), poolOpts, {
      ownedCount: (id) => getOwnedCount(id, owned),
      favorites: marks.favorites,
      obtainedAt: marks.obtainedAt,
      masteryRank: (id) => getAscensionRank(id, ascensions),
      popularity,
    });
    const filtered = activeFilterCount(poolOpts) > 0 || poolOpts.search.trim() !== '';
    const full = cardIds.length >= DECK_SIZE;
    const { type: typeFilter, faction: factionFilter, rarity: rarityFilter } = poolOpts;

    return (
      <div className="decks-screen dk-edit">
        <div className="dk-dock">
          <div className="dk-dock-head">
            <button type="button" className="dk-round-btn" onClick={leaveEditor} aria-label="Back to Decks">
              <Icon name="back" size={18} />
            </button>
            <input className="dk-name-input" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="Name your deck" aria-label="Deck name" />
            <button type="button" className={`dk-plate-btn gold ${status.valid ? 'ready' : ''}`} onClick={saveDeck}>
              {status.valid ? 'Save' : 'Save draft'}
            </button>
          </div>

          <div className={`dk-dock-status ${status.state} ${notice ? 'notice' : ''}`} aria-live="polite">
            <span className={`dk-count-seal ${status.state}`}>
              {cardIds.length}
              <small>/{DECK_SIZE}</small>
            </span>
            <span className="dk-dock-msg">{notice ?? status.message}</span>
            <StartingHpBadge value={summary.startingHp} onExplain={() => setNotice(STARTING_HP_HELP)} />
          </div>
          <DeckSummaryBar summary={summary} />

          <div className="dk-strip" aria-label="Current deck">
            {entries.map(({ card, count }) => (
              <button type="button" key={card.id} className={`dk-chit r-${card.rarity} ${count > usableCopies(card.id, owned) ? 'over' : ''}`} onClick={() => removeOneCopy(card.id)} aria-label={`Remove one ${card.name}`}>
                {count > 1 && <span className="dk-chit-under" aria-hidden="true" />}
                <span className="dk-chit-frame">
                  <CardArt card={card} sigil="md" />
                  {getAscensionRank(card.id, ascensions) > 0 && <span className="zone-card-asc">{ascensionNumeral(getAscensionRank(card.id, ascensions))}</span>}
                  <span className="dk-chit-name">{card.shortName}</span>
                  {count > 1 && <span className="dk-chit-count">×{count}</span>}
                </span>
                <span className="dk-chit-minus" aria-hidden="true">
                  <Icon name="minus" size={10} />
                </span>
              </button>
            ))}
            {status.missing > 0 && (
              <span className="dk-chit-open" aria-hidden="true">
                <Icon name="plus" size={16} />
                <span>{status.missing} open</span>
              </span>
            )}
            {cardIds.length === 0 && <span className="dk-strip-hint">Tap cards below to fill your deck</span>}
          </div>
          <div className="dk-dock-rail" aria-hidden="true" />
        </div>

        <div className="dk-pool">
          <div className="dk-pool-head">
            <span className="dk-pool-title">Available cards</span>
            <span className="dk-pool-count">{plural(pool.length, 'card')}</span>
            {!full && (
              <button type="button" className="dk-plate-btn dk-fill-btn" onClick={fillDeck}>
                <Icon name="plus" size={13} />
                Fill deck
              </button>
            )}
          </div>

          <div className="dk-search-row">
            <label className="dk-search">
              <Icon name="search" size={15} />
              <input type="search" value={poolOpts.search} onChange={(e) => setPool({ search: e.target.value })} placeholder="Search name or effect" aria-label="Search cards by name or effect" enterKeyHint="search" />
              {poolOpts.search && (
                <button type="button" className="dk-search-clear" onClick={() => setPool({ search: '' })} aria-label="Clear search">
                  <Icon name="close" size={13} />
                </button>
              )}
            </label>
            <button type="button" className={`dk-fav-filter ${poolOpts.favoritesOnly ? 'on' : ''}`} onClick={() => setPool({ favoritesOnly: !poolOpts.favoritesOnly })} aria-pressed={poolOpts.favoritesOnly} aria-label="Show favorites only">
              <FavoriteStar filled={poolOpts.favoritesOnly} size={17} />
            </button>
          </div>

          <div className="dk-filters">
            <div className="dk-seg" role="group" aria-label="Card type">
              {(['all', 'hero', 'spell'] as TypeFilter[]).map((t) => (
                <button type="button" key={t} className={`dk-seg-btn ${typeFilter === t ? 'on' : ''}`} onClick={() => setPool({ type: t })}>
                  {t === 'all' ? 'All' : t === 'hero' ? 'Units' : 'Spells'}
                </button>
              ))}
            </div>
            <div className="dk-crests" role="group" aria-label="Faction">
              {(['all', ...STARTER_FACTIONS] as (Faction | 'all')[]).map((f) => (
                <button type="button" key={f} className={`dk-crest ${factionFilter === f ? 'on' : ''}`} onClick={() => setPool({ faction: f })} aria-label={f === 'all' ? 'All factions' : FACTION_LABEL[f as StarterFaction]} aria-pressed={factionFilter === f}>
                  {f === 'all' ? <Icon name="cards" size={16} /> : <Sigil faction={f} size="md" />}
                </button>
              ))}
            </div>
          </div>
          <div className="dk-rarity-row" role="group" aria-label="Rarity">
            <button type="button" className={`dk-rar-btn ${rarityFilter === 'all' ? 'on' : ''}`} onClick={() => setPool({ rarity: 'all' })}>
              Any
            </button>
            {RARITIES.map((r) => (
              <button type="button" key={r} className={`dk-rar-btn gems ${rarityFilter === r ? 'on' : ''}`} onClick={() => setPool({ rarity: rarityFilter === r ? 'all' : r })} aria-label={RARITY_LABEL[r]} aria-pressed={rarityFilter === r}>
                <Gems rarity={r} />
              </button>
            ))}
          </div>

          <div className="dk-order-row">
            <div className="dk-seg compact" role="group" aria-label="Ownership">
              {(['owned', 'all', 'missing'] as OwnershipFilter[]).map((o) => (
                <button type="button" key={o} className={`dk-seg-btn ${poolOpts.ownership === o ? 'on' : ''}`} onClick={() => setPool({ ownership: o })} aria-pressed={poolOpts.ownership === o}>
                  {OWNERSHIP_LABEL[o]}
                </button>
              ))}
            </div>
            <label className="dk-sort">
              <Icon name="sort" size={14} />
              <select value={poolOpts.sort} onChange={(e) => setPool({ sort: e.target.value as CardSort })} aria-label="Sort cards">
                {sorts.map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="dk-grid">
            {pool.map((c) => (
              <DeckCard
                key={c.id}
                card={c}
                count={copies.get(c.id) ?? 0}
                ownedCount={getOwnedCount(c.id, owned)}
                ascension={getAscensionRank(c.id, ascensions)}
                pool
                deckFull={full}
                sortKey={poolOpts.sort}
                favorite={marks.favorites.includes(c.id)}
                onToggleFavorite={() => toggleFavorite(c.id)}
                onClick={() => addCard(c)}
                onInspect={() => setInspectCardId(c.id)}
              />
            ))}
          </div>
          {pool.length === 0 && (
            <div className="dk-empty">
              <Icon name="search" size={20} />
              <span>{poolOpts.favoritesOnly && marks.favorites.length === 0 ? 'No favorites yet. Tap the star on a card to keep it handy.' : 'Nothing here matches.'}</span>
              {filtered && (
                <button
                  type="button"
                  className="dk-plate-btn"
                  onClick={() => setPoolOpts({ ...DEFAULT_POOL_OPTIONS, sort: poolOpts.sort })}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
        {inspectCardId && <CardDetail cardId={inspectCardId} onClose={() => setInspectCardId(null)} />}
      </div>
    );
  }

  // ---- Locked starter requirements ---------------------------------------------------------------
  if (mode === 'requirements') {
    const rp = getDeckPresentation(selectedDeck, owned);
    const unlock = rp.unlock;
    return (
      <div className="decks-screen">
        <div className="dk-req-head">
          <button type="button" className="dk-round-btn" onClick={() => setMode('browse')} aria-label="Back to Decks">
            <Icon name="back" size={18} />
          </button>
          <div className="dk-req-title">
            <h1 className="dk-banner-name">{selectedDeck.label}</h1>
            <span className={`dk-banner-status ${unlock?.unlocked ? 'ready' : 'locked'}`}>{unlock?.unlocked ? 'Unlocked — ready to use' : 'Locked starter'}</span>
          </div>
          {unlock && (
            <span className={`dk-count-seal lg ${unlock.unlocked ? 'ready' : 'locked'}`}>
              {unlock.collected}
              <small>/{unlock.total}</small>
            </span>
          )}
        </div>
        {unlock && (
          <>
            <p className="dk-req-blurb">{unlock.unlocked ? 'You have every card this deck needs.' : rp.message + ' Each card below shows how many you hold and where to earn it.'}</p>
            <div className="dk-grid">
              {unlock.requirements.map((r) => (
                <RequirementTile key={r.cardId} req={r} />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- Browse ------------------------------------------------------------------------------------
  const sel = selectedDeck;
  const pres = getDeckPresentation(sel, owned);
  const selStatus = pres.status;
  const locked = pres.kind === 'starter-locked';
  const isActive = sel.id === activeId;
  const entries = sortedEntries(sel.cardIds);
  const selSummary = deckSummary(sel.cardIds);
  const saved = isSaved(sel.id);
  const hasCustom = decks.some((d) => isSaved(d.id));

  return (
    <div className="decks-screen">
      <div className="dk-header">
        <h1 className="dk-title">Decks</h1>
        <button type="button" className="dk-plate-btn" onClick={() => openEdit(sel, true)}>
          <Icon name="plus" size={14} />
          New deck
        </button>
      </div>

      <div className="dk-shelf">
        <div className="dk-shelf-row" ref={shelfRef} role="listbox" aria-label="Saved decks">
          {decks.map((d) => (
            <Plaque key={d.id} deck={d} selected={d.id === selectedId} active={d.id === activeId} onSelect={() => { setSelectedId(d.id); setConfirmDelete(false); }} />
          ))}
          {!hasCustom && (
            <button type="button" className="dk-plaque dk-plaque-empty" onClick={() => openEdit(sel, true)}>
              <Icon name="plus" size={20} />
              <span>Build your own</span>
            </button>
          )}
        </div>
        <div className="dk-shelf-board" aria-hidden="true" />
      </div>

      <section className={`dk-banner ${isActive ? 'active' : ''} ${pres.kind}`}>
        <div className="dk-banner-top">
          <span className="dk-banner-seal">
            <span className={`dk-count-seal lg ${locked ? 'locked' : selStatus.state}`}>
              {locked && <Icon name="lock" size={13} />}
              {locked ? pres.unlock?.collected : selStatus.count}
              <small>/{locked ? pres.unlock?.total : DECK_SIZE}</small>
            </span>
            {isActive && (
              <span className="dk-wax" role="img" aria-label="Active deck">
                <Icon name="hero" size={13} />
              </span>
            )}
          </span>
          <div className="dk-banner-text">
            <h2 className="dk-banner-name">{sel.label}</h2>
            <span className={`dk-banner-status ${locked ? 'locked' : selStatus.state}`}>
              {locked ? 'Locked starter' : pres.message}
            </span>
          </div>
          {!locked && <StartingHpBadge value={selSummary.startingHp} />}
        </div>
        {!locked && <DeckSummaryBar summary={selSummary} />}
        <div className="dk-banner-actions">
          {locked ? (
            <button type="button" className="dk-plate-btn gold wide" onClick={() => setMode('requirements')}>
              <Icon name="cards" size={15} />
              View requirements
            </button>
          ) : isActive ? (
            <span className="dk-active-note">
              <Icon name="hero" size={15} />
              {selStatus.valid ? 'Active — your battle deck' : 'Active, but not battle-ready'}
            </span>
          ) : (
            <button type="button" className={`dk-plate-btn gold wide ${selStatus.valid ? 'ready' : ''}`} onClick={() => setActive(sel.id)} disabled={!selStatus.valid}>
              <Icon name={selStatus.valid ? 'check' : 'lock'} size={15} />
              {selStatus.valid ? 'Use this deck' : selStatus.state === 'building' ? 'Finish it to use' : 'Fix it to use'}
            </button>
          )}
          {!locked && (
            <button type="button" className="dk-plate-btn" onClick={() => openEdit(sel, false)}>
              <Icon name="edit" size={15} />
              {saved ? 'Edit' : 'Customise'}
            </button>
          )}
        </div>
      </section>

      {locked && pres.unlock && (
        <div className="dk-locked-panel">
          <span className="dk-locked-msg">{pres.message}</span>
          <span className="dk-locked-bar" aria-hidden="true">
            <span style={{ width: `${Math.round((pres.unlock.collected / pres.unlock.total) * 100)}%` }} />
          </span>
          <span className="dk-locked-meta">
            {pres.unlock.collected} of {pres.unlock.total} cards collected · earn the rest in the Campaign
          </span>
        </div>
      )}

      {!locked && (
        <>
      <div className="dk-rail-label">
        <span>In this deck</span>
        <span className="dk-rail-rule" />
      </div>

      <div className="dk-grid">
        {entries.map(({ card, count }) => (
          <DeckCard key={card.id} card={card} count={count} ownedCount={getOwnedCount(card.id, owned)} ascension={getAscensionRank(card.id, ascensions)} onClick={() => setInspectCardId(card.id)} />
        ))}
        {selStatus.missing > 0 && (
          <button type="button" className="dk-open-slot" onClick={() => openEdit(sel, false)}>
            <Icon name="plus" size={22} />
            <span>{plural(selStatus.missing, 'open slot')}</span>
          </button>
        )}
      </div>
      {entries.length === 0 && <p className="dk-empty-note">An empty deck. Tap the open slot to start building.</p>}
        </>
      )}

      {saved && (
        <div className="dk-delete">
          {confirmDelete ? (
            <>
              <span>Delete this deck for good?</span>
              <button type="button" className="dk-plate-btn" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
              <button type="button" className="dk-plate-btn danger" onClick={() => deleteDeck(sel.id)}>
                Delete
              </button>
            </>
          ) : (
            <button type="button" className="dk-delete-link" onClick={() => setConfirmDelete(true)}>
              Delete deck
            </button>
          )}
        </div>
      )}

      {inspectCardId && <CardDetail cardId={inspectCardId} onClose={() => setInspectCardId(null)} />}
    </div>
  );
}

/** A saved deck as a carved plaque: faction crest, name (wraps to two lines), count. The active deck wears a wax seal. */
function Plaque({ deck, selected, active, onSelect }: { deck: DeckOption; selected: boolean; active: boolean; onSelect: () => void }) {
  const p: DeckPresentation = getDeckPresentation(deck, useCollection());
  return (
    <button type="button" role="option" aria-selected={selected} data-selected={selected} data-deck-id={deck.id} className={`dk-plaque ${selected ? 'lit' : ''} ${active ? 'active' : ''} ${p.kind}`} onClick={onSelect}>
      {active && (
        <span className="dk-wax" role="img" aria-label="Active deck">
          <Icon name="hero" size={13} />
        </span>
      )}
      <span className="dk-plaque-crest">
        <Sigil faction={deck.faction} size="md" />
      </span>
      <span className="dk-plaque-name">{deck.label}</span>
      <span className={`dk-plaque-count ${p.kind}`}>
        {p.kind === 'starter-locked' && <Icon name="lock" size={11} />}
        {p.kind === 'custom-draft' && 'Draft '}
        {p.progressText}
        {p.kind === 'custom-invalid' && <Icon name="warning" size={11} />}
      </span>
    </button>
  );
}
