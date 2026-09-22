# Pixel style correction — September 21, 2026

The approved Pip, Selene and Aldren eight-frame sheets remain unchanged. All eight static character/spell atlases now use versioned `-v2.png` files under `public/art/pixel/`, selected through `src/game/cards/pixelArt.ts`. The previous images are retained for comparison.

Generated with the built-in image generation tool, editing each original atlas with `pip-idle-8.png` and `selene-idle-8.png` as style references. Intent: quieter backgrounds, fewer tiny details, larger coherent pixel clusters and readable faces, preserving identities and cell order. These are generated pixel-style illustrations, not a claim of hand-authored sprites or a mathematically enforced palette.

## Shared edit prompt

EDIT FIRST IMAGE ONLY. Other attached images are style references: the original approved Flame Imp and silver knight sprite sheets. Redraw every cell in FIRST IMAGE to exactly match their economical chunky pixel-art style. Preserve each subject identity, colors, pose, camera angle, cell order and exact grid; do not replace subjects with the reference characters. Cut visual complexity by at least 70 percent: remove filigree, embroidery, tiny texture flecks, realistic anatomy shading, grain and diffuse glow; simplify backgrounds to large quiet silhouette shapes. Use clean dark pixel outlines, 3 shade steps per material, about 24-32 colors per cell. Genuine 96x96 logical pixel construction per cell enlarged without smoothing. Large contiguous pixel clusters, no isolated dithering noise. Characters slightly chibi anime proportions like reference knight, expressive eyes and face preserved with enough pixel space, no painterly or high resolution anime rendering. Spell scenes use the same simple shapes as Flame Imp's fire, no fine particles or realistic lighting. This must look like intentionally designed pixel game sprites, NOT a detailed illustration with a pixel filter. EXACT grid 

Each request appended the target's exact grid: faction atlases 3×2; Kingdom/Undead expansions 2×2; Infernal expansion 3×2; spell A 4×3; spell B 3×3. Output only the corrected first image. Visual review checked the resulting sheets, and asset tests check every roster card's file and cell bounds.

## Summoning

`MoonwellVoyage.tsx` is shared by the playable ritual and the art preview. The final direction replaces the rejected chest with Moonwater skyfall: a distant spark, a diagonal comet with rarity-coloured trails, an approaching burst and the acquired card revealed through fading star fragments. The old preview ring is no longer rendered. The animation uses real-time CSS transforms, so it responds to the existing reward timeline, skip and reduced motion without a video download. Reward selection and costs remain in the game engine.

