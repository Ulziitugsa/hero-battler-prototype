import type { StarterFaction } from '../game/cards/starterDecks';

/** Small line-drawn reliquary for nav plates. */
export function SummonChestIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5V19h16v-8.5M3 10.5a9 9 0 0 1 18 0H3ZM3 14.5h18M12 12.5v4" />
    </svg>
  );
}

const CX = 100;
const R_IN = 27;
const R_OUT = 85;
const pt = (r: number, deg: number) => `${(CX + r * Math.cos((deg * Math.PI) / 180)).toFixed(2)} ${(CX + r * Math.sin((deg * Math.PI) / 180)).toFixed(2)}`;

/** Six carved wedges (54deg each, 6deg seams between). Each carries its outward direction so the opening animation can part them. */
const WEDGES = Array.from({ length: 6 }, (_, k) => {
  const a0 = k * 60 - 85.5;
  const a1 = k * 60 - 34.5;
  const mid = (a0 + a1) / 2;
  return {
    d: `M ${pt(R_IN, a0)} L ${pt(R_OUT, a0)} A ${R_OUT} ${R_OUT} 0 0 1 ${pt(R_OUT, a1)} L ${pt(R_IN, a1)} A ${R_IN} ${R_IN} 0 0 0 ${pt(R_IN, a0)} Z`,
    dx: Math.cos((mid * Math.PI) / 180),
    dy: Math.sin((mid * Math.PI) / 180),
  };
});

const SIGIL: Record<StarterFaction, string> = {
  kingdom: 'M100 82 L118 100 L100 118 L82 100 Z',
  undead: 'M100 84a16 16 0 1 0 0 32a16 16 0 0 0 0-32Zm0 8a8 8 0 1 1 0 16a8 8 0 0 1 0-16Z',
  infernal: 'M100 82 L119 116 L81 116 Z',
};

/**
 * The Embervale summon seal: a carved, gold-rimmed vault disc of six wedges around a wax-sealed hub. It is the
 * one reusable summon object - the faction only changes its stone, trim and hub sigil. All motion is CSS keyed
 * off the ritual's data-phase / data-tier (see summonRitual.css); this component is pure markup.
 */
export function SummonSeal({ faction }: { faction: StarterFaction }) {
  return (
    <svg viewBox="0 0 200 200" className={`seal seal-${faction}`} aria-hidden="true">
      <defs>
        <radialGradient id={`seal-core-${faction}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff6dc" stopOpacity="1" />
          <stop offset="0.38" stopColor="var(--t-main)" stopOpacity="0.9" />
          <stop offset="0.7" stopColor="var(--t-main)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--t-main)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`seal-stone-${faction}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--stone-a)" />
          <stop offset="1" stopColor="var(--stone-b)" />
        </linearGradient>
        <linearGradient id={`seal-gold-${faction}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe6ad" />
          <stop offset="1" stopColor="#a9701f" />
        </linearGradient>
      </defs>
      <g className="seal-body">
        <g className="seal-core">
          <circle cx={CX} cy={CX} r={R_OUT} fill={`url(#seal-core-${faction})`} />
          {WEDGES.map((_, k) => (
            <path key={k} className="seal-seam" d={`M ${pt(R_IN, k * 60 - 90)} L ${pt(R_OUT - 2, k * 60 - 90)}`} stroke="var(--t-main)" strokeWidth="3" strokeLinecap="round" fill="none" />
          ))}
        </g>
        <g className="seal-wedges">
          {WEDGES.map((w, k) => (
            <path key={k} className="seal-wedge" d={w.d} fill={`url(#seal-stone-${faction})`} stroke="var(--trim)" strokeWidth="1.4" strokeLinejoin="round" style={{ ['--dx' as string]: w.dx.toFixed(3), ['--dy' as string]: w.dy.toFixed(3) }} />
          ))}
          {/* engraved arc on each wedge */}
          {WEDGES.map((_, k) => (
            <path key={`e${k}`} className="seal-wedge seal-engrave" d={`M ${pt(50, k * 60 - 80)} A 50 50 0 0 1 ${pt(50, k * 60 - 40)}`} fill="none" stroke="var(--trim)" strokeWidth="1" opacity="0.5" style={{ ['--dx' as string]: WEDGES[k].dx.toFixed(3), ['--dy' as string]: WEDGES[k].dy.toFixed(3) }} />
          ))}
        </g>
        <g className="seal-ring">
          <circle cx={CX} cy={CX} r="93" fill="none" stroke={`url(#seal-gold-${faction})`} strokeWidth="5" />
          <circle cx={CX} cy={CX} r="87.5" fill="none" stroke="rgba(20,8,6,0.7)" strokeWidth="1.5" />
          <circle cx={CX} cy={CX} r="96.5" fill="none" stroke="var(--trim)" strokeWidth="1.2" strokeDasharray="2 7.4" opacity="0.8" />
        </g>
        <g className="seal-hub">
          <circle cx={CX} cy={CX} r="24" fill="#8f2624" stroke="#4e1211" strokeWidth="2.5" />
          <circle cx={CX} cy={CX} r="19" fill="none" stroke="rgba(255,214,160,0.55)" strokeWidth="1.2" />
          <path d={SIGIL[faction]} fill="#ffd894" opacity="0.92" />
          {/* fracture lines, revealed in stages during a Legendary telegraph */}
          <path className="seal-crack c1" d="M100 100 L92 84 L95 76" fill="none" stroke="var(--t-main)" strokeWidth="2" strokeLinecap="round" />
          <path className="seal-crack c2" d="M100 100 L116 96 L124 100" fill="none" stroke="var(--t-main)" strokeWidth="2" strokeLinecap="round" />
          <path className="seal-crack c3" d="M100 100 L96 118 L88 124" fill="none" stroke="var(--t-main)" strokeWidth="2" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
