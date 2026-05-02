
-- ============================================================
-- MEDIEVAL FORGE MULTIPLAYER ROOM REGISTRY
-- Hardened version for Lovable / Supabase
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1) TABLES
-- ============================================================

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique
    constraint game_rooms_room_code_format
    check (room_code ~ '^[A-Z0-9]{4,16}$'),

  host_player_id text not null
    constraint game_rooms_host_player_id_not_blank
    check (length(trim(host_player_id)) > 0),

  host_display_name text not null default 'Host'
    constraint game_rooms_host_display_name_not_blank
    check (length(trim(host_display_name)) > 0),

  status text not null default 'open'
    constraint game_rooms_status_valid
    check (status in ('open', 'in_game', 'closed')),

  current_player_count integer not null default 0
    constraint game_rooms_current_player_count_non_negative
    check (current_player_count >= 0),

  max_players integer not null default 12
    constraint game_rooms_max_players_valid
    check (max_players >= 1 and max_players <= 32),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now()
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),

  room_id uuid not null
    references public.game_rooms(id) on delete cascade,

  player_id text not null
    constraint room_players_player_id_not_blank
    check (length(trim(player_id)) > 0),

  display_name text not null default 'Knight'
    constraint room_players_display_name_not_blank
    check (length(trim(display_name)) > 0),

  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  is_host boolean not null default false,
  is_connected boolean not null default true,

  unique (room_id, player_id)
);

-- ============================================================
-- 2) INDEXES
-- ============================================================

create index if not exists idx_game_rooms_open_fresh
  on public.game_rooms (status, last_heartbeat_at desc)
  where status = 'open';

create index if not exists idx_room_players_room_connected
  on public.room_players (room_id, is_connected)
  where is_connected = true;

create index if not exists idx_room_players_player
  on public.room_players (player_id);

-- ============================================================
-- 3) TRIGGERS
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_game_rooms_updated_at on public.game_rooms;
create trigger trg_game_rooms_updated_at
before update on public.game_rooms
for each row
execute function public.set_updated_at();

create or replace function public.set_last_seen_at()
returns trigger
language plpgsql
as $$
begin
  new.last_seen_at = now();
  return new;
end;
$$;

drop trigger if exists trg_room_players_last_seen on public.room_players;
create trigger trg_room_players_last_seen
before update on public.room_players
for each row
execute function public.set_last_seen_at();

-- ============================================================
-- 4) HELPER: refresh room state
-- ============================================================

create or replace function public.refresh_game_room_state(_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _remaining integer;
  _current_host_connected boolean;
  _new_host_player_id text;
  _new_host_display_name text;
begin
  select count(*)
    into _remaining
  from public.room_players
  where room_id = _room_id
    and is_connected = true;

  if _remaining = 0 then
    update public.room_players
      set is_host = false
      where room_id = _room_id;

    update public.game_rooms
      set status = 'closed',
          current_player_count = 0
      where id = _room_id;

    return;
  end if;

  select exists (
    select 1
    from public.room_players rp
    join public.game_rooms gr on gr.id = rp.room_id
    where rp.room_id = _room_id
      and rp.player_id = gr.host_player_id
      and rp.is_connected = true
  )
  into _current_host_connected;

  if not _current_host_connected then
    select rp.player_id, rp.display_name
      into _new_host_player_id, _new_host_display_name
    from public.room_players rp
    where rp.room_id = _room_id
      and rp.is_connected = true
    order by rp.joined_at asc, rp.id asc
    limit 1;

    update public.room_players
      set is_host = false
      where room_id = _room_id;

    update public.room_players
      set is_host = true
      where room_id = _room_id
        and player_id = _new_host_player_id;

    update public.game_rooms
      set host_player_id = _new_host_player_id,
          host_display_name = _new_host_display_name,
          current_player_count = _remaining,
          status = 'open'
      where id = _room_id;
  else
    update public.room_players
      set is_host = (
        player_id = (
          select gr.host_player_id
          from public.game_rooms gr
          where gr.id = _room_id
        )
      )
      where room_id = _room_id;

    update public.game_rooms
      set current_player_count = _remaining,
          status = 'open'
      where id = _room_id;
  end if;
end;
$$;

-- ============================================================
-- 5) RLS
-- ============================================================

alter table public.game_rooms enable row level security;
alter table public.room_players enable row level security;

drop policy if exists "Anyone can read rooms" on public.game_rooms;
create policy "Anyone can read rooms"
  on public.game_rooms
  for select
  using (true);

drop policy if exists "Anyone can read room_players" on public.room_players;
create policy "Anyone can read room_players"
  on public.room_players
  for select
  using (true);

-- ============================================================
-- 6) RPC: create_game_room
-- ============================================================

