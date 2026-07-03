import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { researchLocation } from "@/lib/locationResearch";
import { SYSTEM_PROMPT, buildUserMessage, angleForMode } from "@/lib/storyPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUDIO_BUCKET = "road-lore-audio";

// Every generated story is auto-saved to a shared pool, keyed by the
// landmark it's about + the chosen vibe, so the next person near the same
// spot hears a cached narration instead of triggering a fresh Claude +
// Gemini call. A per-device "heard" table keeps the same phone from getting
// the same story (or the same landmark) twice.
//
// This uses the service-role key (server-only, never NEXT_PUBLIC_*) instead
// of the public anon key, so writes to the shared pool can only ever happen
// from this server route — the public key that ships to browsers has no
// insert access to these tables.
function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceKey ? createClient(url, serviceKey) : null;
}

// Guards against a corrupted/malicious pool row: sources are rendered as
// <a href> links and audioUrl is loaded as an <audio> src, so anything read
// back out of the shared pool gets revalidated before reaching the client.
function safeSources(sources: unknown): { title: string; url: string; distanceMeters: number }[] {
  if (!Array.isArray(sources)) return [];
  return sources.filter((s): s is { title: string; url: string; distanceMeters: number } => {
    if (!s || typeof s !== "object") return false;
    const url = (s as { url?: unknown }).url;
    if (typeof url !== "string") return false;
    try {
      return new URL(url).protocol === "https:";
    } catch {
      return false;
    }
  });
}

function safeAudioUrl(url: unknown): string | undefined {
  if (typeof url !== "string" || !url) return undefined;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return undefined;
  const prefix = `${supabaseUrl}/storage/v1/object/public/${AUDIO_BUCKET}/`;
  return url.startsWith(prefix) ? url : undefined;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RoadLore isn't set up yet — the storyteller key is missing. (Add ANTHROPIC_API_KEY.)" },
      { status: 500 }
    );
  }

  let lat: number, lon: number, usedArticles: string[], mode: string | undefined, placeName: string | undefined, lookAhead: boolean, deviceId: string | undefined;
  try {
    const body = await req.json();
    lat = Number(body.latitude);
    lon = Number(body.longitude);
    usedArticles = Array.isArray(body.usedArticles) ? body.usedArticles.map(String) : [];
    mode = typeof body.mode === "string" ? body.mode : undefined;
    placeName = typeof body.placeName === "string" && body.placeName.trim() ? body.placeName.trim() : undefined;
    lookAhead = body.lookAhead === true;
    deviceId = typeof body.deviceId === "string" && body.deviceId.trim() ? body.deviceId.trim() : undefined;
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
    ctx = await researchLocation(lat, lon, usedArticles, placeName);
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

  const modeKey = mode && mode.trim() ? mode.trim() : "surprise";
  const landmarkKey = (ctx.sources[0]?.title || ctx.placeLabel).trim().toLowerCase();
  const sb = supabaseServer();

  // 1) Try the shared pool first — a cached story this device hasn't heard yet.
  if (sb && deviceId) {
    try {
      const { data: heardRows } = await sb
        .from("roadlore_story_heard")
        .select("story_id")
        .eq("device_id", deviceId);
      const heardIds = new Set((heardRows || []).map((r) => r.story_id));

      const { data: candidates } = await sb
        .from("roadlore_shared_stories")
        .select("*")
        .eq("landmark_key", landmarkKey)
        .eq("mode", modeKey)
        .order("created_at", { ascending: false })
        .limit(20);

      const pick = (candidates || []).find((c) => !heardIds.has(c.id));
      if (pick) {
        await sb.from("roadlore_story_heard").insert({ device_id: deviceId, story_id: pick.id });
        return NextResponse.json({
          title: `Where the road dropped you: ${pick.place_label}`,
          placeLabel: pick.place_label,
          spokenScript: pick.spoken_script,
          confidence: pick.confidence,
          sources: safeSources(pick.sources),
          audioUrl: safeAudioUrl(pick.audio_url),
          // If this cached row never got its narration uploaded, the client's
          // /api/voice call can heal it using this id.
          storyId: pick.id,
        });
      }
    } catch {
      // Pool lookup failed — fall through and generate fresh.
    }
  }

  // 2) Nothing cached for this device — generate a fresh story.
  const angle = angleForMode(mode);

  const anthropic = new Anthropic({ apiKey });
  let spokenScript = "";
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(ctx, angle, lookAhead) }],
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
  const sources = ctx.sources.map((s) => ({
    title: s.title,
    url: s.url,
    distanceMeters: s.distanceMeters,
  }));

  // 3) Save the script to the shared pool right away — WITHOUT audio — and
  // return the story text immediately. Narration used to be generated and
  // uploaded here, which made every fresh story feel frozen for ~30s; now
  // the client shows the text at once and its follow-up /api/voice call
  // (carrying this storyId) synthesizes the audio and uploads it into this
  // row, so the next device near this landmark still gets it free.
  let storyId: string | undefined;
  if (sb) {
    try {
      const id = randomUUID();
      const { error: insertErr } = await sb.from("roadlore_shared_stories").insert({
        id,
        landmark_key: landmarkKey,
        place_label: ctx.placeLabel,
        mode: modeKey,
        spoken_script: spokenScript,
        confidence,
        sources,
        audio_url: null,
      });

      if (!insertErr) {
        storyId = id;
        if (deviceId) {
          await sb.from("roadlore_story_heard").insert({ device_id: deviceId, story_id: id });
        }
      }
    } catch {
      // Shared-pool save is best-effort — never block the story response on it.
    }
  }

  return NextResponse.json({
    title: `Where the road dropped you: ${ctx.placeLabel}`,
    placeLabel: ctx.placeLabel,
    spokenScript,
    confidence,
    sources,
    storyId,
  });
}
