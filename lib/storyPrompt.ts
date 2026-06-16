// storyPrompt.ts
// Builds the prompt for the storyteller.

import type { LocationContext } from "./locationResearch";

export const SYSTEM_PROMPT = `You're the person riding shotgun on a road trip — a sharp, funny local who knows the real story behind every town and tells it like gossip, not like a guidebook.

THE VOICE:
- Talk like a human, not a brochure. Short, punchy sentences. Contractions. The occasional dramatic pause.
- Open with a HOOK — one specific, surprising detail that grabs the ear. Drop the reader straight into the good part.
- Be specific or be quiet. Name the street, the year, the person, the building, the number. Specifics are the whole game. Vague is the enemy.
- Dry wit. A little sass. React to the weird stuff the way an actual person would.
- Family-friendly: nothing you wouldn't say with a 10-year-old in the back seat. No gore, no slurs.

HARD BANS — these instantly scream "a robot wrote this," never use them:
- The words: nestled, bustling, charming, hidden gem, boasts, steeped in history, rich tapestry, vibrant, stands as a testament, melting pot, treasure trove.
- The openers: "Nestled...", "Welcome to...", "Imagine...", "Picture this...", "Did you know...", or the place name followed by "is a city/town/neighborhood."
- The constructions: "whether you're a ___ or a ___", "from its ___ to its ___", three adjectives in a row, and tidy wrap-up endings like "So next time you're in town..."
- End on your best detail or a punchline, then STOP. No summary, no bow on top.

THE FACTS:
- The verified context provided is your source material. You may add things you're genuinely confident are true about this exact place. Never invent specifics — no made-up names, dates, or quotes.
- Talk about THIS specific place, by name. Anchor on the closest real landmarks given to you and name them. Don't drift into generic regional filler.

THE FORMAT:
- This is read ALOUD. No bullet points, no headings, no emojis, no stage directions.
- Under 60 seconds spoken — roughly 110-150 words.
- No driving directions. Don't mention the screen, the app, or "where you are."

Return only the spoken story — no preamble, no sign-off.`;

// Different lenses on the same place — ensures each tap feels genuinely different
const STORY_ANGLES = [
  "Lead with the weirdest, most surprising, or little-known fact about this area.",
  "Tell it like a ghost story — what haunts, lingers, or feels eerie about this place?",
  "Focus on the people: who lived, worked, or made history here, and what drove them?",
  "Go deep on the natural history of this land — what was here before the buildings?",
  "Focus on food, culture, and what daily life actually feels like on these streets.",
  "Tell the story of how this place was built — or almost wasn't.",
  "What's the most cinematic, movie-worthy thing about this spot? Lean into the drama.",
  "Focus on conflict and transformation — what battles, controversies, or changes shaped this place?",
  "Tell it from the perspective of someone arriving here for the very first time, 100 years ago.",
  "What has changed the most here in the last 50 years — and what has stubbornly stayed the same?",
  "Unpack the hidden geography — the water, the land, the reason anyone settled here at all.",
  "Focus on the famous and almost-famous: who passed through, who grew up here, who left their mark?",
];

export function pickStoryAngle(): string {
  return STORY_ANGLES[Math.floor(Math.random() * STORY_ANGLES.length)];
}

// User-pickable story vibes shown as buttons. "surprise" = random angle.
export interface StoryMode {
  key: string;
  label: string;
  emoji: string;
}

export const STORY_MODES: StoryMode[] = [
  { key: "surprise", label: "Surprise Me", emoji: "🎲" },
  { key: "history", label: "History", emoji: "🏛️" },
  { key: "weird", label: "Weird & Funny", emoji: "😄" },
  { key: "spooky", label: "Spooky", emoji: "🪦" },
  { key: "famous", label: "Famous People", emoji: "🎩" },
  { key: "nature", label: "Before the Town", emoji: "🌲" },
];

const MODE_ANGLES: Record<string, string> = {
  history:
    "Tell the story of how this place came to be — who built it, when, and why it grew the way it did.",
  weird:
    "Lead with the weirdest, most surprising, or little-known fact about this area.",
  spooky:
    "Tell it like a ghost story — what haunts, lingers, or feels eerie about this place?",
  famous:
    "Pick ONE or TWO of the real notable people listed in the source material and tell their story here — who they are, what they're known for, and the fact that this spot shaped them or hosted them. Use the verified NOTABLE PEOPLE list; do not invent residents.",
  nature:
    "Go deep on the natural history of this land — what was here before the buildings?",
};

// Resolve a user-picked mode into an angle. Unknown / "surprise" → random.
export function angleForMode(mode?: string): string {
  if (mode && MODE_ANGLES[mode]) return MODE_ANGLES[mode];
  return pickStoryAngle();
}

export function buildUserMessage(ctx: LocationContext, angle: string): string {
  const lines: string[] = [];
  lines.push(`THE PLACE: ${ctx.placeLabel}`);
  if (ctx.region) lines.push(`REGION: ${ctx.region}`);
  lines.push("");
  lines.push(`YOUR ANGLE THIS TIME: ${angle}`);
  lines.push("");
  lines.push(
    "DON'T SURVEY EVERYTHING. Pick the ONE thread from the material below that best fits your angle, " +
      "and go deep on it. A great 130-word story about a single weird detail beats a tour of five landmarks. " +
      "Leave the rest out."
  );
  lines.push("");
  lines.push("VERIFIED SOURCE MATERIAL (closest landmarks first — these are your facts):");

  if (ctx.sources.length === 0) {
    lines.push(
      `(No specific nearby landmarks found. Tell a true story about ${ctx.placeLabel} itself — its name, its setting — and don't invent specifics.)`
    );
  } else {
    ctx.sources.forEach((s) => {
      const dist =
        s.distanceMeters < 1000
          ? `${s.distanceMeters} m away`
          : `${(s.distanceMeters / 1000).toFixed(1)} km away`;
      lines.push(`\n--- ${s.title} (${dist}) ---`);
      lines.push(s.summary);
    });
  }

  if (ctx.notables.length > 0) {
    lines.push("");
    lines.push("VERIFIED NOTABLE PEOPLE CONNECTED TO THIS AREA (real, from Wikipedia — safe to name):");
    ctx.notables.forEach((p) => lines.push(`- ${p}`));
  }

  if (ctx.osmPois.length > 0) {
    lines.push("");
    lines.push("OTHER NAMED SPOTS NEARBY (real map data — drop one or two in by name for texture):");
    ctx.osmPois.slice(0, 12).forEach((poi) => {
      lines.push(`- ${poi.name} (${poi.type}, ${poi.distanceMeters}m away)`);
    });
  }

  lines.push("");
  lines.push(
    `Now tell me the story of ${ctx.placeLabel}, through your angle. Name the place. ` +
      "Lead with the hook. Be specific. No robot words."
  );
  return lines.join("\n");
}
