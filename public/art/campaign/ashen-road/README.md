# Ashen Road art drop

Chapter 1's painted world background goes here as `chapter-1-world.webp` (or `.png`), authored at
the same 1200x844 reference aspect ratio `CampaignPage.tsx`'s node coordinates and road SVG already
use (`TRACK_W`/`TRACK_H`).

Environment only - sky, terrain, ash, ruins, distant landmarks (watchtower, broken palisade, the
barrow/boss gate). No node UI, labels, progress state, Energy UI or interactive elements - those
are always drawn by React/CSS on top of this image.

To wire it up once the file lands here, uncomment the `chapter-1` entry in
`src/game/campaign/art.ts`. Nothing else needs to change - the road, nodes and progress overlays
are already positioned in this same coordinate space, not relative to the image.
