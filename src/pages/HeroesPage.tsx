import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CardDefinition, Faction, Rarity } from '../game/types';
import { getCard } from '../game/cards';
import { PLAYTEST_ROSTER } from '../game/cards/roster';
import { listDeckOptions } from '../game/engine/deckOptions';
import { loadPreferences } from '../game/engine/preferences';
import { Icon } from '../components/Icon';
import { Gems, Sigil } from '../components/CardParts';
import { useCollection } from '../game/collection/useCollection';
import { acquisitionSummary, getCardAcquisitionSources } from '../game/collection/acquisition';
import { useAscension } from '../game/ascension/useAscension';
import { getAscensionRank } from '../game/ascension/store';
import { ascensionAddedAbilities, effectiveAbilities } from '../game/ascension/effective';
import { AscensionPanel } from './heroes/AscensionPanel';
import { HeroLevelPanel } from './heroes/HeroLevelPanel';
import { getHeroLevel } from '../game/heroLevel/store';
import { MasteryPips } from './heroes/MasteryPips';
import { getOwnedCount } from '../game/collection/collection';
import { getCardMasteryView } from '../game/cardMastery/model';
import { track } from '../analytics/track';
import { useDialogFocus } from '../components/useDialogFocus';
import { getAscensionStatus } from '../game/ascension/ascend';
import { CollectibleCard } from '../components/CollectibleCard';
import { CardEffectList, CardStatsPanel } from '../components/card/CardInspectSections';
import { useHeroLevel } from '../game/heroLevel/useHeroLevel';
import { displayRole, emptyCopy, FACTION_LABEL, FACTION_ORDER, filterHeroes, isFiltered, scopeOf, SORT_LABEL, tally, type HeroFilters, type OwnedFilter, type SortMode } from './heroes/collection';
import '../styles/heroes.css';

// Heroes screen: the collection gallery. Where Decks is dense and tactical, this is the slow, visual
// side of the game - two roomy columns of art-first cards framed by rarity (never faction), a single
// engraved counter that follows whatever you're filtering, and missing cards veiled but still legible
// so they read as things to chase rather than broken slots. Tapping a card opens a proper inspection
// sheet with previous/next so you can page through the gallery.
//
// Ownership comes from the real persisted collection (src/game/collection) - Campaign rewards add
// cards to it and this screen re-renders the moment that happens. Filtering / sorting / empty copy live
// in ./heroes/collection.ts and take the owned set as an argument.

const HERO_IDS: string[] = PLAYTEST_ROSTER.filter((id) => getCard(id).type === 'hero');
const HEROES: CardDefinition[] = HERO_IDS.map(getCard);

/** One quiet line: where the card comes from. Parked / unobtainable cards say so plainly rather than promising a stage. */
function sourceLine(cardId: string, owned: boolean): string {
  const kinds = getCardAcquisitionSources(cardId).map((x) => x.kind);
  if (kinds.includes('starter') || kinds.includes('campaign') || kinds.includes('summon')) return `${owned ? 'Source' : 'Earn it'}: ${acquisitionSummary(cardId)}`;
  return kinds.includes('future') ? 'Arrives in a later region' : 'Not obtainable yet';
}

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const SORTS: SortMode[] = ['rarity', 'power', 'name', 'faction'];

/** The deck to credit in a hero's "In your deck" footer: the active deck if it carries this hero, else the first deck (starters first) that does. */
function findDeckFor(cardId: string): string | null {
  const decks = listDeckOptions();
  const activeId = loadPreferences().selectedDeckId;
  const active = decks.find((d) => d.id === activeId);
  if (active?.cardIds.includes(cardId)) return active.label;
  return decks.find((d) => d.cardIds.includes(cardId))?.label ?? null;
}

function HeroTile({ card, owned, count, rank, onClick }: { card: CardDefinition; owned: boolean; count: number; rank: number; onClick: () => void }) {
  return (
    <button type="button" className={`hr-card hr-card-face r-${card.rarity} ${owned ? '' : 'missing'}`} onClick={onClick} aria-label={`${card.name}, ${RARITY_LABEL[card.rarity]}, ${owned ? 'owned' : 'not collected'}. Inspect.`}>
      <CollectibleCard cardId={card.id} mode="standard" owned={owned} copies={count} masteryRank={owned ? rank : 0} animated={false} />
    </button>
  );
}

