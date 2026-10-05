import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { GemIcon } from '../../components/GemIcon';
import { CardArtwork } from '../../components/CardArtwork';
import { GameCard } from '../../components/card/GameCard';
import { CardViewer } from '../../components/card/CardViewer';
import { cardCopyView } from '../../game/cards/cardCopy';
import { useDialogFocus } from '../../components/useDialogFocus';
import { getCard } from '../../game/cards';
import { TicketIcon } from '../../components/TicketIcon';
import { RevealStage } from '../../components/reveal/RevealStage';
import { useRevealSequence } from '../../components/reveal/useRevealSequence';
import { canAfford, canAffordTickets } from '../../game/economy/economy';
import { useEconomy } from '../../game/economy/useEconomy';
import { getCollection } from '../../game/collection/collection';
import { pullRevealOutcome, starterProgressBetween, type StarterProgressNote } from '../../game/reveal/outcome';
import { ArchiveAudio } from '../../game/reveal/audio';
import { onRevealSound } from '../../game/reveal/sound';
import { boxPullPrice, boxPullTickets, buyBoxPulls, type PullPayment } from '../../game/box/boxProduct';
import { boxSize, boxRarityTotals, type ArchetypeBoxDef } from '../../game/box/archetypeBoxes';
import { boxCardsRemaining, boxContents, boxNextCardOdds, boxRarityRemaining, canRestockBox, getBoxesState, getBoxPool, restockBox, type ArchetypeBoxesState, type BoxPull, type PullCount } from '../../game/box/boxPool';
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

function ContentsSheet({ box, state, onInspect, onClose }: { box: ArchetypeBoxDef; state: ArchetypeBoxesState; onInspect: (id: string) => void; onClose: () => void }) {
  const contents = boxContents(box.id, state);
  const totals = boxRarityTotals(box.id);
  return <Sheet title="Box contents" labelId="box-contents-title" onClose={onClose}>
    <p className="box-sheet-note">Every card copy in a full Box, and how many are still sealed. Tap a card for its details.</p>
    {RARITIES.filter(rarity => totals[rarity] > 0).map(rarity => <section key={rarity} className={`box-contents-group r-${rarity}`}>
      <h3>{RARITY_LABEL[rarity]} <small>{contents.filter(line => line.rarity === rarity).reduce((sum, line) => sum + line.remaining, 0)} / {totals[rarity]} left</small></h3>
      {contents.filter(line => line.rarity === rarity).map(line => <button type="button" key={line.cardId} className={line.remaining === 0 ? 'gone' : ''} onClick={() => onInspect(line.cardId)}>
        <span>{getCard(line.cardId).name}</span><b>{line.remaining} / {line.total}</b>
      </button>)}
    </section>)}
  </Sheet>;
}

function RestockDialog({ box, onCancel, onConfirm }: { box: ArchetypeBoxDef; onCancel: () => void; onConfirm: () => void }) {
  const ref = useDialogFocus(onCancel);
  return <div className="box-sheet-backdrop centered" onClick={onCancel}><div ref={ref} className="box-reset-dialog" role="alertdialog" aria-modal="true" aria-labelledby="box-reset-title" aria-describedby="box-reset-copy" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
    <span className="box-eyebrow">RESTOCK BOX</span>
    <h2 id="box-reset-title">Restock the {box.name}?</h2>
    <div id="box-reset-copy">
      <p>The empty Box returns to its full {boxSize(box.id)} cards, with its complete original contents.</p>
      <ul>
        <li>Every card you pulled stays in your collection.</li>
        <li>Restocking is free. It gives no cards or rewards by itself.</li>
      </ul>
    </div>
    <div className="box-reset-actions"><button type="button" onClick={onCancel}>Not now</button><button type="button" className="confirm" onClick={onConfirm}>Restock Box</button></div>
  </div></div>;
}

/** A pulled or featured card: the game's one card face, as the player's copy (Card Mastery and HP Contribution). */
function PulledCard({ cardId }: { cardId: string }) {
  const copy = cardCopyView(cardId);
  return <GameCard cardId={cardId} density="tile" owned={copy.owned} hpContribution={copy.hpContribution} />;
}