create or replace function public.create_game_room(
  _room_code text,
  _player_id text,
  _display_name text,
  _max_players integer default 12
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _room_id uuid;
  _clean_code text;
  _clean_player_id text;
  _clean_display_name text;
begin
  _clean_code := upper(trim(coalesce(_room_code, '')));
  _clean_player_id := trim(coalesce(_player_id, ''));
  _clean_display_name := trim(coalesce(_display_name, ''));

  if _clean_code !~ '^[A-Z0-9]{4,16}$' then
    raise exception 'Invalid room code format. Must be 4-16 uppercase alphanumeric characters.';
  end if;

  if length(_clean_player_id) = 0 then
    raise exception 'player_id cannot be blank';
  end if;

  if length(_clean_display_name) = 0 then
    _clean_display_name := 'Host';
  end if;

  if _max_players < 1 or _max_players > 32 then
    raise exception 'max_players must be between 1 and 32';
  end if;

  insert into public.game_rooms (
    room_code,
    host_player_id,
    host_display_name,
    current_player_count,
    max_players,
    status
  )
  values (
    _clean_code,
    _clean_player_id,
    _clean_display_name,
    1,
    _max_players,
    'open'
  )
  returning id into _room_id;

  insert into public.room_players (
    room_id,
    player_id,
    display_name,
    is_host,
    is_connected
  )
  values (
    _room_id,
    _clean_player_id,
    _clean_display_name,
    true,
    true
  );

  perform public.refresh_game_room_state(_room_id);

  return _room_id;
end;
$$;

-- ============================================================
-- 7) RPC: join_game_room
-- ============================================================

create or replace function public.join_game_room(
  _room_code text,
  _player_id text,
  _display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _room_id uuid;
  _max_players integer;
  _status text;
  _connected_count integer;
  _clean_code text;
  _clean_player_id text;
  _clean_display_name text;
begin
  _clean_code := upper(trim(coalesce(_room_code, '')));
  _clean_player_id := trim(coalesce(_player_id, ''));
  _clean_display_name := trim(coalesce(_display_name, ''));

  if _clean_player_id = '' then
    raise exception 'player_id cannot be blank';
  end if;

  if _clean_display_name = '' then
    _clean_display_name := 'Knight';
  end if;

  select id, max_players, status
    into _room_id, _max_players, _status
  from public.game_rooms
  where room_code = _clean_code
  for update;

  if _room_id is null then
    raise exception 'Room not found';
  end if;

  if _status <> 'open' then
    raise exception 'Room is not open (status: %)', _status;
  end if;

  insert into public.room_players (
    room_id,
    player_id,
    display_name,
    is_host,
    is_connected
  )
  values (
    _room_id,
    _clean_player_id,
    _clean_display_name,
    false,
    true
  )
  on conflict (room_id, player_id)
  do update set
    display_name = excluded.display_name,
    is_connected = true,
    last_seen_at = now();

  select count(*)
    into _connected_count
  from public.room_players
  where room_id = _room_id
    and is_connected = true;

  if _connected_count > _max_players then
    update public.room_players
      set is_connected = false
      where room_id = _room_id
        and player_id = _clean_player_id;

    perform public.refresh_game_room_state(_room_id);
    raise exception 'Room is full';
  end if;

  update public.game_rooms
    set last_heartbeat_at = now()
    where id = _room_id;

  perform public.refresh_game_room_state(_room_id);

  return _room_id;
end;
$$;

-- ============================================================
-- 8) RPC: leave_game_room
-- ============================================================

create or replace function public.leave_game_room(
  _player_id text,
  _room_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _clean_player_id text;
begin
  _clean_player_id := trim(coalesce(_player_id, ''));

  if _clean_player_id = '' then
    raise exception 'player_id cannot be blank';
  end if;

  update public.room_players
    set is_connected = false
    where room_id = _room_id
      and player_id = _clean_player_id;

  perform public.refresh_game_room_state(_room_id);
end;
$$;

-- ============================================================
-- 9) RPC: heartbeat_room_player
-- ============================================================

create or replace function public.heartbeat_room_player(
  _player_id text,
  _room_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _clean_player_id text;
begin
  _clean_player_id := trim(coalesce(_player_id, ''));

  if _clean_player_id = '' then
    raise exception 'player_id cannot be blank';
  end if;

  update public.room_players
    set last_seen_at = now()
    where room_id = _room_id
      and player_id = _clean_player_id
      and is_connected = true;

  update public.game_rooms
    set last_heartbeat_at = now()
    where id = _room_id
      and status <> 'closed';
end;
$$;

-- ============================================================
-- 10) RPC: cleanup_stale_rooms
-- ============================================================

create or replace function public.cleanup_stale_rooms()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _room record;
begin
  update public.room_players
    set is_connected = false
    where is_connected = true
      and last_seen_at < now() - interval '60 seconds';

  for _room in
    select id
    from public.game_rooms
    where status <> 'closed'
  loop
    perform public.refresh_game_room_state(_room.id);
  end loop;

  update public.game_rooms
    set status = 'closed'
    where current_player_count = 0
      and last_heartbeat_at < now() - interval '60 seconds';
end;
$$;

-- ============================================================
-- 11) FUNCTION EXECUTION PRIVILEGES
-- ============================================================

revoke all on function public.create_game_room(text, text, text, integer) from public;
revoke all on function public.join_game_room(text, text, text) from public;
revoke all on function public.leave_game_room(text, uuid) from public;
revoke all on function public.heartbeat_room_player(text, uuid) from public;
revoke all on function public.cleanup_stale_rooms() from public;
revoke all on function public.refresh_game_room_state(uuid) from public;

grant execute on function public.create_game_room(text, text, text, integer) to anon, authenticated;
grant execute on function public.join_game_room(text, text, text) to anon, authenticated;
grant execute on function public.leave_game_room(text, uuid) to anon, authenticated;
grant execute on function public.heartbeat_room_player(text, uuid) to anon, authenticated;
