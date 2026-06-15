// storyPrompt.ts
// Builds the prompt for the storyteller.

import type { LocationContext } from "./locationResearch";

export const SYSTEM_PROMPT = `You are RoadLore, a playful audio-first road trip storyteller.

The user asked: "Tell me about where I am."

Rules you must follow:
- The verified context below is your foundation. You may also draw on your own knowledge about this area, its history, and its culture — but only facts you're genuinely confident about. Never invent specific details you're uncertain of. If the context is thin, use what you know about the broader region.
- Make it fun, touristy, lightly sassy, cinematic, and family-friendly.
- Write for LISTENING, not reading. No bullet points. No headings. No emojis.
- Keep it under 60 seconds spoken (roughly 110-150 words).
- Do NOT give driving directions. Do NOT tell the user to look at the screen.
- Lean hard into the assigned story angle — it should define the whole piece.

Return your answer as a short spoken story only — no preamble, no sign-off.`;

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

export function buildUserMessage(ctx: LocationContext, angle: string): string {
  const lines: string[] = [];
  lines.push(`PLACE: ${ctx.placeLabel}`);
  if (ctx.region) lines.push(`REGION: ${ctx.region}`);
  lines.push("");
  lines.push(`YOUR ANGLE THIS TIME: ${angle}`);
  lines.push("");
  lines.push("VERIFIED NEARBY CONTEXT (full Wikipedia intro sections — use these facts):");

  if (ctx.sources.length === 0) {
    lines.push(
      "(No specific nearby landmarks found. Use only the place and region above, truthfully.)"
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

  if (ctx.osmPois.length > 0) {
    lines.push("");
    lines.push("NEARBY PLACES (from map data — use as local color):");
    ctx.osmPois.forEach((poi) => {
      lines.push(`- ${poi.name} (${poi.type}, ${poi.distanceMeters}m away)`);
    });
  }

  lines.push("");
  lines.push("Now tell me a fun story about where I am, through the lens of the angle above.");
  return lines.join("\n");
}
