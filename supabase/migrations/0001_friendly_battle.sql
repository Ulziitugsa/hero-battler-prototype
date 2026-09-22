-- Friendly Battle (online PvP POC) schema.
--
-- Design summary (see docs/FRIENDLY-BATTLE.md for the full writeup):
--  * friendly_rooms   - lobby: code, the two players, their deck snapshots, ready flags.
--  * friendly_matches - a live match's CANONICAL (unredacted) state. Never selectable by clients -
--                        service role (Vercel functions) and SECURITY DEFINER RPCs only. Clients only
--                        ever see host_view/guest_view, which are pre-redacted+oriented per viewer.
--  * friendly_match_pings - the ONLY table with Realtime enabled. Carries no game state at all - just a
--                        counter clients watch to know "something changed, go pull your own view."
--
-- All client-facing WRITES go through SECURITY DEFINER RPCs (create_room, join_room_by_code, set_ready,
-- submit_round_action) that re-derive the caller's identity/side from auth.uid() and re-check state
-- themselves - a client never gets a raw INSERT/UPDATE grant on any of these tables.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- friendly_rooms
-- ---------------------------------------------------------------------------

create table public.friendly_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'WAITING' check (status in ('WAITING', 'READY', 'IN_PROGRESS', 'COMPLETE', 'ABANDONED')),
  host_id uuid not null,
  guest_id uuid,
  host_display_name text not null,
  guest_display_name text,
  host_deck jsonb,
  guest_deck jsonb,
  host_ready boolean not null default false,
  guest_ready boolean not null default false,
  current_match_id uuid,
  match_creation_started_at timestamptz, -- backs the create-match claim's crash-recovery timeout, see 0003
  rules_version text not null default '1',
  rematch_host_wants boolean not null default false,
  rematch_guest_wants boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours'
);

alter table public.friendly_rooms enable row level security;

-- Clients may only ever SELECT a room they belong to. There is deliberately no policy/RPC that lets a
-- client SELECT an arbitrary room by code - join_room_by_code (below) is the only lookup path.
create policy "friendly_rooms_select_own" on public.friendly_rooms
  for select
  using (auth.uid() = host_id or auth.uid() = guest_id);

-- No INSERT/UPDATE/DELETE grants for authenticated - every mutation goes through a SECURITY DEFINER RPC.
revoke insert, update, delete on public.friendly_rooms from authenticated, anon;
grant select on public.friendly_rooms to authenticated;
-- Supabase's automatic default privileges for service_role (full access to every public table) only
-- apply to tables created via the dashboard/Studio, not via a pasted/CLI migration like this one -
-- BYPASSRLS and table-level GRANTs are separate mechanisms, so this needs to be explicit (see 0002).
grant select, insert, update, delete on public.friendly_rooms to service_role;

-- Safe to broadcast in full: a room row only ever holds deck LISTS (public deckbuilding info, not hidden
-- hand/deck order) plus lobby/ready/rematch flags - unlike friendly_matches, nothing here is hidden
-- information. Realtime lets both clients react instantly to a join, a ready flag, or a rematch request.
alter publication supabase_realtime add table public.friendly_rooms;

-- ---------------------------------------------------------------------------
-- friendly_matches (never selectable by clients - service role + RPCs only)
-- ---------------------------------------------------------------------------

create table public.friendly_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.friendly_rooms(id) on delete cascade,
  seed bigint not null,
  round_number int not null default 1,
  status text not null default 'AWAITING_ACTIONS' check (status in ('AWAITING_ACTIONS', 'RESOLVING', 'COMPLETE')),
  resolution_started_at timestamptz,
  canonical_state jsonb not null,
  player_action jsonb,
  player_action_round int,
  enemy_action jsonb,
  enemy_action_round int,
  host_view jsonb,
  guest_view jsonb,
  last_events_for_host jsonb,
  last_events_for_guest jsonb,
  winner text check (winner in ('player', 'enemy', 'draw')),
  completed_at timestamptz
);

alter table public.friendly_matches enable row level security;
-- No policies at all: default-deny for authenticated/anon. Table owner (used by SECURITY DEFINER RPCs)
-- and the service role (used by the Vercel functions) both bypass RLS entirely, which is intentional -
-- this table holds the unredacted canonical state and must never reach a client directly.
revoke all on public.friendly_matches from authenticated, anon;
grant select, insert, update, delete on public.friendly_matches to service_role;

