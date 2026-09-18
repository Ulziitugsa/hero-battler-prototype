import { useMemo, useState } from 'react';
import type { CardDefinition, Faction, Rarity } from '../game/types';
import { getCard } from '../game/cards';
import { cardArtUrl } from '../game/cards/art';
import { RARITY_GEMS } from '../components/cardVisuals';
import { PLAYTEST_ROSTER } from '../game/cards/roster';
import { DECK_SIZE, maxCopiesFor, validateDeck } from '../game/engine/deckRules';
import type { StarterFaction } from '../game/cards/starterDecks';
import { listDeckOptions, type DeckOption } from '../game/engine/deckOptions';
import { deleteSavedDeck, makeDeckId, upsertSavedDeck } from '../game/engine/localDecks';
import { loadPreferences, savePreferences } from '../game/engine/preferences';
import { CardDetail } from '../components/CardDetail';
import { Icon } from '../components/Icon';

// Decks Screen (see docs/game "Decks Screen.dc.html" import). The deck is a physical box, not a row
// in a list: saved decks are carved boxes on a shelf, the selected one lifted and lit; a single carved
// banner below holds name/mix/count with one medallion (Edit) as the only primary action; the deck's
// 15 cards render as up to ~8 tiles, duplicates stacked with an ×2 stud so the copy limit is visible
// rather than counted. Deck rules are unchanged - DECK_SIZE/MAX_COPIES/MAX_LEGENDARY_COPIES still come
// from deckRules.ts, decks from starterDecks.ts + localDecks.ts. "Active" here is exactly
// preferences.selectedDeckId - the same deck Home's rail and Quick Battle already read.

const STARTER_FACTIONS: StarterFaction[] = ['kingdom', 'undead', 'infernal'];
const RANK: Record<Rarity, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };
const FACTION_LABEL: Record<StarterFaction, string> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal' };

type TypeFilter = 'all' | 'hero' | 'spell';

function countCopies(cardIds: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of cardIds) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

/** Heroes-only faction tally, sorted by count - "the deck's mix" per the design's `counts()`/`mix()`. Spells are faction-neutral in play, so they don't count toward this. */
function heroFactionMix(cardIds: string[]): { faction: Faction; count: number }[] {
  const byFaction = new Map<Faction, number>();
  for (const id of cardIds) {
    const c = getCard(id);
    if (c.type === 'hero') byFaction.set(c.faction, (byFaction.get(c.faction) ?? 0) + 1);
  }
  return [...byFaction.entries()].map(([faction, count]) => ({ faction, count })).sort((a, b) => b.count - a.count);
}

function deckComposition(cardIds: string[]) {
  let heroes = 0;
  let spells = 0;
  let continuous = 0;
  for (const id of cardIds) {
    const c = getCard(id);
    if (c.type === 'hero') heroes += 1;
    else if (c.spellKind === 'CONTINUOUS') continuous += 1;
    else spells += 1;
  }
  return { heroes, spells, continuous };
}

/** Sorted, deduplicated deck contents for tile rendering - heroes before spells, then strongest rarity first, matching the design's grid ordering. */
function sortedEntries(cardIds: string[]): { card: CardDefinition; count: number }[] {
  const copies = countCopies(cardIds);
  return [...copies.entries()]
    .map(([id, count]) => ({ card: getCard(id), count }))
    .sort((a, b) => {
      if ((a.card.type === 'hero') !== (b.card.type === 'hero')) return a.card.type === 'hero' ? -1 : 1;
      return RANK[a.card.rarity] - RANK[b.card.rarity];
    });
}

function Sigil({ faction, size }: { faction: Faction | 'spell'; size: 'lg' | 'md' | 'sm' | 'xs' }) {
  return <span className={`decks-sigil decks-sigil-${size} ${faction}`} aria-hidden="true" />;
}

function Gems({ count, size = 6 }: { count: number; size?: number }) {
  return (
    <span className="decks-gems">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`decks-gem ${i < count ? 'lit' : ''}`} style={{ width: size, height: size }} />
      ))}
    </span>
  );
}