/** Pull Results: every card the pull added, one grid for 1 card or 10. The cards were granted before the ceremony began;
 * this only shows them. */
export function PullResults({ pulls, starterProgress = [], onInspect, onClose, preview = false }: { pulls: BoxPull[]; starterProgress?: StarterProgressNote[]; onInspect: (id: string) => void; onClose: () => void; preview?: boolean }) {
  const ref = useDialogFocus(onClose);
  const newCount = pulls.filter(pull => pull.isNew).length;
  const best = [...pulls].sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity))[0];
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current || preview) return;
    tracked.current = true;
    track('pull_results_viewed', { cardCount: pulls.length, newCount, highestRarity: best?.rarity ?? 'common' });
  }, [pulls.length, newCount, best?.rarity, preview]);
  return <div className="box-results-backdrop"><div ref={ref} className="box-results" role="dialog" aria-modal="true" aria-labelledby="box-results-title" tabIndex={-1}>
    <header>
      <span className="box-eyebrow">PULL RESULTS</span>
      <h2 id="box-results-title">{pulls.length} {pulls.length === 1 ? 'card' : 'cards'} added</h2>
      <p>{newCount > 0 ? `${newCount} new to your collection` : pulls.length === 1 ? 'A duplicate' : 'All duplicates'} · best card: {best ? (getCard(best.cardId).name.startsWith(RARITY_LABEL[best.rarity]) ? getCard(best.cardId).name : `${RARITY_LABEL[best.rarity]} ${getCard(best.cardId).name}`) : '-'}</p>
      {starterProgress.map(note => <p key={note.deckId} className={`box-results-starter ${note.unlockedNow ? 'unlocked' : ''}`}>{note.unlockedNow ? `${note.name} unlocked · ready in Decks` : `${note.name} · ${note.collected} / ${note.total} cards`}</p>)}
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

