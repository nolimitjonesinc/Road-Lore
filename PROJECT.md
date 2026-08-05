# Road-Lore

**Last updated:** August 4, 2026
**Status:** Live (roadlore.ai) ‹CHECK: confirm the site is actually up — not re-verified in this pass›
**Lives at:** roadlore.ai (also roadlore.nolimitjones.com)

> **Truth rule:** every line below must be verifiable in this project's own files.
> Anything inferred, assumed, or remembered gets marked **‹CHECK›** so Danny can
> confirm or kill it. A doc that guesses silently is worse than no doc.

---

## 1. What it is

A mobile web app for road trips: tap one button, it grabs your GPS location,
looks up real nearby landmarks (OpenStreetMap + Wikipedia), and has Claude
write a short, sassy, tour-guide-style story about where you are — then reads
it aloud. No maps to follow, no accounts to make, and it won't invent facts:
if the real sources can't name your spot, it says so instead of making
something up.

## 2. Who it's for and what problem it solves

- **User:** someone driving/riding somewhere unfamiliar who wants context on
  where they are, without reading a screen. ‹CHECK: Danny's actual target
  audience — this is inferred from the "no directions, no look at the
  screen" style rule in CLAUDE.md, not stated anywhere as a target user.›
- **Problem:** tour-guide apps either need you to plan a route in advance or
  make you read while you should be watching the road.
- **The bet:** free public data (OSM + Wikipedia) is enough raw material for
  an AI to narrate almost anywhere, cheaply (~2¢/story), without a licensed
  content database.

## 3. Goals

1. One tap produces a spoken, factually-grounded story for wherever the user
   currently is.
2. Never fabricate a place name or landmark fact — honest failure over a
   fake story.
3. Stories cost a fraction of a cent to generate and repeat visits to the
   same spot reuse a shared cache instead of paying twice.
4. Convert from free/invite-only to a sustainable one-time-purchase model
   (‹CHECK: business goal, inferred from the locked-in pricing decision in
   tasks/roadlore.md, not confirmed as "the" goal›).

## 4. The mental model

One loop, run every time the button is tapped:

1. **Browser gets GPS coordinates** (device location API).
2. **Server reverse-geocodes** the coordinates to a place name via
   OpenStreetMap Nominatim (free, no key).
3. **Server researches nearby landmarks** via Wikipedia GeoSearch (10km
   radius, shuffled candidates) and pulls article content — a deep read
   (~7000 chars) for the closest/anchor landmark, shorter intros for the
   rest.
4. **Server asks Claude** (`claude-sonnet-4-6`) to write a short spoken-style
   story using ONLY that researched context, picking a random "angle" (ghost
   story, natural history, famous people, etc.) and avoiding topics the
   device has already heard.
5. **Text returns to the browser immediately**; narration is generated
   right after via a separate voice route (Gemini TTS) so the button isn't
   frozen waiting on both steps.
6. **Story + narration are cached** in a shared Supabase pool keyed by
   landmark + vibe, so the next device near that same spot gets the cached
   audio instead of triggering a fresh paid generation.
7. **Browser plays the audio**, caching it in IndexedDB so replays are free
   and instant.

Every request first passes an **invite-code gate** (server-checked, fails
closed) and a **daily cost cap**, before any paid API calls happen.

## 5. Feature list — what exists today

### Core story loop
- One-button "tell me a story about here" using real GPS
- Reverse geocoding via OpenStreetMap (free, keyless)
- Nearby landmark + history lookup via Wikipedia GeoSearch + Action API
- Story written by Claude Sonnet, grounded only in researched sources
- Honest failure state when real data is too thin — never invents a story
- Vibe picker (e.g. History / Weird & Funny / Spooky / Famous People / Before
  the Town / Surprise) that generates a story on tap in that style
- "Tell Me More About Here" — a second story about the same locked
  coordinates, skipping already-used Wikipedia topics
- Story memory: each request carries the device's last 5 stories so the
  writer won't retell the same facts/people/events
- Sensitive-content filter: Wikipedia articles about deaths, killings,
  crashes, and attacks are excluded from story material and source lists

### Voice
- Gemini TTS narration (`gemini-2.5-flash-preview-tts`, voice `Puck`),
  falls back to the browser's built-in voice if no Gemini key is set
