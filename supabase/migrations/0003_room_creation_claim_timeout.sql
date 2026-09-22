-- Fixes a real, reliably-reproducible bug: when both players' clients call POST /api/create-match at
-- nearly the same time (the normal case - both react to the room flipping READY), the claim
-- (`status='READY' OR (status='IN_PROGRESS' AND current_match_id IS NULL)`) couldn't tell "someone else
-- is still actively building the match" apart from "a previous attempt crashed and never finished" - both
-- look identical (IN_PROGRESS, current_match_id still null). So a second concurrent request could ALSO
-- claim it and build a SECOND, completely separate match for the same room. Each player then submitted
-- their action into a different database row the other side never saw - a permanent "stuck waiting"
-- with no error, since nothing ever failed, it just silently forked into two matches.
--
-- Same fix pattern as the round-resolution RESOLVING claim (0001): add a timestamp and only let a second
-- claim through once the first one is old enough to assume it crashed.

alter table public.friendly_rooms add column match_creation_started_at timestamptz;
