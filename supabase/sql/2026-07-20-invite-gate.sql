-- RoadLore invite gate — run once in the Supabase SQL editor.
--
-- Two tables, BOTH server-only (service_role). The anon key that ships to
-- browsers gets NO access on purpose: invite codes must never be readable
-- or guessable-by-enumeration from the client.
--
--   roadlore_invites      — the guest list. A code works while active = true;
--                           flip active to false to kill a leaked code.
--   roadlore_daily_usage  — per-device count of FRESH story generations per
--                           day, used as a cost seatbelt (cap enforced in
--                           /api/story; cached shared-pool replays are free
--                           and don't count).
--
-- IMPORTANT: enter codes in lowercase — the server lowercases whatever the
-- user types before matching.

create table if not exists public.roadlore_invites (
  code text primary key,
  label text,
  active boolean not null default true,
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.roadlore_invites enable row level security;
revoke all on table public.roadlore_invites from anon, authenticated;
grant all privileges on table public.roadlore_invites to service_role;

create table if not exists public.roadlore_daily_usage (
  device_id text not null,
  day date not null,
  stories integer not null default 0,
  primary key (device_id, day)
);

alter table public.roadlore_daily_usage enable row level security;
revoke all on table public.roadlore_daily_usage from anon, authenticated;
grant all privileges on table public.roadlore_daily_usage to service_role;

-- Atomic increment-and-return for the daily counters. Doing the +1 inside
-- Postgres (instead of read-then-write from the API route) means two
-- simultaneous requests can't both read "24" and sneak past the cap.
-- device_id doubles as a generic bucket key: 'dev:<deviceId>' rows cap each
-- device, 'code:<invite>' rows cap each invite code.
create or replace function public.roadlore_bump_usage(p_key text, p_day date)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.roadlore_daily_usage (device_id, day, stories)
  values (p_key, p_day, 1)
  on conflict (device_id, day)
  do update set stories = roadlore_daily_usage.stories + 1
  returning stories;
$$;

revoke all on function public.roadlore_bump_usage(text, date) from public, anon, authenticated;
grant execute on function public.roadlore_bump_usage(text, date) to service_role;

-- Add your codes like this (lowercase!) — one row per code. Do NOT commit
-- real codes to git; type them straight into the SQL editor.
--
-- Pick codes a bot can't guess: NOT a single dictionary word. Two random
-- words plus digits ('cactus-radio-4187') is fine for friends; for anything
-- you might post semi-publicly, use a random one (run `openssl rand -hex 8`
-- in Terminal, or just mash 16 random letters/numbers).
--
--   insert into public.roadlore_invites (code, label) values
--     ('replace-me-admin',   'DJ'),
--     ('replace-me-friends', 'friends & family');
--
-- Kill a leaked code later with:
--   update public.roadlore_invites set active = false where code = 'the-code';
