import type { ReactNode } from 'react';
export type AttentionState = 'ready' | 'new' | 'count';
export function AttentionDot({ label, state = 'ready' }: { label: string; state?: Exclude<AttentionState, 'count'> }) {
  return <span className={`attention-dot attention-dot-${state}`} role="img" aria-label={label} />;
}
export function AttentionBadge({ label, count, children }: { label: string; count?: number; children?: ReactNode }) {
  return <span className="attention-badge-wrap">{children}<span className={`attention-badge ${count && count > 0 ? 'count' : ''}`} role="img" aria-label={label}>{count && count > 0 ? Math.min(count, 9) : '!'}</span></span>;
}
