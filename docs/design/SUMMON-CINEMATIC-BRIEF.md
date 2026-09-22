# Moonwater: the Constellation Crossing

## Assessment after player review

The CSS skyfall is a timing prototype, not an approved final cinematic. Its uniform gradients, flat cloud shapes, thin trails and lack of environmental reaction give little sense of scale. Longer playback alone makes that weakness more visible. The component also receives only a rarity, so it cannot represent the number or individual rarities of a batch. Decorative escort streaks currently follow rarity rather than actual pulls. Do not polish this implementation further as the final art direction.

## Recommended production approach

Hybrid: authored or generated environment footage plus deterministic game-rendered summon lights, sound, cards and controls. The video carries the difficult environmental motion: water, clouds, atmosphere, camera travel and lighting. The renderer carries exact pull count and reward identity. Generated video alone should not be trusted to maintain exactly ten objects or stable pixel clusters across frames.

No video tool is currently connected. A directory search found Higgsfield with text/reference-image video generation; installation/connection was suggested but is unconfirmed. Actual model controls, output retrieval, pricing and commercial terms must be checked once connected. Do not claim footage has been generated or promise a quality level before reviewing a test clip.

## Eight-second storyboard

1. 0–1.5s — Moonwater at water level. A ruined observatory dominates the skyline; moving reflections establish depth. The observatory beacon awakens. Keep the foreground quieter so the point of attention is clear.
2. 1.5–3s — Camera rises through the clouds. The beacon's light opens a narrow path across the sky, without a portal ring. One or ten game-rendered lights lift from the water and gather above the tower.
3. 3–5.5s — Camera follows the lights across layered clouds. One pull has one unmistakable comet head. Ten pulls form ten separated lights in a readable constellation, then fan into a procession. Each light corresponds to its persisted pull and rarity; stars remain distinguishable from non-reward particles.
4. 5.5–6.5s — The environment darkens and the music briefly recedes. Light catches the cloud edges. Higher-rarity lights intensify according to actual rewards. No fake upgrade or near-miss animation.
5. 6.5–8s — The procession sweeps toward Moonwater. A controlled wash of light hides the cut back to the game. One star resolves into one character; ten lights settle into ten card positions. High-rarity cards can receive a short individual spotlight after the shared arrival.

Skip is a live UI button from the first frame, independent of footage. A single action reveals the resolved results. Reduced motion uses a still environment and brief fades. Audio follows the same skip/mute lifecycle.

## Environment-only video test prompt

Animate the supplied Moonwater keyframe into a premium fantasy game cinematic. Stylized anime pixel-art environment with stable crisp clusters and restrained texture; match the approved card-world palette. Blue-hour coastal village, monumental ruined observatory, layered storm clouds, warm lamps reflected in dark water. Begin at water level with subtle rippling reflections. A narrow ancient beacon wakes inside the observatory; tilt and rise smoothly toward the sky through two distinct cloud layers. End facing an open blue-black cloud corridor, with clear negative space through the centre for game-rendered objects. Strong near/mid/far separation, selective highlights, deliberate cinematic composition. No characters, no text, no UI, no cards, no comets or countable reward stars, no circular portal, no chest. Avoid photorealism, glossy 3D rendering, texture shimmer, morphing buildings and noisy particles. One continuous controlled camera move; no random cuts.

First test only the 3–4 second environmental rise before commissioning the entire sequence. It must look richer than the current prototype at phone size and maintain the pixel-art identity. Reject smeared pixels, incoherent architecture, distracting bloom or camera motion that hides the live stars. If generated video cannot pass, use authored layered artwork with a Canvas/WebGL camera or an offline 3D render, rather than applying a pixel filter to defective footage.

## Integration contract

- Pass actual pull descriptors to the presentation, not only best rarity. Build the visual constellation from that array; preserve pull order through card placement.
- Video contains scenery only. Ship reviewed local media assets, not runtime generation calls or externally embedded players.
- Preload metadata and the first frame. Start only when playable; handle errors, stalls, cancellation and unmount. Keep an immediate still/live fallback.
- Video time drives visual cue timing while playing; do not let an independent timeout reveal cards before the footage reaches its transition. Skip cancels media and timers and goes straight to results.
- Rewards are resolved exactly once before animation. Playback, replay, skip or failure never grant or redraw a reward.
- Test 1 and 10 pulls, mixed rarities, duplicates, slow loading, unsupported media, mute, reduced motion, portrait cropping and rapid skip/close. Validate exact star count and card mapping in deterministic tests; inspect the cinematic visually and with sound.

## Reference capabilities checked

- Veo advertises first/last-frame controls: https://deepmind.google/models/veo/
- Runway documents image-to-video generation: https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5

These establish available external workflows, not verified performance for this particular pixel-art scene.

## Final direction after meteor review
The user rejected both rigid and curved coded meteor overlays. The playable sequence now uses the original 4.04-second Moonwater rise plus a generated six-second forward continuation: clouds part around a floating stone doorway; doors open into ivory light. Videos are preloaded together; the previous frame stays visible until the next segment emits playing. A shared buildFilmTimeline removes all telegraph/opening sky beats and goes directly to card emergence and batch reveals. Skip goes to all results; media errors, rejected playback and a per-segment watchdog release the intro. The character-study preview uses the same film direction. The video is silent; existing game reveal cues remain separate. No claims of bespoke music or final audio polish.

