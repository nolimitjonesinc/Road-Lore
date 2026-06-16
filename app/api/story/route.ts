import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { researchLocation } from "@/lib/locationResearch";
import { SYSTEM_PROMPT, buildUserMessage, angleForMode } from "@/lib/storyPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RoadLore isn't set up yet — the storyteller key is missing. (Add ANTHROPIC_API_KEY.)" },
      { status: 500 }
    );
  }

  let lat: number, lon: number, usedArticles: string[], mode: string | undefined;
  try {
    const body = await req.json();
    lat = Number(body.latitude);
    lon = Number(body.longitude);
    usedArticles = Array.isArray(body.usedArticles) ? body.usedArticles.map(String) : [];
    mode = typeof body.mode === "string" ? body.mode : undefined;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (
    !Number.isFinite(lat) || !Number.isFinite(lon) ||
    lat < -90 || lat > 90 || lon < -180 || lon > 180
  ) {
    return NextResponse.json({ error: "Those coordinates don't look right. Try again." }, { status: 400 });
  }

  let ctx;
  try {
    ctx = await researchLocation(lat, lon, usedArticles);
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach the map services just now. Give it another tap in a sec." },
      { status: 502 }
    );
  }

  if (!ctx.placeLabel) {
    return NextResponse.json(
      { error: "I found your location, but couldn't find enough reliable nearby info to tell a good story yet." },
      { status: 422 }
    );
  }

  const angle = angleForMode(mode);

  const anthropic = new Anthropic({ apiKey });
  let spokenScript = "";
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(ctx, angle) }],
    });
    spokenScript = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
  } catch {
    return NextResponse.json(
      { error: "The story machine tripped over a prairie dog. Try again." },
      { status: 502 }
    );
  }

  if (!spokenScript) {
    return NextResponse.json(
      { error: "The story machine tripped over a prairie dog. Try again." },
      { status: 502 }
    );
  }

  const confidence = ctx.sources.length >= 3 ? "high" : ctx.sources.length >= 1 ? "medium" : "low";

  return NextResponse.json({
    title: `Where the road dropped you: ${ctx.placeLabel}`,
    placeLabel: ctx.placeLabel,
    spokenScript,
    confidence,
    sources: ctx.sources.map((s) => ({
      title: s.title,
      url: s.url,
      distanceMeters: s.distanceMeters,
    })),
  });
}
