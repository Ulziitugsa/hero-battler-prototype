import { useState } from 'react';
import type { CampaignStoryBeatDef } from '../../game/campaign/types';
import { Icon } from '../../components/Icon';

/** A lightweight dialogue beat - one figure, a crest nameplate, one carved ribbon of lines at a time,
 * skippable. Chapter 1 uses exactly two of these to demonstrate the flow, not a written campaign. */
export function StoryBeatSheet({ story, onDone }: { story: CampaignStoryBeatDef; onDone: () => void }) {
  const [lineIndex, setLineIndex] = useState(0);

  function advance() {
    if (lineIndex < story.lines.length - 1) setLineIndex((i) => i + 1);
    else onDone();
  }

  return (
    <div className="overlay-backdrop campaign-story-backdrop" onClick={advance}>
      <div className="campaign-story-figure" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="campaign-story-skip" onClick={onDone}>
          <span>Skip</span>
          <Icon name="sort" size={12} />
        </button>

        <div className={`campaign-story-portrait ${story.speakerFaction}`} />

        <div className="campaign-story-nameplate">
          <span className={`campaign-sigil xs ${story.speakerFaction}`} />
          <span className="campaign-story-name">{story.speakerName}</span>
          <span className="campaign-story-role">{story.speakerRole}</span>
        </div>

        <div className="campaign-story-ribbon" onClick={advance}>
          <span className="campaign-story-line">{story.lines[lineIndex]}</span>
          <div className="campaign-story-footer">
            <span className="campaign-story-progress">
              {lineIndex + 1} of {story.lines.length}
            </span>
            <span className="campaign-story-continue">
              <span>Tap to continue</span>
              <Icon name="back" size={13} className="campaign-story-continue-chevron" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
