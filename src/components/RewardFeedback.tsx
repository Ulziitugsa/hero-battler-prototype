import type { ReactNode } from 'react';
import '../styles/rewardFeedback.css';

/** Compact shared result language for currency, progression, and major rewards. */
export function RewardFeedback({ tone = 'progression', children, detail }: { tone?: 'small' | 'progression' | 'major'; children: ReactNode; detail?: ReactNode }) {
  return <div className={`reward-feedback ${tone}`} role="status"><strong>{children}</strong>{detail && <span>{detail}</span>}</div>;
}
