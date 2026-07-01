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

-- No public update/delete policy on purpose: each story's audio file is
-- written once (unique id per story) and never overwritten, so there's no
-- legitimate reason a client needs to modify or delete someone else's
-- narration. Drop any older versions of these policies if they exist.
drop policy if exists "public overwrite road lore audio" on storage.objects;
drop policy if exists "public delete road lore audio" on storage.objects;

-- 2) Shared story pool — every auto-generated story, public to all devices,
--    keyed by the landmark it's about + the chosen story vibe.
create table if not exists roadlore_shared_stories (
  id uuid primary key default gen_random_uuid(),
  landmark_key text not null check (char_length(landmark_key) between 1 and 300),
  place_label text not null check (char_length(place_label) between 1 and 300),
  mode text not null default 'surprise' check (char_length(mode) between 1 and 50),
  spoken_script text not null check (char_length(spoken_script) between 1 and 4000),
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

-- No public UPDATE policy: /api/story writes each row exactly once (audio
-- is uploaded and the public URL known before the insert happens), so
-- there's never a legitimate update to allow. Drop any older version.
drop policy if exists "public update shared stories" on roadlore_shared_stories;

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
