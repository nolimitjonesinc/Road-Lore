-- RoadLore: shared story pool + audio bucket rename.
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query -> paste -> Run).
-- Safe to re-run: every statement is idempotent.

-- 1) New public audio bucket (Supabase can't rename buckets, so this is the
--    "road-lore-audio" replacement for "story-audio"). Existing files in
--    story-audio are untouched and keep working off their old links.
insert into storage.buckets (id, name, public)
values ('road-lore-audio', 'road-lore-audio', true)
on conflict (id) do nothing;

drop policy if exists "public read road lore audio" on storage.objects;
create policy "public read road lore audio" on storage.objects
  for select using (bucket_id = 'road-lore-audio');

drop policy if exists "public upload road lore audio" on storage.objects;
create policy "public upload road lore audio" on storage.objects
  for insert with check (bucket_id = 'road-lore-audio');

drop policy if exists "public overwrite road lore audio" on storage.objects;
create policy "public overwrite road lore audio" on storage.objects
  for update using (bucket_id = 'road-lore-audio');

drop policy if exists "public delete road lore audio" on storage.objects;
create policy "public delete road lore audio" on storage.objects
  for delete using (bucket_id = 'road-lore-audio');

-- 2) Shared story pool — every auto-generated story, public to all devices,
--    keyed by the landmark it's about + the chosen story vibe.
create table if not exists roadlore_shared_stories (
  id uuid primary key default gen_random_uuid(),
  landmark_key text not null,
  place_label text not null,
  mode text not null default 'surprise',
  spoken_script text not null,
  confidence text not null,
  sources jsonb not null default '[]',
  audio_url text,
  created_at timestamptz not null default now()
);

create index if not exists roadlore_shared_stories_landmark_idx
  on roadlore_shared_stories (landmark_key, mode);

alter table roadlore_shared_stories enable row level security;

drop policy if exists "public read shared stories" on roadlore_shared_stories;
create policy "public read shared stories" on roadlore_shared_stories
  for select using (true);

drop policy if exists "public insert shared stories" on roadlore_shared_stories;
create policy "public insert shared stories" on roadlore_shared_stories
  for insert with check (true);

drop policy if exists "public update shared stories" on roadlore_shared_stories;
create policy "public update shared stories" on roadlore_shared_stories
  for update using (true);

-- 3) Per-device "heard" log — stops a phone hearing the same story (or every
--    story about the same landmark) twice.
create table if not exists roadlore_story_heard (
  device_id text not null,
  story_id uuid not null references roadlore_shared_stories(id) on delete cascade,
  heard_at timestamptz not null default now(),
  primary key (device_id, story_id)
);

alter table roadlore_story_heard enable row level security;

drop policy if exists "public read heard" on roadlore_story_heard;
create policy "public read heard" on roadlore_story_heard
  for select using (true);

drop policy if exists "public insert heard" on roadlore_story_heard;
create policy "public insert heard" on roadlore_story_heard
  for insert with check (true);