alter table public.friendly_rooms
  add constraint friendly_rooms_current_match_fk foreign key (current_match_id) references public.friendly_matches(id);

-- ---------------------------------------------------------------------------
-- friendly_match_pings (the ONLY table with Realtime enabled - no game state, safe to broadcast)
-- ---------------------------------------------------------------------------

create table public.friendly_match_pings (
  match_id uuid primary key references public.friendly_matches(id) on delete cascade,
  room_id uuid not null references public.friendly_rooms(id) on delete cascade,
  event_seq int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.friendly_match_pings enable row level security;

create policy "friendly_match_pings_select_own" on public.friendly_match_pings
  for select
  using (
    exists (
      select 1 from public.friendly_rooms r
      where r.id = friendly_match_pings.room_id
        and (auth.uid() = r.host_id or auth.uid() = r.guest_id)
    )
  );

revoke insert, update, delete on public.friendly_match_pings from authenticated, anon;
grant select on public.friendly_match_pings to authenticated;
grant select, insert, update, delete on public.friendly_match_pings to service_role;

-- Enable Realtime for this table only (see docs/FRIENDLY-BATTLE.md setup step 4 - can also be done from
-- Database > Replication in the dashboard instead of this line).
alter publication supabase_realtime add table public.friendly_match_pings;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Creates a room owned by the caller. `code` is generated client-side (src/net/roomCode.ts) and retried
-- on a unique-violation; kept out of SQL so the confusable-character alphabet lives in one place.
create or replace function public.create_room(p_code text, p_host_display_name text, p_host_deck jsonb)
returns public.friendly_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.friendly_rooms;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.friendly_rooms (code, host_id, host_display_name, host_deck)
  values (p_code, auth.uid(), p_host_display_name, p_host_deck)
  returning * into v_room;

  return v_room;
end;
$$;

revoke all on function public.create_room(text, text, jsonb) from public;
grant execute on function public.create_room(text, text, jsonb) to authenticated;

-- The only way to find a room by code. Never exposes a plain SELECT-by-code to clients.
create or replace function public.join_room_by_code(p_code text, p_guest_display_name text, p_guest_deck jsonb)
returns public.friendly_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.friendly_rooms;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.friendly_rooms
  set guest_id = auth.uid(), guest_display_name = p_guest_display_name, guest_deck = p_guest_deck
  where code = p_code
    and status = 'WAITING'
    and guest_id is null
    and expires_at > now()
    and host_id <> auth.uid()
  returning * into v_room;

  if v_room.id is null then
    raise exception 'Room not found, already full, already started, or expired';
  end if;

  return v_room;
end;
$$;

revoke all on function public.join_room_by_code(text, text, jsonb) from public;
grant execute on function public.join_room_by_code(text, text, jsonb) to authenticated;

-- Flips the caller's ready flag; sets the room to READY once both sides are ready. Does NOT build the
-- match itself (that requires running the JS engine's createMatch()) - the client that flips the second
-- ready flag calls POST /api/create-match next, which is idempotent (see that function).
create or replace function public.set_ready(p_room_id uuid, p_ready boolean)
returns public.friendly_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.friendly_rooms;
  v_is_host boolean;
begin
  select (host_id = auth.uid()) into v_is_host from public.friendly_rooms where id = p_room_id;
  if v_is_host is null then
    raise exception 'Room not found';
  end if;

  if v_is_host then
    update public.friendly_rooms set host_ready = p_ready where id = p_room_id returning * into v_room;
  else
    if not exists (select 1 from public.friendly_rooms where id = p_room_id and guest_id = auth.uid()) then
      raise exception 'Not a member of this room';
    end if;
    update public.friendly_rooms set guest_ready = p_ready where id = p_room_id returning * into v_room;
  end if;

  if v_room.host_ready and v_room.guest_ready and v_room.status = 'WAITING' then
    update public.friendly_rooms set status = 'READY' where id = p_room_id returning * into v_room;
  end if;

  return v_room;
end;
$$;

revoke all on function public.set_ready(uuid, boolean) from public;
grant execute on function public.set_ready(uuid, boolean) to authenticated;

-- Stores one side's action for a round, atomically guarding staleness and duplicate submission in a
-- single conditional UPDATE. Returns whether both actions are now present for this round - the caller
-- (api/submit-action.ts) uses that to decide whether to resolve inline in the same request.
create or replace function public.submit_round_action(p_match_id uuid, p_round_number int, p_action jsonb)
returns table (both_present boolean, canonical_side text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_host_id uuid;
  v_guest_id uuid;
  v_side text;
  v_updated int;
  v_row public.friendly_matches;
begin
  select m.room_id, r.host_id, r.guest_id
    into v_room_id, v_host_id, v_guest_id
  from public.friendly_matches m
  join public.friendly_rooms r on r.id = m.room_id
  where m.id = p_match_id;

  if v_room_id is null then
    raise exception 'Match not found';
  end if;

  if auth.uid() = v_host_id then
    v_side := 'player';
  elsif auth.uid() = v_guest_id then
    v_side := 'enemy';
  else
    raise exception 'Not a member of this match';
  end if;

  if v_side = 'player' then
    update public.friendly_matches
    set player_action = p_action, player_action_round = p_round_number
    where id = p_match_id
      and round_number = p_round_number
      and status = 'AWAITING_ACTIONS'
      and player_action_round is distinct from p_round_number
    returning * into v_row;
  else
    update public.friendly_matches
    set enemy_action = p_action, enemy_action_round = p_round_number
    where id = p_match_id
      and round_number = p_round_number
      and status = 'AWAITING_ACTIONS'
      and enemy_action_round is distinct from p_round_number
    returning * into v_row;
  end if;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Stale round or action already submitted for this round';
  end if;

  return query select
    (v_row.player_action_round = p_round_number and v_row.enemy_action_round = p_round_number),
    v_side;
end;
$$;

revoke all on function public.submit_round_action(uuid, int, jsonb) from public;
grant execute on function public.submit_round_action(uuid, int, jsonb) to authenticated;

-- Flips the caller's rematch flag. Once both want a rematch, resets the room to READY (decks/ready flags
-- are unchanged - both players already had a playable deck equipped) and clears current_match_id so the
-- next POST /api/create-match builds a fresh match, exactly like the first one.
create or replace function public.request_rematch(p_room_id uuid, p_wants boolean)
returns public.friendly_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.friendly_rooms;
  v_is_host boolean;
begin
  select (host_id = auth.uid()) into v_is_host from public.friendly_rooms where id = p_room_id;
  if v_is_host is null then
    raise exception 'Room not found';
  end if;

  if v_is_host then
    update public.friendly_rooms set rematch_host_wants = p_wants where id = p_room_id returning * into v_room;
  else
    if not exists (select 1 from public.friendly_rooms where id = p_room_id and guest_id = auth.uid()) then
      raise exception 'Not a member of this room';
    end if;
    update public.friendly_rooms set rematch_guest_wants = p_wants where id = p_room_id returning * into v_room;
  end if;

  if v_room.rematch_host_wants and v_room.rematch_guest_wants then
    update public.friendly_rooms
    set status = 'READY', rematch_host_wants = false, rematch_guest_wants = false, current_match_id = null
    where id = p_room_id
    returning * into v_room;
  end if;

  return v_room;
end;
$$;

revoke all on function public.request_rematch(uuid, boolean) from public;
grant execute on function public.request_rematch(uuid, boolean) to authenticated;

-- Marks the room ABANDONED. Simplest consistent v1 behavior (no rewards exist yet, so a forfeit-vs-abandon
-- distinction isn't worth the extra state) - the other player's client sees the room status flip via the
-- friendly_rooms realtime subscription and returns to the lobby.
create or replace function public.leave_room(p_room_id uuid)
returns public.friendly_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.friendly_rooms;
begin
  if not exists (select 1 from public.friendly_rooms where id = p_room_id and (host_id = auth.uid() or guest_id = auth.uid())) then
    raise exception 'Not a member of this room';
  end if;

  update public.friendly_rooms set status = 'ABANDONED' where id = p_room_id returning * into v_room;
  return v_room;
end;
$$;

revoke all on function public.leave_room(uuid) from public;
grant execute on function public.leave_room(uuid) to authenticated;
