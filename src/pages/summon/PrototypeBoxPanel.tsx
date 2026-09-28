import { useState } from 'react';
import { getCard } from '../../game/cards';
import { PROTOTYPE_BOX, getPrototypeBoxState, openPrototypeBox, prototypeBoxPacksRemaining, prototypeBoxRarityCounts, resetPrototypeBox, type PrototypeBoxPull } from '../../game/box/prototypeBox';
import type { Rarity } from '../../game/types';
import { track } from '../../analytics/track';
import { CardDetail } from '../../components/CardDetail';
import '../../styles/box.css';

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export function PrototypeBoxPanel() {
  const [state, setState] = useState(() => getPrototypeBoxState());
  const [pulls, setPulls] = useState<PrototypeBoxPull[]>([]);
  const [inspect, setInspect] = useState<string | null>(null);
  const remaining = prototypeBoxRarityCounts(state);
  const packsLeft = prototypeBoxPacksRemaining(state);

  function open(count: 1 | 10) {
    const result = openPrototypeBox(count);
    const cards = result.packs.flat();
    setState(result.state);
    setPulls(cards);
    track('prototype_box_opened', { boxId: PROTOTYPE_BOX.id, packCount: count, cardCount: cards.length, legendaryCount: cards.filter(card => card.rarity === 'legendary').length });
  }

  function reset() {
    if (!window.confirm('Refill the test Box? Collection cards you already opened will stay in your collection.')) return;
    setState(resetPrototypeBox());
    setPulls([]);
  }

  return <details className="prototype-box-panel">
    <summary>Test economy · Moonfall Box</summary>
    <section className="prototype-box" aria-label="Test only finite card Box">
      <header><div><span>FINITE BOX · TEST ONLY</span><h2>{PROTOTYPE_BOX.name}</h2><p>{packsLeft} packs left · {PROTOTYPE_BOX.cardsPerPack} cards per pack · {state.openedPacks} opened</p></div><button type="button" onClick={reset}>Reset pool</button></header>
      <div className="prototype-box-rarities" aria-label="Remaining card copies by rarity">
        {RARITIES.map(rarity => <div key={rarity} className={`r-${rarity}`}><span>{rarity}</span><strong>{remaining[rarity]}</strong><small>of {PROTOTYPE_BOX.cardCounts[rarity]}</small></div>)}
      </div>
      <p className="prototype-box-rates">Exact full-box contents: 250 Common · 150 Rare · 75 Epic · 25 Legendary copies. Cards are drawn uniformly from remaining copies; there is no pity or automatic reset in this test Box.</p>
      <div className="prototype-box-actions"><button type="button" onClick={() => open(1)} disabled={packsLeft < 1}>Open 1</button><button type="button" onClick={() => open(10)} disabled={packsLeft < 10}>Open 10</button></div>
      {pulls.length > 0 && <div className="prototype-box-pulls"><strong>Latest opening · {pulls.length} cards</strong>{pulls.map((pull, index) => { const card = getCard(pull.cardId); return <button type="button" key={`${index}-${pull.cardId}`} onClick={() => setInspect(pull.cardId)}><span className={`prototype-box-gem r-${pull.rarity}`} aria-hidden="true"/><span>{card.name}</span><small>{pull.rarity} · {pull.isNew ? 'New card' : `Duplicate · ${pull.ownedCopies} owned`}</small></button>; })}</div>}
      <details className="prototype-box-inventory"><summary>Remaining card copies</summary>{RARITIES.map(rarity => <section key={rarity}><h3>{rarity}</h3>{Object.entries(state.remaining).filter(([id, count]) => count > 0 && getCard(id).rarity === rarity).map(([id, count]) => <span key={id}>{getCard(id).name} <b>×{count}</b></span>)}</section>)}</details>
    </section>
    {inspect && <CardDetail cardId={inspect} onClose={() => setInspect(null)} />}
  </details>;
}