- Repeat / Stop / Again playback controls
- Audio cached in IndexedDB on-device so replays don't re-call the API

### Explore / map
- "Explore nearby" distance picker (0.5/1/5/10/25 mi) listing real named
  neighborhoods/cities, tap one to hear its story
- Map explorer (MapLibre GL) showing nearby landmarks as labeled pins
- "What's That?" — tap a map pin to get a story about that specific place,
  found by strict name + geo match against Wikipedia
- Search radius auto-widens once with an honest banner if the default area
  comes back empty

### Saving / persistence
- Save a story (heart button) to Supabase, tied to a per-device ID stored
  in localStorage (no login) — `roadlore_saved_stories` table
- `/saved` page to play or delete saved stories
- Shared story pool (`roadlore_shared_stories`) reused across all users for
  the same landmark + vibe, capped at 5 stories per landmark+vibe
- Per-device "heard" log (`roadlore_story_heard`) so the same phone doesn't
  get the same cached story or landmark twice

### Access control / cost control
- Invite-only gate: `/api/story` and `/api/voice` refuse to run without a
  valid, active invite code (server-checked, fails closed)
- Invite screen shown once per device, code remembered in localStorage,
  re-validated by the server on every request (a killed code locks out
  instantly)
- Daily cost caps via `roadlore_daily_usage`: 25 fresh stories/device/day,
  150 fresh stories/invite-code/day, 5 invite-requests/IP/day
- "Knock knock" request-a-code form on the gate: name/email/how-you-found-us
  saves to `roadlore_invite_requests` and emails Danny via Resend; honeypot
  field silently drops bots

### Other
- PWA: installable manifest + service worker, works like an app
- Blog system (markdown posts with frontmatter, slug routing)
- SEO: sitemap.ts and robots.ts
- Cinematic landing UI (dusk-highway scene, motion, glass panels)

## 6. How it works underneath

- **Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS,
  deployed on Vercel.
- **Where data lives:**
  - Supabase (Postgres) project `ftcdqmrjjooluihysuyc` — tables:
    `roadlore_saved_stories`, `roadlore_shared_stories`,
    `roadlore_story_heard`, `roadlore_invites`, `roadlore_daily_usage`,
    `roadlore_invite_requests`.
  - Supabase storage bucket `road-lore-audio` (public) holds narrated audio
    files. An older bucket `story-audio` is retired but old links to it
    still resolve.
  - Per-device identity is a UUID in localStorage (`roadlore.device`, see
    `lib/deviceId.ts`) — no real user accounts.
  - Invite code is remembered client-side in localStorage
    (`roadlore.invite`, see `lib/inviteCode.ts`) but re-checked server-side
    every request.
  - IndexedDB on-device caches narrated audio blobs so replays skip the
    network entirely.
- **The key mechanism:** the story writer only ever sees facts the server
  already fetched and verified from OSM/Wikipedia — the prompt has no path
  to invent a landmark. The shared-pool cache means the same real-world spot
  only costs money once per landmark+vibe combination, not once per visitor.
- **External services:**
  - Claude API (`ANTHROPIC_API_KEY`, server-only) — writes the story, model
    `claude-sonnet-4-6`.
  - Gemini TTS (`GEMINI_API_KEY`, server-only) — narrates the story.
  - OpenStreetMap Nominatim + Overpass (no key) — reverse geocoding + POIs.
  - Wikipedia GeoSearch + Action API (no key) — landmark discovery + content.
  - Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) —
    the anon key is used server-side too; row-level security, not a
    service key, is what locks tables down (except invite tables, which are
    service-role only).
  - Resend (`RESEND_API_KEY`, shared with Silly Goose per CLAUDE.md) —
    emails Danny when someone requests an invite code.
  - LemonSqueezy — **not yet wired in.** Referenced only in
    `tasks/roadlore.md` as the planned paywall; no LemonSqueezy code exists
    in the repo yet (checked: no matches in app/ or lib/).
