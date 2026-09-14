import type { ReactNode } from 'react';

/** Shared header for the 5 main tab screens - a title, an optional caption, and an optional right-side action. Not used by Battle, which has its own compact controls strip. */
export function TopBar({ title, caption, right }: { title: string; caption?: string; right?: ReactNode }) {
  return (
    <div className="top-bar">
      <div className="top-bar-text">
        <div className="top-bar-title">{title}</div>
        {caption && <div className="top-bar-caption">{caption}</div>}
      </div>
      {right && <div className="top-bar-right">{right}</div>}
    </div>
  );
}
