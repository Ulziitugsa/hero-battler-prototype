import type { CSSProperties } from 'react';

export function WorldBackdrop() {
  return <div className="moon-world" aria-hidden="true"><div className="moon-world-image" /><div className="moon-world-shade" /><div className="moon-world-fireflies">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i, left: `${(i * 37 + 8) % 100}%`, top: `${(i * 19 + 16) % 90}%` } as CSSProperties} />)}</div></div>;
}
