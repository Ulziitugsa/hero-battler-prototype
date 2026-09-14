// The enemy's hand, always face-down (the engine never exposes opponent hand contents to the
// player - see docs/game/CORE-RULES.md). Battle Screen v8: a fan of card backs with a single quiet
// numeral confirming the count, rather than a bordered pill with an icon.

const REF_W = 390; // the 390-wide reference canvas the fan math below is authored against

function layout(n: number) {
  const w = 44;
  const cx = 195;
  const step = n <= 3 ? 30 : Math.max(15, Math.round(150 / (n - 1)));
  const total = w + step * (n - 1);
  const left0 = cx - total / 2;
  const mid = (n - 1) / 2;
  const cards = Array.from({ length: n }, (_, i) => {
    const d = i - mid;
    const rot = d * (n === 1 ? 0 : 7);
    const drop = Math.abs(d) * Math.abs(d) * 2.2;
    return { leftPct: ((left0 + step * i) / REF_W) * 100, topPx: drop, rot, z: 10 - Math.round(Math.abs(d)) };
  });
  return { cards, tallyLeftPct: ((left0 + total + 8) / REF_W) * 100 };
}

export function OpponentHand({ count }: { count: number }) {
  if (count === 0) return <div className="opp-hand" />;
  const { cards, tallyLeftPct } = layout(count);
  return (
    <div className="opp-hand">
      {cards.map((c, i) => (
        <span key={i} className="opp-card-back" style={{ left: `${c.leftPct}%`, top: `${c.topPx}px`, transform: `rotate(${c.rot.toFixed(1)}deg)`, zIndex: c.z }}>
          <span className="opp-card-back-inner" />
          <span className="opp-card-back-gem" />
        </span>
      ))}
      <span className="opp-hand-tally" style={{ left: `${tallyLeftPct}%` }}>
        {count}
      </span>
    </div>
  );
}
