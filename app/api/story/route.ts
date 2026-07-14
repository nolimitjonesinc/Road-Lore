import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { researchLocation } from "@/lib/locationResearch";
import { SYSTEM_PROMPT, buildUserMessage, angleForMode } from "@/lib/storyPrompt";
import { SUPABASE_URL } from "@/lib/supabaseConfig";

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
  const url = SUPABASE_URL;
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

// The writer ends its output with a "USED: title | title" line naming which
// source articles it actually drew from. Strip that line from the spoken
// script and match the named titles back to the researched sources, so the
// links shown to the user are only the ones the story is really based on.
// If the marker is missing or matches nothing, fall back to all sources.
function extractUsedSources<T extends { title: string }>(
  raw: string,
  sources: T[]
): { script: string; usedSources: T[] } {
  const match = raw.match(/\n\s*USED:\s*([^\n]+)\s*$/i);
  if (!match || match.index === undefined) return { script: raw.trim(), usedSources: sources };
  const script = raw.slice(0, match.index).trim();
  const markerText = match[1].toLowerCase();
  const used = sources.filter((s) => markerText.includes(s.title.trim().toLowerCase()));
  if (!script) return { script: raw.trim(), usedSources: sources };
  return { script, usedSources: used.length > 0 ? used : sources };
}

function safeAudioUrl(url: unknown): string | undefined {
  if (typeof url !== "string" || !url) return undefined;
  const supabaseUrl = SUPABASE_URL;
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

  let lat: number, lon: number, usedArticles: string[], recentStories: string[], mode: string | undefined, placeName: string | undefined, lookAhead: boolean, deviceId: string | undefined;
  try {
    const body = await req.json();
    lat = Number(body.latitude);
    lon = Number(body.longitude);
    usedArticles = Array.isArray(body.usedArticles) ? body.usedArticles.map(String) : [];
    // Recent stories this device heard — capped hard so a hostile client
    // can't stuff the prompt.
    recentStories = Array.isArray(body.recentStories)
      ? body.recentStories.slice(0, 5).map((s: unknown) => String(s).slice(0, 1200))
      : [];
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

  // Look up what this device has already heard BEFORE researching, so both the
  // cached-pool pick AND fresh generation skip whole TOPICS it's been told
  // about — not just the exact story rows.
  const sb = supabaseServer();
  let heardIds = new Set<string>();
  let heardLandmarkKeys = new Set<string>();
  if (sb && deviceId) {
    try {
      const { data: heardRows } = await sb
        .from("roadlore_story_heard")
        .select("story_id")
        .eq("device_id", deviceId);
      heardIds = new Set((heardRows || []).map((r) => String(r.story_id)));
      if (heardIds.size) {
        const { data: heardStories } = await sb
          .from("roadlore_shared_stories")
          .select("landmark_key")
          .in("id", Array.from(heardIds));
        heardLandmarkKeys = new Set(
          (heardStories || []).map((r) => String(r.landmark_key).toLowerCase())
        );
      }
    } catch {
      // Best-effort — if this fails we still have story-level dedupe below.
    }
  }

  let ctx;
  try {
    // Merge heard topics into the "used" list so research digs past them.
    ctx = await researchLocation(lat, lon, [...usedArticles, ...Array.from(heardLandmarkKeys)], placeName);
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
  // Pool rows are keyed by the article the story is actually ABOUT (see the
  // USED-line handling below), so the lookup checks every candidate landmark
  // near the pin — any of them may already have a cached story.
  const candidateKeys = [
    ...ctx.sources.map((s) => s.title.trim().toLowerCase()),
    ctx.placeLabel.trim().toLowerCase(),
  ];
  // 1) Try the shared pool first — a cached story about a topic this device
  //    hasn't heard yet. Both the exact story AND its landmark must be new, so
  //    a second take on the same subject never comes back.
  if (sb && deviceId) {
    try {
      const { data: candidates } = await sb
        .from("roadlore_shared_stories")
        .select("*")
        .in("landmark_key", candidateKeys)
        .eq("mode", modeKey)
        .order("created_at", { ascending: false })
        .limit(20);

      const pick = (candidates || []).find(
        (c) => !heardIds.has(c.id) && !heardLandmarkKeys.has(String(c.landmark_key).toLowerCase())
      );
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
      messages: [{ role: "user", content: buildUserMessage(ctx, angle, lookAhead, recentStories) }],
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

  // Keep only the sources the writer says it actually used. The unused ones
  // are never shown or marked as "heard" on the device, so they stay available
  // as fresh material for the next tap.
  const extracted = extractUsedSources(spokenScript, ctx.sources);
  spokenScript = extracted.script;

  const confidence = ctx.sources.length >= 3 ? "high" : ctx.sources.length >= 1 ? "medium" : "low";
  const sources = extracted.usedSources.map((s) => ({
    title: s.title,
    url: s.url,
    distanceMeters: s.distanceMeters,
  }));

  // Key the pool row by the article the story is actually about, so the next
  // device nearby matches it to the right landmark.
  const landmarkKey = (extracted.usedSources[0]?.title || ctx.sources[0]?.title || ctx.placeLabel)
    .trim()
    .toLowerCase();

  // 3) Save the script to the shared pool right away — WITHOUT audio — and
  // return the story text immediately. Narration used to be generated and
  // uploaded here, which made every fresh story feel frozen for ~30s; now
  // the client shows the text at once and its follow-up /api/voice call
  // (carrying this storyId) synthesizes the audio and uploads it into this
  // row, so the next device near this landmark still gets it free.
  let storyId: string | undefined;
  if (sb) {
    try {
      // Cap the pool at 5 stories per landmark+vibe. Under the cap, distinct
      // takes are healthy variety for future listeners; past it, extra rows
      // are just clutter. The requester still gets their fresh story either
      // way — it just isn't hoarded.
      const { count } = await sb
        .from("roadlore_shared_stories")
        .select("id", { count: "exact", head: true })
        .eq("landmark_key", landmarkKey)
        .eq("mode", modeKey);
      if ((count ?? 0) >= 5) {
        return NextResponse.json({
          title: `Where the road dropped you: ${ctx.placeLabel}`,
          placeLabel: ctx.placeLabel,
          spokenScript,
          confidence,
          sources,
        });
      }

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
