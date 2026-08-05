# Road-Lore — Tasks

**Last updated:** August 4, 2026

Read `PROJECT.md` before adding anything here. Tasks that break a "Rule of the
house" don't belong on this list.

Full history and older checked-off items live in `tasks/roadlore.md`.

## Next up
- [ ] LemonSqueezy: create a $7.99 one-time product with license keys enabled, publish it (blocked on Danny)
- [ ] LemonSqueezy: generate a live-mode API key, hand to Claude for `.env.local` as `LEMONSQUEEZY_API_KEY` (blocked on Danny)
- [ ] Note the LemonSqueezy store ID and product/variant ID once the key exists
- [ ] Build client-side free-story counter (5 free, localStorage) + paywall screen when exhausted
- [ ] Build "Unlock unlimited — $7.99" buy button → LemonSqueezy checkout
- [ ] Build "paste your license key" input + server route that validates against LemonSqueezy
- [ ] Server-gate `/api/story` so unlimited use requires a valid activated license key
- [ ] Persist unlocked state (store validated key in localStorage, re-check on load)
- [ ] Honest error states for invalid key / already-activated-elsewhere / network fail
- [ ] Test full paywall flow end-to-end: hit 5-free wall → buy → paste key → unlimited → survives refresh

## Doing now
- [ ] Confirm `npm run dev` works end-to-end with a fresh `ANTHROPIC_API_KEY` ‹CHECK: may already be done — app is live per STATUS.md, this checkbox is just unticked in tasks/roadlore.md›
- [ ] Test on a real phone outside with real GPS ‹CHECK: same as above›

## Done
- [x] Core story loop: GPS → OSM reverse geocode → Wikipedia research → Claude story → Gemini/browser voice
- [x] No-fake-facts guardrail with honest error states
- [x] Shared story pool + per-device "heard" log to avoid duplicate stories
- [x] Invite-only gate with server-checked codes, daily cost caps, and a "knock knock" request form (Resend email)
- [x] Vibe picker, map explorer with labeled pins, "what's that?" tap-to-story
- [x] "Tell Me More About Here" repeat-visit story with topic memory
- [x] Sensitive-article filter (deaths/killings/crashes/attacks excluded)
- [x] Save stories to Supabase per-device + `/saved` page
- [x] PWA install (manifest + service worker), custom domain (roadlore.ai)
- [x] Blog system, sitemap, robots.txt

## Someday / maybe
Ideas that aren't committed. Parking them here keeps them out of "Next up."
- Drive-safety / audio-first mode when the device is moving
- Swap writer to Gemini free tier for $0 running cost
- Paste-a-Google-Maps-link fallback when GPS is blocked
- Simple login so saved stories are truly private (not just per-device)
- Admin dashboard for shared pool, duplicate topics, invite/email monitoring
- More story styles/vibe buttons
- Analytics on which landmarks get asked about most
- Landmark photo carousel / embedded Wikipedia images
- Non-English stories
- Search by landmark name instead of GPS
- Evaluate moving to Next.js 16 (clears 2 low-risk DoS advisories, not urgent)
