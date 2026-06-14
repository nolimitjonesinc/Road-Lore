# RoadLore — Project Rules for Claude

## What this is
A dead-simple PWA-style web app: tap one button → get a fun, spoken, sourced
story about where you physically are right now. Next.js (App Router) +
TypeScript + Tailwind, deployed on Vercel.

## The non-negotiable rule: NO FAKE FACTS
- Every place name and landmark fact must come from a real lookup
  (OpenStreetMap + Wikipedia). The story model may ONLY use the context the
  server fetched.
- If the real services can't return enough, the app shows an honest error.
  It NEVER invents a story.
- Do not add "mock" or "demo" data paths.

## Architecture (keep it this simple)
- `app/page.tsx` — the one-button UI + result view. Client component.
- `app/api/story/route.ts` — server route: validate coords → research → ask Claude → return.
- `lib/locationResearch.ts` — free OSM + Wikipedia lookups. No API keys here.
- `lib/storyPrompt.ts` — system prompt + context builder.
- `hooks/useSpeech.ts` — browser SpeechSynthesis wrapper.

## Data sources (all free, all keyless)
- Reverse geocode: OpenStreetMap Nominatim. Requires a real User-Agent header.
- Nearby landmarks: Wikipedia GeoSearch API.
- History/summaries: Wikipedia REST summary API.
- NO Google Maps. NO paid web search. NO Gemini unless we deliberately swap the writer.

## The AI writer
- Model: `claude-sonnet-4-6` (cheap, fast, witty enough). Server-side only.
- Cost target: under a penny per tap. If asked to cut to $0, swap to Gemini's
  free tier — but that's a deliberate decision, not a default.
- Key lives in `ANTHROPIC_API_KEY` (env only, never in client code).

## The voice (TTS) — same approach Loomiverse uses
- Server route `app/api/voice/route.ts` turns the story into audio with
  **Gemini TTS** (`gemini-2.5-flash-preview-tts`, voice `Puck`). This is the
  same free-tier engine Loomiverse's "google-tts" uses. Key stays server-side.
- Gemini returns raw PCM; we wrap it in a WAV header before sending it.
- The browser plays the audio; `hooks/useSpeech.ts` falls back to the phone's
  built-in voice if there's no key, an error, or autoplay is blocked.
- "Repeat" replays the cached audio — no second API call.
- Cost: free tier (no card). Key lives in `GEMINI_API_KEY` (optional; blank = robot voice).

## Style of the story
Fun, touristy, lightly sassy, cinematic, family-safe. Written for listening,
not reading. Under ~60 seconds. No directions, no "look at the screen."

## Guardrails
- Keep it ONE page. No accounts, no database, no maps, no settings.
- If a change starts adding those, stop and confirm with Danny first.
- HTTPS is required for geolocation — test on the Vercel URL, not just local.

## Where things are going (see tasks/roadlore.md)
v1 is the button → story → voice loop. Later: save stories, modes, drive
safety, custom domain. Don't build those until v1 is tested and loved.