/** One card tile - the same shape used in the read-only deck grid and (with an add stud instead of a copy badge) the builder's Collection pool. */
function CardTile({
  card,
  count,
  browsing,
  onClick,
}: {
  card: CardDefinition;
  count: number;
  /** In the Collection pool, `count` is "how many are already in the deck" and 0 is normal, not empty. Outside it, `count` is always the deck's own count for that card. */
  browsing?: boolean;
  onClick?: () => void;
}) {
  const isHero = card.type === 'hero';
  const limit = maxCopiesFor(card.id);
  const maxed = !!browsing && count >= limit;
  const hasArt = isHero && !!cardArtUrl(card.id);
  const artUrl = cardArtUrl(card.id);
  let copyLabel: string | null = null;
  let crown = false;
  if (card.rarity === 'legendary' && count > 0) {
    copyLabel = '×1';
    crown = true;
  } else if (count > 1) {
    copyLabel = `×${count}`;
  } else if (browsing && count === 1) {
    copyLabel = '×1';
  }
  const roleLine = isHero ? card.role : card.spellKind === 'CONTINUOUS' ? 'Continuous' : 'One use';

  return (
    <button type="button" className={`decks-tile rarity-${card.rarity} ${count > 1 ? 'dup' : ''} ${maxed ? 'locked' : ''}`} onClick={onClick} disabled={maxed && !onClick}>
      {card.rarity === 'legendary' && <span className="decks-tile-aura" aria-hidden="true" />}
      <div className="decks-tile-frame">
        <div className={`decks-tile-art ${maxed ? 'dim' : ''}`}>
          <div className={`decks-tile-art-bg ${isHero ? card.faction : 'spell'}`}>
            {hasArt && artUrl && <img src={artUrl} alt="" draggable={false} />}
            {!hasArt && isHero && <Sigil faction={card.faction} size="lg" />}
            {!isHero && (
              <span className={`decks-tile-rune ${card.spellKind === 'CONTINUOUS' ? 'continuous' : ''}`} aria-hidden="true" />
            )}
            <div className="decks-tile-gems">
              <Gems count={RARITY_GEMS[card.rarity]} size={6} />
            </div>
            {copyLabel && (
              <span className={`decks-tile-copy ${crown ? 'crown' : ''}`}>
                {crown && <Icon name="power" size={8} />}
                {copyLabel}
              </span>
            )}
            {!isHero && card.spellKind === 'CONTINUOUS' && <div className="decks-tile-continuous">Continuous</div>}
            {isHero ? (
              <span className="decks-tile-power">{card.power}</span>
            ) : (
              <span className="decks-tile-token">
                <Icon name={card.spellKind === 'CONTINUOUS' ? 'continuousSpell' : 'spell'} size={14} />
              </span>
            )}
          </div>
          <div className="decks-tile-plate">
            <span className="decks-tile-name">{card.shortName}</span>
            <span className="decks-tile-role">
              <Sigil faction={isHero ? card.faction : 'spell'} size="xs" />
              <span>{roleLine}</span>
            </span>
          </div>
        </div>
        {maxed && (
          <div className="decks-tile-lock">
            <span>
              <Icon name="warning" size={10} />
              {card.rarity === 'legendary' ? '1 legendary only' : `Max ${limit}`}
            </span>
          </div>
        )}
        {browsing && !maxed && (
          <span className="decks-tile-add" aria-hidden="true">
            <Icon name="plus" size={14} />
          </span>
        )}
      </div>
    </button>
  );
}

