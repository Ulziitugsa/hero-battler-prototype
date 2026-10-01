import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { GemIcon } from '../../components/GemIcon';
import { CardArtwork } from '../../components/CardArtwork';
import { GameCard } from '../../components/card/GameCard';
import { CardViewer } from '../../components/card/CardViewer';
import { cardCopyView } from '../../game/cards/cardCopy';
import { useDialogFocus } from '../../components/useDialogFocus';
import { getCard } from '../../game/cards';
import { canAfford } from '../../game/economy/economy';
import { useEconomy } from '../../game/economy/useEconomy';
import { boxPackPrice, buyBoxPacks, type BoxProductDef } from '../../game/box/boxProduct';
import { canResetPrototypeBox, getPrototypeBoxState, prototypeBoxContents, prototypeBoxNextCardOdds, prototypeBoxPacksRemaining, prototypeBoxRarityCounts, PROTOTYPE_BOX, resetPrototypeBox, type PrototypeBoxPull, type PrototypeBoxState } from '../../game/box/prototypeBox';
import type { Rarity } from '../../game/types';
import { track } from '../../analytics/track';
import '../../styles/box.css';

const RARITIES: Rarity[] = ['legendary', 'epic', 'rare', 'common'];
const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

function percent(value: number): string {
  if (value === 0) return '0%';
  return value < 0.1 ? `${(value * 100).toFixed(1)}%` : `${Math.round(value * 100)}%`;
}

function Sheet({ title, labelId, onClose, children }: { title: string; labelId: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useDialogFocus(onClose);
  return <div className="box-sheet-backdrop" onClick={onClose}><div ref={ref} className="box-sheet" role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
    <header><h2 id={labelId}>{title}</h2><button type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button></header>
    {children}
  </div></div>;
}

function ContentsSheet({ state, onInspect, onClose }: { state: PrototypeBoxState; onInspect: (id: string) => void; onClose: () => void }) {
  const contents = prototypeBoxContents(state);
  return <Sheet title="Box contents" labelId="box-contents-title" onClose={onClose}>
    <p className="box-sheet-note">Every card copy in a full Box, and how many are still sealed. Tap a card for its details.</p>
    {RARITIES.map(rarity => <section key={rarity} className={`box-contents-group r-${rarity}`}>
      <h3>{RARITY_LABEL[rarity]} <small>{contents.filter(line => line.rarity === rarity).reduce((sum, line) => sum + line.remaining, 0)} / {PROTOTYPE_BOX.cardCounts[rarity]} left</small></h3>
      {contents.filter(line => line.rarity === rarity).map(line => <button type="button" key={line.cardId} className={line.remaining === 0 ? 'gone' : ''} onClick={() => onInspect(line.cardId)}>
        <span>{getCard(line.cardId).name}</span><b>{line.remaining} / {line.total}</b>
      </button>)}
    </section>)}
  </Sheet>;
}

function ResetDialog({ state, onCancel, onConfirm }: { state: PrototypeBoxState; onCancel: () => void; onConfirm: () => void }) {
  const ref = useDialogFocus(onCancel);
  const legendariesLeft = prototypeBoxRarityCounts(state).legendary;
  return <div className="box-sheet-backdrop centered" onClick={onCancel}><div ref={ref} className="box-reset-dialog" role="alertdialog" aria-modal="true" aria-labelledby="box-reset-title" aria-describedby="box-reset-copy" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
    <span className="box-eyebrow">RESET BOX</span>
    <h2 id="box-reset-title">Refill the Moonfall Box?</h2>
    <div id="box-reset-copy">
      <p>The Box returns to a full {PROTOTYPE_BOX.packCount} packs with its complete original contents.</p>
      <ul>
        <li>Cards you already opened stay in your collection.</li>
        <li>The {prototypeBoxPacksRemaining(state)} unopened packs are replaced by the fresh Box{legendariesLeft > 0 ? `, including the ${legendariesLeft} Legendary ${legendariesLeft === 1 ? 'copy' : 'copies'} still inside` : ''}.</li>
        <li>Resetting is free and costs no Gems.</li>
      </ul>
    </div>
    <div className="box-reset-actions"><button type="button" onClick={onCancel}>Keep this Box</button><button type="button" className="confirm" onClick={onConfirm}>Reset Box</button></div>
  </div></div>;
}

/** A pulled or featured card: the game's one card face, as the player's copy (Card Mastery and HP Contribution). */
function PulledCard({ cardId }: { cardId: string }) {
  const copy = cardCopyView(cardId);
  return <GameCard cardId={cardId} density="tile" owned={copy.owned} masteryStage={copy.masteryStage} hpContribution={copy.hpContribution} />;
}

function PackResults({ pulls, packs, onInspect, onClose }: { pulls: PrototypeBoxPull[]; packs: number; onInspect: (id: string) => void; onClose: () => void }) {
  const ref = useDialogFocus(onClose);
  const newCount = pulls.filter(pull => pull.isNew).length;
  const best = [...pulls].sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity))[0];
  return <div className="box-results-backdrop"><div ref={ref} className="box-results" role="dialog" aria-modal="true" aria-labelledby="box-results-title" tabIndex={-1}>
    <header>
      <span className="box-eyebrow">{packs} {packs === 1 ? 'PACK' : 'PACKS'} OPENED</span>
      <h2 id="box-results-title">{pulls.length} cards added</h2>
      <p>{newCount > 0 ? `${newCount} new to your collection` : 'All duplicates'} · best pull: {best ? (getCard(best.cardId).name.startsWith(RARITY_LABEL[best.rarity]) ? getCard(best.cardId).name : `${RARITY_LABEL[best.rarity]} ${getCard(best.cardId).name}`) : '-'}</p>
    </header>
    <div className="box-results-grid">
      {pulls.map((pull, index) => <button type="button" key={`${index}-${pull.cardId}`} className={`box-result r-${pull.rarity}`} onClick={() => onInspect(pull.cardId)} aria-label={`${getCard(pull.cardId).name}, ${RARITY_LABEL[pull.rarity]}${pull.isNew ? ', new' : `, ${pull.ownedCopies} owned`}`}>
        <PulledCard cardId={pull.cardId} />
        <small>{pull.isNew ? <b>NEW</b> : `×${pull.ownedCopies}`}</small>
      </button>)}
    </div>
    <button type="button" className="box-results-done" onClick={onClose}>Done</button>
  </div></div>;
}