export function BoxDetail({ box, onBack }: { box: ArchetypeBoxDef; onBack: () => void }) {
  const economy = useEconomy();
  const [state, setState] = useState(() => getBoxesState());
  // The last pull: already granted and saved. The ceremony plays first; Pull Results shows it once the ceremony ends.
  const [opening, setOpening] = useState<{ pulls: BoxPull[]; starterProgress: StarterProgressNote[] } | null>(null);
  const reveal = useRevealSequence();
  const [inspect, setInspect] = useState<string | null>(null);
  const [showContents, setShowContents] = useState(false);
  const [confirmRestock, setConfirmRestock] = useState(false);
  const [notice, setNotice] = useState('');
  // The ceremony's small synthesized score: off by default, switched on by a tap (browsers only allow audio after one).
  const [audio] = useState(() => new ArchiveAudio());
  const [soundOn, setSoundOn] = useState(false);
  const size = boxSize(box.id);
  const totals = boxRarityTotals(box.id);
  const cardsLeft = boxCardsRemaining(box.id, state);
  const rarityLeft = boxRarityRemaining(box.id, state);
  const odds = boxNextCardOdds(box.id, state);
  const pool = getBoxPool(box.id, state);
  const flagshipLeft = pool.remaining[box.flagshipId] ?? 0;
  const pulledThisBox = size - cardsLeft;

  useEffect(() => {
    const unsubscribe = onRevealSound((event) => audio.play(event));
    return () => { unsubscribe(); audio.close(); };
  }, [audio]);

  useEffect(() => {
    track('box_viewed', { boxId: box.id, cardsRemaining: boxCardsRemaining(box.id) });
    window.scrollTo?.({ top: 0 });
  }, [box.id]);

  const results = opening && reveal.view?.isResult ? opening : null;
  function closeResults() {
    setOpening(null);
    reveal.end();
  }

  function pull(count: PullCount, payment: PullPayment = 'gems') {
    if (reveal.outcome) return;
    const before = getCollection();
    const result = buyBoxPulls(box.id, count, payment);
    if (!result.ok) {
      const what = count === 1 ? 'a card' : '10 cards';
      setNotice(result.reason === 'sold-out' ? `Only ${cardsLeft} ${cardsLeft === 1 ? 'card remains' : 'cards remain'} in this Box.` : result.reason === 'not-enough-tickets' ? `You need ${boxPullTickets(count)} Pull ${boxPullTickets(count) === 1 ? 'Ticket' : 'Tickets'} to pull ${what}.` : `You need ${boxPullPrice(count).toLocaleString()} Gems to pull ${what}.`);
      return;
    }
    setNotice('');
    setState(result.opening.state);
    const pulls = result.opening.pulls;
    const starterProgress = starterProgressBetween(before, getCollection());
    setOpening({ pulls, starterProgress });
    reveal.start(pullRevealOutcome(box.name, pulls, starterProgress));
  }

  function restock() {
    const next = restockBox(box.id);
    const restockCount = getBoxPool(box.id, next).restockCount;
    track('box_restocked', { boxId: box.id, restockCount });
    setState(next);
    setConfirmRestock(false);
    setNotice(`The ${box.name} is full again: ${size} cards. Your collection is unchanged.`);
  }

  function openContents() {
    track('box_contents_viewed', { boxId: box.id, cardsRemaining: cardsLeft });
    setShowContents(true);
  }

  const pullButton = (count: PullCount) => {
    const price = boxPullPrice(count);
    const soldOut = cardsLeft < count;
    const short = !canAfford(price, economy.gems);
    return <button type="button" className={`box-open ${count === 10 ? 'ten' : ''}`} onClick={() => pull(count)} disabled={soldOut || !!reveal.outcome} aria-describedby={short ? 'box-gem-balance' : undefined}>
      <strong>{count === 1 ? 'Pull 1' : 'Pull 10'}</strong>
      <span><GemIcon size={14} />{price.toLocaleString()}</span>
      {soldOut && <small>{cardsLeft === 0 ? 'Box empty' : 'Not enough cards left'}</small>}
    </button>;
  };
  // Pull Tickets: one pays for one pull from this same Box, instead of its Gem price.
  const ticketCount: PullCount = economy.tickets >= boxPullTickets(10) && cardsLeft >= 10 ? 10 : 1;
  const ticketButton = cardsLeft > 0 && economy.tickets > 0 && canAffordTickets(boxPullTickets(1), economy.tickets) ? <button type="button" className="box-open ticket" onClick={() => pull(ticketCount, 'tickets')} disabled={cardsLeft < 1 || !!reveal.outcome}>
    <strong>{ticketCount === 1 ? 'Pull 1 with a Ticket' : 'Pull 10 with Tickets'}</strong>
    <span><TicketIcon size={14} />{boxPullTickets(ticketCount)} of {economy.tickets} Pull {economy.tickets === 1 ? 'Ticket' : 'Tickets'}</span>
  </button> : null;

  return <main className="shop-screen box-screen">
    <nav className="box-nav"><button type="button" onClick={onBack}><Icon name="back" size={18} />Shop</button><span className="box-balances">{economy.tickets > 0 && <span aria-label={`${economy.tickets} Pull ${economy.tickets === 1 ? 'Ticket' : 'Tickets'}`}><TicketIcon size={15} />{economy.tickets.toLocaleString()}</span>}<span id="box-gem-balance"><GemIcon size={15} />{economy.gems.toLocaleString()}</span></span></nav>

    <section className="box-hero" aria-labelledby="box-title">
      <div className="box-hero-art" aria-hidden="true">
        <div className="box-moon" />
        {box.bannerCardIds.map((id, index) => <span key={id} className={`box-hero-figure f${index}`}><CardArtwork cardId={id} /></span>)}
      </div>
      <div className="box-hero-copy">
        <span className="box-eyebrow">{box.faction.toUpperCase()} BOX · 1 CARD PER PULL</span>
        <h1 id="box-title">{box.name}</h1>
        <p className="box-theme">{box.theme}</p>
      </div>
      <div className="box-remaining" aria-label={`${cardsLeft} of ${size} cards left`}>
        <div><strong>{cardsLeft}</strong><span> of {size} cards left</span></div>
        <div className="box-meter"><span style={{ width: `${(cardsLeft / size) * 100}%` }} /></div>
      </div>
    </section>

    <div className="box-actions">{ticketButton}{pullButton(1)}{pullButton(10)}</div>
    {canRestockBox(box.id, state) && <button type="button" className="box-open restock" onClick={() => setConfirmRestock(true)}><strong>Restock Box</strong><span>Free · refills all {size} cards</span></button>}
    <button type="button" className="box-sound" aria-pressed={soundOn} onClick={async () => {
      if (soundOn) { audio.disable(); setSoundOn(false); }
      else setSoundOn(await audio.enable());
    }}>Pull sound {soundOn ? 'on' : 'off'}</button>
    {notice && <p className="box-notice" role="status">{notice}</p>}

    <section className="box-section" aria-labelledby="box-chase-title">
      <div className="box-section-heading"><h2 id="box-chase-title">Headline cards</h2><span>{flagshipLeft > 0 ? 'Legendary still inside' : 'Legendary pulled'}</span></div>
      <div className="box-chase">
        {box.bannerCardIds.map(id => {
          const total = boxContents(box.id, state).find(entry => entry.cardId === id)?.total ?? 0;
          const left = pool.remaining[id] ?? 0;
          return <button type="button" key={id} className={`box-chase-card ${left === 0 ? 'gone' : ''}`} onClick={() => setInspect(id)} aria-label={`${getCard(id).name}, ${left} of ${total} left. Show details.`}>
            <PulledCard cardId={id} />
            <span className="box-chase-left">{left === 0 ? 'None left' : `${left} of ${total} left`}</span>
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
          <small>of {totals[rarity]} · next card {percent(odds[rarity])}</small>
        </div>)}
      </div>
    </section>

    <section className="box-section box-rules" aria-labelledby="box-rules-title">
      <h2 id="box-rules-title">Rates and rules</h2>
      <ul>
        <li>A full {box.name} holds exactly {size} cards: {totals.common} Common, {totals.rare} Rare, {totals.epic} Epic and {totals.legendary} Legendary. Each Common is in it 4 times, each Rare 3 times, each Epic twice and the Legendary once.</li>
        <li>A pull takes 1 card and a 10-pull takes 10. Each card is drawn at random from the cards still inside, so every remaining card is equally likely. The "next card" odds above are exact.</li>
        <li>There are no guaranteed slots, bonus cards or pity counter. Emptying the Box collects every card in it, the Legendary included.</li>
        <li>A Pull Ticket pays for one pull from this Box in place of its Gem price. The card is drawn exactly like a bought one.</li>
        <li>Once the Box is empty you can restock it for free. Restocking refills it to full and never removes cards you own.</li>
      </ul>
      <div className="box-reset-row">
        <span>{pool.pulls} pulled{pool.restockCount > 0 ? ` · restocked ${pool.restockCount} ${pool.restockCount === 1 ? 'time' : 'times'}` : ''}{pulledThisBox > 0 && cardsLeft > 0 ? ` · ${pulledThisBox} out of this Box` : ''}</span>
      </div>
      <p className="box-test-note">Prototype: pulls are bought with in-game Gems only. No real money is involved.</p>
    </section>

    {showContents && <ContentsSheet box={box} state={state} onInspect={setInspect} onClose={() => setShowContents(false)} />}
    {confirmRestock && <RestockDialog box={box} onCancel={() => setConfirmRestock(false)} onConfirm={restock} />}
    {reveal.outcome && reveal.plan && reveal.view && !reveal.view.isResult && <RevealStage outcome={reveal.outcome} plan={reveal.plan} view={reveal.view} onAdvance={reveal.advance} onSkip={reveal.skip} onIntroFinished={reveal.finishIntro} />}
    {results && <PullResults pulls={results.pulls} starterProgress={results.starterProgress} onInspect={setInspect} onClose={closeResults} />}
    {inspect && <CardViewer cardId={inspect} context="pack" onClose={() => setInspect(null)} />}
  </main>;
}