- **File map:**
  - `app/page.tsx` — main UI, client component (1,236 lines — the bulk of
    the app's interactivity lives here).
  - `app/api/story/route.ts` — validates coords → researches → asks Claude
    → returns story.
  - `app/api/voice/route.ts` — text → Gemini TTS → WAV audio.
  - `app/api/nearby/route.ts`, `app/api/map-pois/route.ts` — explore/map
    lookups.
  - `app/api/invite/route.ts`, `app/api/request-invite/route.ts` — gate
    check and knock-knock form handling.
  - `app/saved/` — saved stories page.
  - `app/blog/` — blog listing + post pages.
  - `lib/locationResearch.ts` — OSM + Wikipedia lookups, no API keys.
  - `lib/storyPrompt.ts` — system prompt, story angles, context builder.
  - `lib/supabase.ts` / `lib/supabaseConfig.ts` — Supabase client + config.
  - `lib/audioCache.ts` — IndexedDB cache for audio blobs.
  - `lib/deviceId.ts` — per-device UUID.
  - `lib/inviteCode.ts` / `lib/inviteGate.ts` — client + server invite logic.
  - `hooks/useSpeech.ts` — TTS playback with on-device cache.
  - `hooks/useSavedStories.ts` — Supabase CRUD for saved stories.
  - `supabase/sql/` — one-time setup SQL (story pool, invite gate) — run
    manually in the Supabase SQL editor, not migrated automatically.

## 7. Rules of the house

1. **NO FAKE FACTS.** Every place name and landmark fact must come from a
   real OSM/Wikipedia lookup. The story model may only use context the
   server fetched. If real data is too thin, the app shows an honest error
   — it never invents a story. No "mock" or "demo" data paths, ever.
2. **Fail closed on cost gates.** The invite check and daily usage caps must
   block spending by default if the check itself breaks — never fail open
   toward "let it through."
3. **Never retell the same facts to the same device.** Story memory (last 5
   stories) and used-topic tracking exist specifically so a repeat visitor
   doesn't hear the same landmark/person/event again; don't remove this to
   simplify the prompt.
4. **Sensitive articles are excluded outright** — deaths, killings, crashes,
   attacks — from both story material and source lists, not just
   soft-discouraged in the prompt.
5. **Style is for listening, not reading:** fun, touristy, lightly sassy,
   cinematic, family-safe, under ~60 seconds, no directions, no "look at the
   screen." Reinforced narrator-personality rewrite specifically to kill
   AI-speak clichés ("nestled," "bustling," "hidden gem").
6. **The free story counter (once built) is client-side and intentionally
   bypassable** — decided 2026-06-16. Abuse only costs pennies; the paid
   unlock check is the actual wall, not the counter.
7. **One-time purchase, not subscription**, for the paywall — decided
   2026-06-16, reasoning: road-trip usage is bursty, pay-once-own-forever
   fits how people travel better than a subscription.
8. **Buckets can't be renamed in Supabase** — `road-lore-audio` replaced
   `story-audio` for that reason; old links to the retired bucket are left
   working rather than migrated.

## 8. Known gaps / not built yet

- **Paywall (v2, active next):** LemonSqueezy product + API key are not yet
  created (blocked on Danny). No free-story counter, buy button, license-key
  paste field, or server-side license validation exists yet.
- User accounts / cross-device sync — all state is currently device-local.
- Offline story playback — currently network-only aside from cached audio
  for already-heard stories.
- Admin dashboard for monitoring the shared pool, duplicate topics, invite
  code usage, and email requests.
- More story styles/vibe buttons beyond the current set.
- Analytics — no tracking of which landmarks get asked about most.
- Landmark photo carousel or embedded Wikipedia images.
- Non-English stories — prompt is English-only.
- Search by landmark name as an alternative to GPS.
- Drive-safety / audio-first mode when the device is moving.
- Rate-limit handling for Wikipedia/OSM under high traffic — currently
  relies on their polite-use limits holding.
- Two open v1 checklist items never checked off in tasks/roadlore.md:
  confirming `npm run dev` works end-to-end with a fresh
  `ANTHROPIC_API_KEY`, and testing on a real phone outdoors with real GPS.
  ‹CHECK: may just be stale checkboxes rather than actually unverified —
  the app is marked Live in STATUS.md, which implies these did happen.›

## 9. Deeper history

No entry found in `../build-logs/logs/` for this project as of this write-up
— `tasks/roadlore.md` is the closest thing to a decision log and was mined
for section 7 above.
Reusable parts extracted from here: `../CAPABILITIES.md`
