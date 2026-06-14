# RoadLore

> Story time for wherever the road takes you.

Tap one button. RoadLore grabs your location, looks up what's really nearby,
and reads you a short, sassy, tour-guide story about where you are. No maps,
no accounts, no fake facts.

## How it works (all real data, no paid search)

1. **Your phone's GPS** gives the coordinates (free, built in).
2. **OpenStreetMap** turns those coordinates into a real place name (free, no key).
3. **Wikipedia** lists real landmarks nearby and hands over their history (free, no key).
4. **Claude** writes the story using only those verified facts (a fraction of a penny per tap).
5. **Your browser's voice** reads it aloud (free).

If the real services can't name your spot, RoadLore says so — it never invents facts.

## Run it locally

1. Install dependencies:
   ```
   npm install
   ```
2. Add your key — copy `.env.local.example` to `.env.local` and paste your
   Anthropic key (get one at https://console.anthropic.com → API Keys):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Start it:
   ```
   npm run dev
   ```
4. Open http://localhost:3000 and tap the button. (Allow location when asked.)

## Required environment variable

| Variable            | What it's for                          |
| ------------------- | -------------------------------------- |
| `ANTHROPIC_API_KEY` | Lets the server ask Claude to write the story. Server-side only. **Required.** |
| `GEMINI_API_KEY`    | Narrates the story aloud with Gemini's voice (free tier). Optional — without it, the phone's built-in voice is used. |

## Deploy to Vercel

1. Push to GitHub (already wired to `nolimitjonesinc/Road-Lore`).
2. In Vercel, import the repo (or it auto-builds if already linked).
3. In Vercel → Project → Settings → Environment Variables, add
   `ANTHROPIC_API_KEY` with your key.
4. Deploy. Vercel gives you an HTTPS URL — required for location to work.

## Notes & limits (v1)

- One page, one button. No accounts, no database, no maps.
- Story writer is Claude Sonnet (cheap + fast). Swappable later.
- Voice is Gemini TTS (free tier), same engine Loomiverse uses; falls back to the browser voice if no key.
- Free map/Wikipedia services have polite rate limits; fine for normal use.