export function BoxDetail({ box, onBack }: { box: BoxProductDef; onBack: () => void }) {
  const economy = useEconomy();
  const [state, setState] = useState(() => getPrototypeBoxState());
  const [results, setResults] = useState<{ pulls: PrototypeBoxPull[]; packs: number } | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const [showContents, setShowContents] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState('');
  const packsLeft = prototypeBoxPacksRemaining(state);
  const rarityLeft = prototypeBoxRarityCounts(state);
  const odds = prototypeBoxNextCardOdds(state);
  const contents = prototypeBoxContents(state);
  const opened = PROTOTYPE_BOX.packCount - packsLeft;

  useEffect(() => {
    track('box_viewed', { boxId: box.id, packsRemaining: prototypeBoxPacksRemaining() });
    window.scrollTo?.({ top: 0 });
  }, [box.id]);

  function open(count: 1 | 10) {
    const result = buyBoxPacks(count, box);
    if (!result.ok) {
      setNotice(result.reason === 'sold-out' ? `Only ${packsLeft} packs remain in this Box.` : `You need ${boxPackPrice(box, count).toLocaleString()} Gems to open ${count === 1 ? 'a pack' : '10 packs'}.`);
      return;
    }
    setNotice('');
    setState(result.opening.state);
    setResults({ pulls: result.opening.packs.flat(), packs: count });
  }

  function reset() {
    const before = state;
    const next = resetPrototypeBox();
    track('box_reset', { boxId: box.id, packsOpened: before.openedPacks, packsDiscarded: prototypeBoxPacksRemaining(before), legendariesDiscarded: prototypeBoxRarityCounts(before).legendary, resetCount: next.resetCount ?? 0 });
    setState(next);
    setConfirmReset(false);
    setNotice(`The Moonfall Box has been refilled to ${PROTOTYPE_BOX.packCount} packs. Your collection is unchanged.`);
  }

  function openContents() {
    track('box_contents_viewed', { boxId: box.id, packsRemaining: packsLeft });
    setShowContents(true);
  }

  const openButton = (count: 1 | 10) => {
    const price = boxPackPrice(box, count);
    const soldOut = packsLeft < count;
    const short = !canAfford(price, economy.gems);
    return <button type="button" className={`box-open ${count === 10 ? 'ten' : ''}`} onClick={() => open(count)} disabled={soldOut} aria-describedby={short ? 'box-gem-balance' : undefined}>
      <strong>Open {count}</strong>
      <span><GemIcon size={14} />{price.toLocaleString()}</span>
      {soldOut && <small>Not enough packs left</small>}
    </button>;
  };

  return <main className="shop-screen box-screen">
    <nav className="box-nav"><button type="button" onClick={onBack}><Icon name="back" size={18} />Shop</button><span id="box-gem-balance"><GemIcon size={15} />{economy.gems.toLocaleString()}</span></nav>

    <section className="box-hero" aria-labelledby="box-title">
      <div className="box-hero-art" aria-hidden="true">
        <div className="box-moon" />
        {box.bannerCardIds.map((id, index) => <span key={id} className={`box-hero-figure f${index}`}><CardArtwork cardId={id} /></span>)}
      </div>
      <div className="box-hero-copy">
        <span className="box-eyebrow">{box.kind === 'main' ? 'MAIN BOX' : box.kind === 'mini' ? 'MINI BOX' : 'SEASONAL BOX'} · {PROTOTYPE_BOX.cardsPerPack} CARDS PER PACK</span>
        <h1 id="box-title">{box.name}</h1>
        <p className="box-theme">{box.theme}</p>
      </div>
      <div className="box-remaining" aria-label={`${packsLeft} of ${PROTOTYPE_BOX.packCount} packs remaining`}>
        <div><strong>{packsLeft}</strong><span> / {PROTOTYPE_BOX.packCount} packs remaining</span></div>
        <div className="box-meter"><span style={{ width: `${(packsLeft / PROTOTYPE_BOX.packCount) * 100}%` }} /></div>
      </div>
    </section>

    <div className="box-actions">{openButton(1)}{openButton(10)}</div>
    {notice && <p className="box-notice" role="status">{notice}</p>}

    <section className="box-section" aria-labelledby="box-chase-title">
      <div className="box-section-heading"><h2 id="box-chase-title">Legendary cards</h2><span>{rarityLeft.legendary} of {PROTOTYPE_BOX.cardCounts.legendary} still inside</span></div>
      <div className="box-chase">
        {box.chaseCardIds.map(id => {
          const line = contents.find(entry => entry.cardId === id);
          const left = line?.remaining ?? 0;
          return <button type="button" key={id} className={`box-chase-card ${left === 0 ? 'gone' : ''}`} onClick={() => setInspect(id)} aria-label={`${getCard(id).name}, ${left} of ${line?.total ?? 0} left. Show details.`}>
            <PulledCard cardId={id} />
            <span className="box-chase-left">{left === 0 ? 'None left' : `${left} of ${line?.total ?? 0} left`}</span>
          </button>;
        })}
      </div>
    </section>

    <section className="box-section" aria-labelledby="box-inventory-title">
      <div className="box-section-heading"><h2 id="box-inventory-title">What is left</h2><button type="button" className="box-link" onClick={openContents}>View all contents</button></div>
      <div className="box-inventory">
        {RARITIES.map(rarity => <div key={rarity} className={`r-${rarity}`}>
          <span>{RARITY_LABEL[rarity]}</span>
          <strong>{rarityLeft[rarity]}</strong>
          <small>of {PROTOTYPE_BOX.cardCounts[rarity]} · next card {percent(odds[rarity])}</small>
        </div>)}
      </div>
    </section>

    <section className="box-section box-rules" aria-labelledby="box-rules-title">
      <h2 id="box-rules-title">Rates and rules</h2>
      <p>{box.description}</p>
      <ul>
        <li>A full Box holds exactly {PROTOTYPE_BOX.packCount} packs: {PROTOTYPE_BOX.cardCounts.common} Common, {PROTOTYPE_BOX.cardCounts.rare} Rare, {PROTOTYPE_BOX.cardCounts.epic} Epic and {PROTOTYPE_BOX.cardCounts.legendary} Legendary card copies.</li>
        <li>Each card is drawn at random from the copies still inside, so every remaining copy is equally likely. The "next card" odds above are exact.</li>
        <li>Packs have no guaranteed slots and there is no pity counter. Opening every pack collects every card in the Box.</li>
        <li>You can reset the Box after opening at least one pack. A reset refills it to full, never removes cards you own, and only happens when you confirm it.</li>
      </ul>
      <div className="box-reset-row">
        <span>{opened} opened{(state.resetCount ?? 0) > 0 ? ` · reset ${state.resetCount} ${state.resetCount === 1 ? 'time' : 'times'}` : ''}</span>
        <button type="button" onClick={() => setConfirmReset(true)} disabled={!canResetPrototypeBox(state)}>Reset Box</button>
      </div>
      <p className="box-test-note">Prototype: packs are bought with in-game Gems only. No real money is involved.</p>
    </section>

    {showContents && <ContentsSheet state={state} onInspect={setInspect} onClose={() => setShowContents(false)} />}
    {confirmReset && <ResetDialog state={state} onCancel={() => setConfirmReset(false)} onConfirm={reset} />}
    {results && <PackResults pulls={results.pulls} packs={results.packs} onInspect={setInspect} onClose={() => setResults(null)} />}
    {inspect && <CardViewer cardId={inspect} context="pack" onClose={() => setInspect(null)} />}
  </main>;
}