function HeroDetail({
  card,
  owned,
  count,
  onClose,
  onPrev,
  onNext,
  onOpenDecks,
}: {
  card: CardDefinition;
  owned: boolean;
  count: number;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onOpenDecks: () => void;
}) {
  const deckLabel = findDeckFor(card.id);
  const ascension = useAscension();
  const ownedCards = useCollection();
  const levels = useHeroLevel();
  const rank = owned ? getAscensionRank(card.id, ascension) : 0;
  const ascensionStatus = getAscensionStatus(card.id, ownedCards, ascension);
  const primaryProgression = ascensionStatus.canAscend ? 'mastery' : null;
  const abilities = effectiveAbilities(card.id, rank);
  const fromAscension = ascensionAddedAbilities(card.id, rank);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dialogRef = useDialogFocus(onClose);
  const trackedHero = useRef<string | null>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    if (trackedHero.current !== card.id) {
      trackedHero.current = card.id;
      track('hero_detail_opened', { heroId: card.id, rarity: card.rarity, level: owned ? getHeroLevel(card.id, levels) : 0 });
    }
  }, [card.id, card.rarity, levels, owned]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div className="overlay-backdrop hr-sheet-backdrop" onClick={onClose}>
      <div ref={dialogRef} className={`hr-sheet r-${card.rarity} ${owned ? '' : 'missing'}`} role="dialog" aria-modal="true" aria-label={card.name} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="hr-sheet-scroll" ref={bodyRef}>
          <div className="hr-sheet-stage">
            <div className="hr-sheet-frame hr-sheet-card">
              <CollectibleCard cardId={card.id} mode="inspect" owned={owned} masteryRank={rank} />
            </div>
            {onPrev && (
              <button type="button" className="hr-sheet-nav prev" onClick={onPrev} aria-label="Previous card">
                <Icon name="back" size={20} />
              </button>
            )}
            {onNext && (
              <button type="button" className="hr-sheet-nav next" onClick={onNext} aria-label="Next card">
                <Icon name="back" size={20} />
              </button>
            )}
          </div>

          <div className="hr-sheet-body">
            <div className="hr-sheet-title"><span className="hr-sheet-overline">{owned ? 'IN YOUR COLLECTION' : 'A CARD TO DISCOVER'}</span><h2 className="hr-sheet-name">{card.name}</h2><span className="hr-sheet-powerline">{owned ? `${getCardMasteryView(card.id).label} · ${getOwnedCount(card.id, ownedCards)} ${getOwnedCount(card.id, ownedCards) === 1 ? 'copy' : 'copies'}` : card.type === 'hero' ? 'Unit card' : 'Spell card'}</span></div>

            <div className="hr-sheet-line">
              <span className={`hr-rarity-tag r-${card.rarity}`}>
                <Gems rarity={card.rarity} />
                {RARITY_LABEL[card.rarity]}
              </span>
              <span className={`hr-owned-seal ${owned ? 'owned' : ''}`}>
                <Icon name={owned ? 'check' : 'lock'} size={12} />
                {owned ? (count > 1 ? `Owned ×${count}` : 'In your collection') : 'Not yet collected'}
              </span>
              {owned && <MasteryPips view={getCardMasteryView(card.id)} />}
            </div>

            <div className="hr-sheet-line faction">
              <Sigil faction={card.faction} size="md" />
              <span>
                {[`${FACTION_LABEL[card.faction]} Unit`, displayRole(card)].filter(Boolean).join(' · ')}
              </span>
            </div>
            <CardStatsPanel card={card} />

            {owned && <AscensionPanel card={card} priority={primaryProgression === 'mastery'} />}
            {owned && <details className="legacy-growth"><summary>Legacy Level · saved at {getHeroLevel(card.id, levels)}</summary><p>Earlier Level progress is preserved while the bounded card progression migration is designed.</p><HeroLevelPanel card={card} /></details>}

            <div className={`hr-source ${owned ? '' : 'missing'}`}>
              <Icon name={owned ? 'check' : 'lock'} size={13} />
              <span>{sourceLine(card.id, owned)}</span>
            </div>

            {card.tags.length > 0 && (
              <div className="hr-tags" aria-label="Traits">
                {card.tags.map((t) => (
                  <span key={t} className="hr-tag">
                    {t}
                  </span>
                ))}
              </div>
            )}

            <CardEffectList card={card} abilities={abilities} masteryAdded={fromAscension} />

            {deckLabel && (
              <button type="button" className="hr-deck-link" onClick={onOpenDecks}>
                <span className="hr-deck-link-text">
                  <span>In your deck</span>
                  <strong>{deckLabel}</strong>
                </span>
                <span className="hr-deck-link-go">
                  <Icon name="decks" size={16} />
                  View decks
                </span>
              </button>
            )}
          </div>
        </div>

        <button type="button" className="hr-sheet-close" onClick={onClose} aria-label="Back to Cards">
          <Icon name="back" size={18} />
        </button>
      </div>
    </div>
  );
}

