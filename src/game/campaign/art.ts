// Chapter world-art pipeline. Real painted backgrounds live in
// public/art/campaign/<region-slug>/<chapter-id>-world.webp and are served at
// /art/campaign/<region-slug>/<chapter-id>-world.webp - same convention as ../cards/art.ts.
// CHAPTER_WORLD_ART is the explicit manifest of which chapters currently have real art; every
// render site falls back to the CSS-painted scene for chapters not listed here (never a
// broken-image icon). To add art later: drop the file at the path below and uncomment its entry -
// no other code needs to change, CampaignPage picks it up automatically.
//
// Art requirements: environment only - sky, terrain, ash, ruins, distant landmarks (watchtower,
// broken palisade, the barrow/boss gate). No node UI, labels, progress state, Energy UI or
// interactive elements baked in - those are always drawn by React/CSS on top. Authored at the same
// 1200x844 reference aspect ratio CampaignPage's node coordinates and road SVG already use (see
// TRACK_W/TRACK_H there), so it drops in without any coordinate rework.
const CHAPTER_WORLD_ART: Record<string, string> = {
  'chapter-1': '/art/campaign/ashen-road/chapter-1-world.webp',
};

export function chapterWorldArtUrl(chapterId: string): string | null {
  return CHAPTER_WORLD_ART[chapterId] ?? null;
}