export function DecksPage() {
  const [decks, setDecks] = useState<DeckOption[]>(() => listDeckOptions());
  const [prefs, setPrefs] = useState(() => loadPreferences());
  const [selectedId, setSelectedId] = useState(() => (decks.some((d) => d.id === prefs.selectedDeckId) ? prefs.selectedDeckId : decks[0]?.id ?? ''));

  const [mode, setMode] = useState<'browse' | 'edit'>('browse');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('New Deck');
  const [deckFaction, setDeckFaction] = useState<StarterFaction>('kingdom');
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [factionFilter, setFactionFilter] = useState<Faction | 'all'>('all');
  const [rarityFilter, setRarityFilter] = useState<Rarity | 'all'>('all');

  const [inspectCardId, setInspectCardId] = useState<string | null>(null);

  const selectedDeck = decks.find((d) => d.id === selectedId) ?? decks[0];
  const activeId = prefs.selectedDeckId;

  function refreshDecks(nextSelected?: string) {
    const list = listDeckOptions();
    setDecks(list);
    if (nextSelected) setSelectedId(nextSelected);
  }

  function setActive(id: string) {
    const next = { ...prefs, selectedDeckId: id };
    savePreferences(next);
    setPrefs(next);
  }

  function openEdit(deck: DeckOption, forceNew: boolean) {
    const isSaved = deck.id.startsWith('deck-');
    setEditingId(forceNew || !isSaved ? null : deck.id);
    setName(forceNew ? 'New Deck' : isSaved ? deck.label : `${deck.label} (custom)`);
    setDeckFaction(deck.faction);
    setCardIds(forceNew ? [] : [...deck.cardIds]);
    setTypeFilter('all');
    setFactionFilter('all');
    setRarityFilter('all');
    setMode('edit');
  }

  const copies = useMemo(() => countCopies(cardIds), [cardIds]);
  const validation = validateDeck(cardIds);
  const complete = cardIds.length === DECK_SIZE;

  function addCard(cardId: string) {
    if (cardIds.length >= DECK_SIZE) return;
    const have = copies.get(cardId) ?? 0;
    if (have >= maxCopiesFor(cardId)) return;
    setCardIds((prev) => [...prev, cardId]);
  }

  function removeOneCopy(cardId: string) {
    setCardIds((prev) => {
      const idx = prev.lastIndexOf(cardId);
      if (idx < 0) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
  }

  function saveDeck() {
    if (!validation.valid) return;
    const id = editingId ?? makeDeckId();
    upsertSavedDeck({ id, name: name.trim() || 'Unnamed Deck', faction: deckFaction, cardIds });
    refreshDecks(id);
    setMode('browse');
  }

  function deleteDeck(id: string) {
    deleteSavedDeck(id);
    const list = listDeckOptions();
    setDecks(list);
    if (selectedId === id) setSelectedId(list[0]?.id ?? '');
    if (activeId === id) setActive(list[0]?.id ?? 'starter-kingdom');
  }

  const pool = PLAYTEST_ROSTER.map(getCard).filter(
    (c) => (typeFilter === 'all' || c.type === typeFilter) && (factionFilter === 'all' || c.faction === factionFilter) && (rarityFilter === 'all' || c.rarity === rarityFilter),
  );
  const poolSorted = pool.slice().sort((a, b) => {
    const owned = (copies.get(b.id) ?? 0) - (copies.get(a.id) ?? 0);
    if (owned !== 0) return owned;
    return RANK[a.rarity] - RANK[b.rarity];
  });

  if (!selectedDeck) return null;

  if (mode === 'edit') {
    const mix = heroFactionMix(cardIds);
    const mixLabel = mix.length === 0 ? 'No heroes yet' : mix.length === 1 ? `${FACTION_LABEL[mix[0].faction as StarterFaction] ?? mix[0].faction} ${mix[0].count}` : `${FACTION_LABEL[mix[0].faction as StarterFaction] ?? mix[0].faction} mix`;
    const entries = cardIds.reduce<{ id: string; dup: boolean }[]>((acc, id) => {
      if (!acc.some((e) => e.id === id)) acc.push({ id, dup: (copies.get(id) ?? 0) > 1 });
      return acc;
    }, []);
    const emptySockets = Math.max(0, DECK_SIZE - cardIds.length);

    return (
      <div className="decks-screen">
        <div className="decks-edit-header">
          <button type="button" className="decks-back-chip" onClick={() => setMode('browse')} aria-label="Back to Decks">
            <Icon name="back" size={17} />
          </button>
          <div className="decks-edit-title">
            <input className="decks-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Deck name" aria-label="Deck name" />
            <span className="decks-edit-subtitle">Editing — {mixLabel}</span>
          </div>
          <button type="button" className={`decks-save-plate ${complete ? 'ready' : ''}`} onClick={saveDeck} disabled={!validation.valid}>
            Save
          </button>
        </div>

        <div className="decks-edit-progress">
          <div className={`decks-count-seal ${complete ? 'full' : ''}`}>
            {cardIds.length} / {DECK_SIZE}
          </div>
          <div className="decks-progress-col">
            <div className="decks-progress-bar">
              <span className="decks-progress-fill" style={{ width: `${Math.min(100, Math.round((cardIds.length / DECK_SIZE) * 100))}%` }} />
            </div>
            <span className={`decks-valid-label ${validation.valid ? 'ok' : ''}`}>{validation.valid ? 'Deck legal — copy limits respected' : validation.errors[0] || `${DECK_SIZE - cardIds.length} more cards — max 2 of each, 1 legendary`}</span>
          </div>
        </div>

        <div className="decks-strip-section">
          <div className="decks-rail-label">
            <span>In this deck</span>
            <span className="decks-rail-rule" />
            <span className="decks-rail-hint">tap to remove</span>
          </div>
          <div className="decks-strip">
            {entries.map(({ id, dup }) => {
              const c = getCard(id);
              const hasArt = c.type === 'hero' && !!cardArtUrl(id);
              const artUrl = cardArtUrl(id);
              return (
                <button type="button" key={id} className="decks-chit" onClick={() => removeOneCopy(id)} aria-label={`Remove one ${c.name}`}>
                  {dup && <span className="decks-chit-stack" aria-hidden="true" />}
                  <span className={`decks-chit-frame rarity-${c.rarity}`}>
                    <span className={`decks-chit-art ${c.type === 'hero' ? c.faction : 'spell'}`}>
                      {hasArt && artUrl && <img src={artUrl} alt="" draggable={false} />}
                      {!hasArt && c.type === 'hero' && <Sigil faction={c.faction} size="md" />}
                      {c.type === 'spell' && <span className="decks-tile-rune small" aria-hidden="true" />}
                      <span className="decks-chit-name">{c.shortName}</span>
                      {dup && <span className="decks-chit-badge">×2</span>}
                    </span>
                  </span>
                  <span className="decks-chit-remove" aria-hidden="true">
                    <Icon name="minus" size={9} />
                  </span>
                </button>
              );
            })}
            {Array.from({ length: emptySockets }, (_, i) => (
              <span key={`socket-${i}`} className="decks-chit-socket" aria-hidden="true">
                <Icon name="plus" size={14} />
              </span>
            ))}
          </div>
        </div>

        <div className="decks-collection-section">
          <div className="decks-rail-label">
            <span>Collection</span>
            <span className="decks-rail-rule thick" />
            <span className="decks-rail-hint">tap to add</span>
          </div>

          <div className="decks-filter-plate">
            <div className="decks-type-rail">
              {(['all', 'hero', 'spell'] as TypeFilter[]).map((t) => (
                <button type="button" key={t} className={`decks-chip ${typeFilter === t ? 'on' : ''}`} onClick={() => setTypeFilter(t)}>
                  {t !== 'all' && <Icon name={t === 'hero' ? 'hero' : 'spell'} size={11} />}
                  {t === 'all' ? 'All' : t === 'hero' ? 'Heroes' : 'Spells'}
                </button>
              ))}
            </div>
            <span className="decks-filter-divider" />
            <div className="decks-crest-rail">
              {(['all', ...STARTER_FACTIONS] as (Faction | 'all')[]).map((f) => (
                <button type="button" key={f} className={`decks-crest-chip ${factionFilter === f ? 'on' : ''}`} onClick={() => setFactionFilter(f)} aria-label={f === 'all' ? 'All factions' : FACTION_LABEL[f as StarterFaction]}>
                  {f === 'all' ? <span className="decks-all-mark" /> : <Sigil faction={f} size="sm" />}
                </button>
              ))}
            </div>
          </div>

          <div className="decks-rarity-rail">
            {(['all', 'common', 'rare', 'epic', 'legendary'] as (Rarity | 'all')[]).map((r) => (
              <button type="button" key={r} className={`decks-chip rarity-chip ${rarityFilter === r ? 'on' : ''}`} onClick={() => setRarityFilter(r)}>
                {r === 'all' ? 'Any' : <Gems count={RARITY_GEMS[r]} size={6} />}
              </button>
            ))}
            <span className="decks-pool-count">{poolSorted.length} cards</span>
          </div>

          <div className="decks-grid">
            {poolSorted.map((c) => (
              <CardTile key={c.id} card={c} count={copies.get(c.id) ?? 0} browsing onClick={() => addCard(c.id)} />
            ))}
            {poolSorted.length === 0 && (
              <div className="decks-empty-pool">
                <Icon name="search" size={18} />
                <span>No cards match those filters.</span>
              </div>
            )}
          </div>
        </div>

        {inspectCardId && <CardDetail cardId={inspectCardId} onClose={() => setInspectCardId(null)} />}
      </div>
    );
  }

  // ---- Browse mode -----------------------------------------------------------------------------
  const isActive = selectedDeck.id === activeId;
  const selEntries = sortedEntries(selectedDeck.cardIds);
  const selMix = heroFactionMix(selectedDeck.cardIds);
  const selComplete = selectedDeck.cardIds.length === DECK_SIZE;
  const comp = deckComposition(selectedDeck.cardIds);
  const mixLabel = selMix.length === 0 ? 'No heroes' : selMix.length === 1 ? `${FACTION_LABEL[selMix[0].faction as StarterFaction] ?? selMix[0].faction} ${selMix[0].count}` : `${FACTION_LABEL[selMix[0].faction as StarterFaction] ?? selMix[0].faction} mix`;

  return (
    <div className="decks-screen">
      <div className="decks-browse-header">
        <span className="decks-title">Decks</span>
        <span className="decks-saved-pill">
          <Icon name="decks" size={13} />
          {decks.length} saved
        </span>
      </div>

      <div className="decks-shelf-wrap">
        <div className="decks-shelf-rail" />
        <div className="decks-shelf">
          {decks.map((d) => {
            const on = d.id === selectedId;
            const active = d.id === activeId;
            const total = d.cardIds.length;
            const incomplete = total < DECK_SIZE;
            return (
              <button type="button" key={d.id} className={`decks-box ${on ? 'lit' : ''} ${active ? 'active-deck' : ''}`} onClick={() => setSelectedId(d.id)}>
                <span className={`decks-box-lid ${active ? 'active' : on ? 'lit' : ''}`} />
                <span className={`decks-box-crest ${active || on ? 'lit' : ''}`}>
                  <Sigil faction={d.faction} size="md" />
                </span>
                <span className={`decks-box-name ${on ? 'lit' : ''}`}>{d.label}</span>
                <span className="decks-box-foot">
                  <span className={`decks-box-count ${on ? 'lit' : ''}`}>
                    {total} / {DECK_SIZE}
                  </span>
                  {active && (
                    <span className="decks-stud active">
                      <Icon name="check" size={8} />
                      Active
                    </span>
                  )}
                  {!active && incomplete && <span className="decks-stud warn">{DECK_SIZE - total} short</span>}
                </span>
              </button>
            );
          })}
          <button type="button" className="decks-box-new" onClick={() => openEdit(selectedDeck, true)}>
            <Icon name="plus" size={18} />
            <span>New</span>
          </button>
        </div>
      </div>

      <div className="decks-banner">
        {isActive && <span className="decks-banner-halo" aria-hidden="true" />}
        <div className={`decks-banner-plate ${isActive ? 'active' : ''}`}>
          <div className="decks-banner-text">
            <span className="decks-banner-name">{selectedDeck.label}</span>
            <div className="decks-banner-meta">
              <span className="decks-banner-mix-sigils">
                {selMix.slice(0, 3).map((m, i) => (
                  <Sigil key={i} faction={m.faction} size="xs" />
                ))}
              </span>
              <span className="decks-banner-mix-label">{mixLabel}</span>
              <span className="decks-banner-sep" />
              <span className={`decks-banner-state ${isActive ? 'active' : selComplete ? '' : 'warn'}`}>
                {isActive && <Icon name="check" size={10} />}
                {isActive ? 'Active' : selComplete ? 'Saved' : 'Incomplete'}
              </span>
            </div>
          </div>
          <div className={`decks-banner-seal ${selComplete ? 'full' : ''}`}>
            {selectedDeck.cardIds.length}/{DECK_SIZE}
          </div>
          <button type="button" className="decks-banner-edit" onClick={() => openEdit(selectedDeck, false)}>
            <span className="decks-banner-edit-chip">
              <Icon name="edit" size={19} />
            </span>
            <span>Edit</span>
          </button>
        </div>
      </div>

      {isActive ? (
        <div className="decks-comp-rail">
          <span className="decks-comp-item">
            <Icon name="hero" size={14} />
            <strong>{comp.heroes}</strong>
            <span>heroes</span>
          </span>
          <span className="decks-comp-item">
            <Icon name="spell" size={14} />
            <strong>{comp.spells}</strong>
            <span>spells</span>
          </span>
          <span className="decks-comp-item">
            <Icon name="continuousSpell" size={14} />
            <strong>{comp.continuous}</strong>
            <span>continuous</span>
          </span>
        </div>
      ) : (
        <button type="button" className="decks-set-active-plate" onClick={() => setActive(selectedDeck.id)}>
          <Icon name="check" size={14} />
          Carry this deck into battle
        </button>
      )}

      <div className="decks-grid">
        {selEntries.map(({ card, count }) => (
          <CardTile key={card.id} card={card} count={count} onClick={() => setInspectCardId(card.id)} />
        ))}
        {selEntries.length === 0 && (
          <div className="decks-empty-pool">
            <Icon name="deck" size={18} />
            <span>This deck has no cards yet.</span>
          </div>
        )}
      </div>

      {selectedDeck.id.startsWith('deck-') && (
        <button type="button" className="decks-delete-link" onClick={() => deleteDeck(selectedDeck.id)}>
          Delete this deck
        </button>
      )}

      {inspectCardId && <CardDetail cardId={inspectCardId} onClose={() => setInspectCardId(null)} />}
    </div>
  );
}