export function HeroesPage({ onOpenDecks }: { onOpenDecks: () => void }) {
  const collection = useCollection();
  const ascensionState = useAscension();
  const owned = useMemo(() => new Set(HERO_IDS.filter((id) => (collection[id] ?? 0) > 0)), [collection]);
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>('all');
  const [factionFilter, setFactionFilter] = useState<Faction | 'all'>('all');
  const [rarityFilter, setRarityFilter] = useState<Rarity | 'all'>('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('rarity');
  const [sortOpen, setSortOpen] = useState(false);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const closeInspect = useCallback(() => setInspectId(null), []);

  const filters: HeroFilters = { owned: ownedFilter, faction: factionFilter, rarity: rarityFilter, query };
  const list = useMemo(() => filterHeroes(HEROES, owned, { owned: ownedFilter, faction: factionFilter, rarity: rarityFilter, query }, sortMode), [owned, ownedFilter, factionFilter, rarityFilter, query, sortMode]);
  const scope = scopeOf(HEROES, filters);
  const t = tally(scope, owned);

  const scopeName = [rarityFilter === 'all' ? '' : RARITY_LABEL[rarityFilter], factionFilter === 'all' ? '' : FACTION_LABEL[factionFilter], 'Cards'].filter(Boolean).join(' ');
  const showMissing = ownedFilter === 'missing';
  const counter = showMissing ? `${t.missing}` : `${t.have} / ${t.total}`;
  const caption = query.trim() ? 'matching cards' : `${scopeName} ${showMissing ? 'still missing' : 'collected'}`;
  useEffect(() => {
    track('collection_progress_viewed', { discovered: t.have, available: t.total, completion: t.total ? t.have / t.total : 0 });
  // Count/filter changes are not separate collection visits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pct = t.total === 0 ? 0 : Math.round(((showMissing ? t.missing : t.have) / t.total) * 100);

  function clearFilters() {
    setOwnedFilter('all');
    setFactionFilter('all');
    setRarityFilter('all');
    setQuery('');
    setSearchOpen(false);
  }

  const idx = inspectId ? list.findIndex((c) => c.id === inspectId) : -1;
  const inspectCard = inspectId ? getCard(inspectId) : null;
  const go = (d: number) => {
    if (idx < 0) return;
    setInspectId(list[(idx + d + list.length) % list.length].id);
  };

  const empty = list.length === 0 ? emptyCopy(filters, HEROES, owned) : null;

  return (
    <div className="heroes-screen">
      <header className="hr-head">
        <h1 className="hr-title">Cards</h1>
        <div className="hr-tools">
          <button
            type="button"
            className={`hr-tool ${searchOpen || query ? 'on' : ''}`}
            onClick={() => {
              if (searchOpen) setQuery('');
              setSearchOpen(!searchOpen);
            }}
            aria-label={searchOpen ? 'Close search' : 'Search cards'}
            aria-expanded={searchOpen}
          >
            <Icon name={searchOpen ? 'close' : 'search'} size={18} />
          </button>
          <div className="hr-sort">
            <button type="button" className={`hr-tool wide ${sortOpen ? 'on' : ''}`} onClick={() => setSortOpen(!sortOpen)} aria-haspopup="listbox" aria-expanded={sortOpen}>
              <Icon name="sort" size={16} />
              {SORT_LABEL[sortMode]}
            </button>
            {sortOpen && (
              <>
                <button type="button" className="hr-sort-scrim" aria-label="Close sort menu" onClick={() => setSortOpen(false)} />
                <div className="hr-sort-menu" role="listbox" aria-label="Sort by">
                  {SORTS.map((s) => (
                    <button
                      type="button"
                      key={s}
                      role="option"
                      aria-selected={s === sortMode}
                      className={`hr-sort-opt ${s === sortMode ? 'on' : ''}`}
                      onClick={() => {
                        setSortMode(s);
                        setSortOpen(false);
                      }}
                    >
                      {SORT_LABEL[s]}
                      {s === sortMode && <Icon name="check" size={14} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="hr-search">
          <Icon name="search" size={16} />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or effect" aria-label="Search cards" />
          {query && (
            <button type="button" className="hr-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      )}

      <div className="hr-ledger">
        <span className="hr-ledger-count">{counter}</span>
        <span className="hr-ledger-side">
          <span className="hr-ledger-caption">{caption}</span>
          <span className="hr-ledger-bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
        </span>
      </div>

      <div className="hr-crests" role="group" aria-label="Faction">
        {(['all', ...FACTION_ORDER] as (Faction | 'all')[]).map((f) => {
          const on = f === factionFilter;
          return (
            <button type="button" key={f} className={`hr-crest ${on ? 'on' : ''}`} onClick={() => setFactionFilter(f)} aria-pressed={on}>
              <span className="hr-crest-coin">{f === 'all' ? <Icon name="heroes" size={20} /> : <Sigil faction={f} size="lg" />}</span>
              <span className="hr-crest-label">{f === 'all' ? 'All' : FACTION_LABEL[f]}</span>
            </button>
          );
        })}
      </div>

      <div className="hr-seg" role="group" aria-label="Ownership">
        {(['all', 'owned', 'missing'] as OwnedFilter[]).map((o) => (
          <button type="button" key={o} className={`hr-seg-btn ${ownedFilter === o ? 'on' : ''}`} onClick={() => setOwnedFilter(o)} aria-pressed={ownedFilter === o}>
            <Icon name={o === 'all' ? 'cards' : o === 'owned' ? 'check' : 'lock'} size={14} />
            {o === 'all' ? 'All' : o === 'owned' ? 'Owned' : 'Missing'}
          </button>
        ))}
      </div>

      <div className="hr-rarities" role="group" aria-label="Rarity">
        <button type="button" className={`hr-rar ${rarityFilter === 'all' ? 'on' : ''}`} onClick={() => setRarityFilter('all')} aria-pressed={rarityFilter === 'all'}>
          <span className="hr-rar-any">Any</span>
        </button>
        {RARITIES.map((r) => (
          <button type="button" key={r} className={`hr-rar r-${r} ${rarityFilter === r ? 'on' : ''}`} onClick={() => setRarityFilter(rarityFilter === r ? 'all' : r)} aria-pressed={rarityFilter === r}>
            <span className="hr-rar-gem" aria-hidden="true" />
            <span className="hr-rar-name">{RARITY_LABEL[r]}</span>
          </button>
        ))}
      </div>

      {empty ? (
        <div className="hr-empty">
          <span className="hr-empty-frame" aria-hidden="true">
            <Icon name={empty.title === 'Collection complete' ? 'trophy' : 'search'} size={26} />
          </span>
          <span className="hr-empty-title">{empty.title}</span>
          <span className="hr-empty-sub">{empty.sub}</span>
          {isFiltered(filters) && (
            <span className="hr-empty-actions">
              {query.trim() && (
                <button type="button" className="hr-empty-btn" onClick={() => setQuery('')}>
                  Clear search
                </button>
              )}
              <button type="button" className="hr-empty-btn" onClick={clearFilters}>
                Clear filters
              </button>
            </span>
          )}
        </div>
      ) : (
        <div className="hr-grid">
          {list.map((card) => (
            <HeroTile key={card.id} card={card} owned={owned.has(card.id)} count={collection[card.id] ?? 0} rank={getAscensionRank(card.id, ascensionState)} onClick={() => setInspectId(card.id)} />
          ))}
        </div>
      )}

      {inspectCard && (
        <HeroDetail
          card={inspectCard}
          owned={owned.has(inspectCard.id)}
          count={collection[inspectCard.id] ?? 0}
          onClose={closeInspect}
          onPrev={list.length > 1 && idx >= 0 ? () => go(-1) : undefined}
          onNext={list.length > 1 && idx >= 0 ? () => go(1) : undefined}
          onOpenDecks={onOpenDecks}
        />
      )}
    </div>
  );
}
