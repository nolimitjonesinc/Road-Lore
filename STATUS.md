# Road-Lore — Status
_Auto-updated by Status Brain on every push. Last change: Add Status Brain workflow to auto-document project state._

**Status:** Live  
**What it is:** A mobile web app that uses your GPS location, real landmarks from OpenStreetMap and Wikipedia, and Claude AI to generate short, accurate tour-guide stories read aloud by your phone's voice.  
**Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Supabase (PostgreSQL), Claude API, MapLibre GL.

## What works right now
- Tap a button to hear a story about your current location
- Fetch real place names from OpenStreetMap (reverse geocoding, no key needed)
- Query Wikipedia for verified landmarks within a configurable radius (default 2500 ft, auto-widens to ~1 mile if empty)
- Generate unique stories using Claude Sonnet, with memory to avoid retelling the same facts
- Play stories aloud with Gemini TTS (with fallback to browser voice if no API key)
- Shared story pool in Supabase to prevent duplicate hoarding across all users
- Save stories locally in browser (persists without login)
- Map explorer showing nearby landmarks with gold speech-bubble pins labeled with landmark names
- Vibe buttons (e.g., "spooky," "dramatic") that generate on-tap stories instead of just highlighting
- Responsive mobile-first design (PWA-ready with service worker and manifest)
- SEO: sitemap and robots.txt
- Blog system (markdown-based)

## Recent changes (newest first)
- 2026-07-20 — Added Status Brain workflow to auto-generate this file on every push
- 2026-07-20 — Added Status Brain script (status-brain.mjs)
- 2026-07-14 — Deduplicate stories by topic, not just exact row, so subjects don't repeat across calls
- 2026-07-13 — Redesigned search-radius UI: dropped emoji, made "Change" a real button
- 2026-07-13 — Vibe buttons now generate a story on tap instead of just visual highlighting
- 2026-07-13 — Map pins now labeled with landmark names so taps aren't a guess
- 2026-07-11 — Hardened temp diagnostic: secret-gated, no raw error text, reports key role info
- 2026-07-06 — Story memory + pool cap: no more retelling same facts, no duplicate hoarding

## Reusable parts (for other projects)
- **Device ID tracking** — persistent browser ID without login — `lib/deviceId.ts`
- **Supabase integration pattern** — config, schema, and service-role auth — `lib/supabase.ts`, `lib/supabaseConfig.ts`, `supabase/sql/2026-06-30-shared-story-pool.sql`
- **Blog system** — markdown-based posts with frontmatter, slug routing — `lib/blog.ts`, `app/blog/[slug]/page.tsx`
- **OSM reverse geocoding** — free lookup from coordinates to place name — `lib/locationResearch.ts`
- **Claude prompt engineering** — topic deduplication, fact-checking, story generation — `lib/storyPrompt.ts`
- **Voice synthesis abstraction** — swappable between Gemini TTS and browser voice — `hooks/useSpeech.ts`

## Not done / next
- User accounts and cross-device sync (currently all state is device-local)
- Offline story playback (requires caching Claude responses, currently network-only)
- Admin dashboard for monitoring shared pool and duplicate topics
- Multiple story styles / more vibe buttons (currently just basic mood variations)
- Analytics (no tracking of which landmarks are most-asked-about)
- Landmark photo carousel or embedded Wikipedia images
- Non-English stories (prompt is currently English-only)
- Search by landmark name instead of GPS
- Rate-limit handling for Wikipedia/OSM in high-traffic scenarios (currently relies on service polite limits)
