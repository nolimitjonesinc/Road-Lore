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

## Later — The Bigger Vision (do NOT build yet)

- [x] Save stories — on-device (localStorage): ♥ Save button + /saved page (play/delete)
- [ ] Cloud-sync saved stories to Supabase (ftcdqmrjjooluihysuyc) — needs a simple login first so the list stays private
- [ ] Story modes (History / Weird Facts / Family / Prairie Drama)
- [ ] Drive-safety mode (audio-first when moving)
- [ ] Optional: swap writer to Gemini free tier for $0 running cost
- [ ] Optional: paste-a-Google-Maps-link fallback when GPS is blocked
