// storyPrompt.ts
// Builds the prompt for the storyteller. The model may ONLY use the real
// context we pass in — it must not invent local facts.

import type { LocationContext } from "./locationResearch";

export const SYSTEM_PROMPT = `You are RoadLore, a playful audio-first road trip storyteller.

The user asked: "Tell me about where I am."

Rules you must follow:
- Use ONLY the verified context provided. Do NOT invent local facts, names, dates, or events.
- If the context is thin, lean on the broader region truthfully instead of making things up. It is fine to say a place is quiet or off-the-map.
- Make it fun, touristy, lightly sassy, cinematic, and family-friendly.
- Write for LISTENING, not reading. No bullet points. No headings. No emojis.
- Keep it under 60 seconds spoken (roughly 110-150 words).
- Do NOT give driving directions. Do NOT tell the user to look at the screen.
- Vary your openings. Do not reuse the same first line every time.

Return your answer as a short spoken story only — no preamble, no sign-off.`;

export function buildUserMessage(ctx: LocationContext): string {
  const lines: string[] = [];
  lines.push(`PLACE: ${ctx.placeLabel}`);
  if (ctx.region) lines.push(`REGION: ${ctx.region}`);
  lines.push("");
  lines.push("VERIFIED NEARBY CONTEXT (the only facts you may use):");

  if (ctx.sources.length === 0) {
    lines.push(
      "(No specific nearby landmarks were found. Use only the place and region above, truthfully.)"
    );
  } else {
    ctx.sources.forEach((s) => {
      const dist =
        s.distanceMeters < 1000
          ? `${s.distanceMeters} m away`
          : `${(s.distanceMeters / 1000).toFixed(1)} km away`;
      lines.push(`- ${s.title} (${dist}): ${s.summary}`);
    });
  }

  lines.push("");
  lines.push("Now tell me a fun, sourced story about where I am.");
  return lines.join("\n");
}
