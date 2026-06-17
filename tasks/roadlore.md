# RoadLore Tasks

## v1 — The Core Loop (build → test → love it)

- [x] Scaffold Next.js + TypeScript + Tailwind project
- [x] Free reverse geocoding (OpenStreetMap)
- [x] Free nearby landmarks + history (Wikipedia)
- [x] Server route that researches location and asks Claude to write the story
- [x] No-fake-facts guardrail (honest error if real data is thin)
- [x] One-button UI with loading states
- [x] Read story aloud — Gemini TTS voice (free), browser voice as fallback (Repeat / Stop / Again)
- [x] Plain-English errors (blocked location, no location, story failure)
- [x] README + project rules
- [ ] Add ANTHROPIC_API_KEY locally and confirm `npm run dev` end-to-end
- [ ] Push to GitHub
- [ ] Deploy to Vercel + add ANTHROPIC_API_KEY env var
- [ ] Test on a real phone outside (real GPS, real story, real voice)

## v1.1 — Polish (only after v1 is tested)

- [ ] Decide: should a place with ZERO landmarks still tell a story, or hard-fail? (currently: tells a truthful "quiet area" story)
- [x] Real narrated voice (Gemini TTS, free tier) with robot-voice fallback
- [x] Cinematic landing redesign (dusk-highway scene, motion, glass UI)
- [x] App icon (placeholder) + installable manifest + service worker (real PWA)
- [ ] Tighten Wikipedia results (filter out boring/irrelevant articles)
- [x] Connect custom domain (roadlore.nolimitjones.com — auto-verified via Vercel DNS)
- [ ] Evaluate moving to Next.js 16 (clears 2 residual low-risk DoS advisories; breaking change, not urgent for a Vercel-hosted no-image-optimizer app)

## v2 — Monetization (LemonSqueezy paywall)  ← ACTIVE NEXT

**Decisions locked (2026-06-16):**
- Model: **5 free stories, then $7.99 one-time unlock** for unlimited.
- Why one-time not subscription: road-trip use is bursty; pay-once-own-forever converts better and fits how people travel.
- Unlock mechanism: **LemonSqueezy license key**. Buyer pastes their key into RoadLore once; our server validates it with LemonSqueezy before unlocking. Key works on any device (no login needed). The free counter is client-side and bypassable on purpose — abuse only costs pennies; the paid gate is what's solid.
- Costs confirmed: ~½¢ Claude + ~1.5¢ Gemini voice = ~2¢ per new story. Audio is cached on-device so replays are free. Margin on $7.99 ≈ 75–90%.
- LemonSqueezy fee: 5% + 50¢ per sale (this is why cheap/tip pricing was ruled out).
- API keys are account-level (one key covers all stores, valid 1 year) — no store-specific key needed.

**Blocked on DJ (do these to unblock the build):**
- [ ] In LemonSqueezy dashboard: create a **$7.99 one-time product**, tick "this product has license keys," publish it. (Claude will guide click-by-click.)
- [ ] Generate one LemonSqueezy **API key** (live mode) and hand it to Claude → goes into `.env.local` as `LEMONSQUEEZY_API_KEY` (never committed).
- [ ] Note the **store ID** and **product/variant ID** (Claude can read these via the API once the key exists).

**Claude builds (once key + product exist):**
- [ ] Client-side free-story counter (allow 5, stored in localStorage) + paywall screen when exhausted.
- [ ] "Unlock unlimited — $7.99" buy button → opens the LemonSqueezy checkout.
- [ ] "Paste your license key" input + server route that validates the key with LemonSqueezy (activate on first use).
- [ ] Server gate on `/api/story`: unlimited only for requests carrying a valid, activated license key.
- [ ] Persist unlocked state (store validated key in localStorage; re-check on load).
- [ ] Honest error states (invalid key, already-activated-elsewhere if we cap devices, network fail).
- [ ] Test full flow: hit the 5-free wall → buy → paste key → unlimited works → survives refresh.

## Later — The Bigger Vision (do NOT build yet)

- [x] Save stories to **Supabase** (table `saved_stories`, per-device): ♥ Save button + /saved page (play/delete)
- [ ] Add a simple login so each user's saved list is truly private (today it's per-device via a stored id; only the `saved_stories` table is used)
- [x] "Tell Me More About Here" button — another story about the SAME spot (locks coords, fresh angle, skips already-used Wikipedia topics) even after the user has driven past
- [x] Story modes / genre picker ("Pick a vibe": Surprise / History / Weird & Funny / Spooky / Famous People / Before the Town) — sticky choice sent to the story route as `mode`
- [x] "Explore nearby" picker — distance dropdown (0.5/1/5/10/25 mi) + real named neighborhoods & cities from OpenStreetMap; tap one to hear its story (new /api/nearby route)
- [x] FIX: make neighborhood + vibe picks actually change the story — research now sorts articles NEAREST-first (was shuffling a 10km blob, so every pin got the same regional mush); chosen neighborhood name overrides the label; POIs filtered to within 1.2km
- [x] FIX: rewrote narrator personality to kill AI-speak (banned "nestled/bustling/hidden gem" etc., hook-first openers, "go deep on ONE thread" so vibes genuinely diverge instead of same facts reworded)
- [ ] Drive-safety mode (audio-first when moving)
- [ ] Optional: swap writer to Gemini free tier for $0 running cost
- [ ] Optional: paste-a-Google-Maps-link fallback when GPS is blocked
