-- Serialize rematch votes and prevent restarting an unfinished battle.
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
  select * into v_room from public.friendly_rooms where id = p_room_id for update;
  if v_room.status <> 'COMPLETE' then
    raise exception 'Rematch is available after the match finishes';
  end if;
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

