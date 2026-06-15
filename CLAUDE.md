# RoadLore — Project Rules for Claude

## What this is
A PWA-style web app: tap one button → get a fun, spoken, sourced story about
where you physically are right now. Next.js (App Router) + TypeScript +
Tailwind, deployed on Vercel. Stories save to Supabase and audio is cached
on-device (IndexedDB) so replays are instant and work offline.

## The non-negotiable rule: NO FAKE FACTS
- Every place name and landmark fact must come from a real lookup
  (OpenStreetMap + Wikipedia). The story model may ONLY use the context the
  server fetched.
- If the real services can't return enough, the app shows an honest error.
  It NEVER invents a story.
- Do not add "mock" or "demo" data paths.

## Architecture
- `app/page.tsx` — main UI. Client component.
- `app/api/story/route.ts` — server route: validate coords → research → ask Claude → return.
- `app/api/voice/route.ts` — server route: text → Gemini TTS → WAV audio.
- `app/saved/` — saved stories page.
- `lib/locationResearch.ts` — free OSM + Wikipedia lookups. No API keys here.
- `lib/storyPrompt.ts` — system prompt, story angles, context builder.
- `lib/supabase.ts` — browser Supabase client (anon key only).
- `lib/audioCache.ts` — IndexedDB cache for audio blobs.
- `hooks/useSpeech.ts` — Gemini TTS playback with on-device audio cache.
- `hooks/useSavedStories.ts` — Supabase CRUD for saved stories (per device ID).

## Data sources (all free, all keyless)
- Reverse geocode: OpenStreetMap Nominatim.
- Nearby landmarks: Wikipedia GeoSearch API (10km radius, 25 results, shuffled).
- Article content: Wikipedia Action API, full intro section up to 2500 chars.
- Physical POIs: OpenStreetMap Overpass API (1km radius).

## The AI writer
- Model: `claude-sonnet-4-6`. Server-side only.
- Picks a random story angle each tap (ghost story, natural history, famous people, etc.)
- Tracks used Wikipedia articles in localStorage to avoid repeating topics.
- Cost: ~$0.005 per tap.
- Key lives in `ANTHROPIC_API_KEY` (env only).

## The voice (TTS)
- Gemini TTS (`gemini-2.5-flash-preview-tts`, voice `Puck`). Server-side only.
- Gemini returns raw PCM; we wrap it in a WAV header.
- Audio cached in IndexedDB on device — replays are instant, no second API call.
- Cost: free tier. Key lives in `GEMINI_API_KEY`.

## Supabase
- Project: ftcdqmrjjooluihysuyc
- Table: `roadlore_saved_stories`
- Columns: id (uuid), device_id, place_label, spoken_script, confidence, sources (json), created_at
- No real auth — stories scoped to a per-device UUID stored in localStorage (`roadlore.device`)
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already in Vercel)
- RLS must allow anon insert/select/delete scoped to device_id

## Style of the story
Fun, touristy, lightly sassy, cinematic, family-safe. Written for listening,
not reading. Under ~60 seconds. No directions, no "look at the screen."

## Where things are going (see tasks/roadlore.md)
Core loop is live and working. Next: story variety improvements, drive mode,
share stories, user accounts (upgrade from device ID).
