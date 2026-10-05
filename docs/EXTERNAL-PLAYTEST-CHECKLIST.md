# Moonwater external playtest checklist

Use a fresh test profile for progression-dependent paths. Existing player saves should not be reset to stage a test.

## Observe

- Can players name their next Campaign action, nearest reward, and claimable reward from Home without prompting?
- Does the Home return note surface one useful change, then quiet after that state is viewed? Do ready badges remain understandable until claimed?
- Does the player understand that 1 Pull Ticket = 1 pull = 1 card from the Box they choose, and that a Box is finite (its Legendary is guaranteed by the last pull)?
- Does a Hero Level-up clearly show Gold spent and Roster Power gained? Does Ascension feel like a larger, brief milestone and explain the actual ability change and derived Star result?
- After a loss, do players choose the contextual Idle Gold, Hero upgrade, or deck action when useful, or prefer retry? Does the recommendation deficit feel informative rather than discouraging?
- After a win, does “Continue the chapter” lead players naturally to the next map node? Are chapter/elite rewards clear before continuing?
- Do players recognize collection progress and their owned Hero’s accumulated investment?
- Are Offers understood as optional test catalog entries? Do relevant offers appear only after the related system has been experienced, and does “New” quiet after viewing?
- Does “Daily rewards claimed · Idle Gold will keep accumulating” feel like a satisfying pause, rather than a claim that all Campaign play is complete?

## Verify with a clean test profile

- Complete a normal Campaign win, an elite/boss win, and a chapter completion; check reward emphasis and the continuation destination.
- Lose below and at Recommended Roster Power; verify the real deficit and recovery priority: Idle Gold, affordable Hero upgrade, deck edit, then retry.
- Complete the Ascension confirmation once and repeatedly; check the sequence remains under about 1.5 seconds and reduced-motion remains calm.
- Exercise Journey, Mission, and offer ready/new states, then revisit each destination to confirm claimed/viewed states quiet correctly.
- Check the Shop gift marker before and after claiming, including at the Gold cap; verify Ranked shows only AI matches and one-time local milestone claims.
- Check Campaign-unlocked background choices and, in a dev/debug build only, the locked-background testing toggle. Confirm normal unlock labels remain visible.
- Open the Combat V2 lab only from Developer Tools; confirm it grants no Campaign rewards and does not alter subsequent production battles.
- Check Home, Heroes, Campaign result sheets, Journey, Missions, Offers, Shop Boxes and the pull reveal at 390×844 and with reduced motion enabled.

## Known prototype limits

- Mission definitions do not include a daily chest milestone, so the UI does not invent “missions until chest” progress.
- The current local save was preserved during this pass. Campaign win/loss result sheets and a successful Ascension animation were not staged in the live browser; verify those with the fresh-profile checklist above.
- Offer purchase controls remain explicitly marked Test; there is no real billing integration or automatic commercial popup.
