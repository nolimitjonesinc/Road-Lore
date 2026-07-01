import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { researchLocation } from "@/lib/locationResearch";
import { SYSTEM_PROMPT, buildUserMessage, angleForMode } from "@/lib/storyPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUDIO_BUCKET = "road-lore-audio";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const TTS_VOICE = "Aoede";

// Every generated story is auto-saved to a shared pool, keyed by the
// landmark it's about + the chosen vibe, so the next person near the same
// spot hears a cached narration instead of triggering a fresh Claude +
// Gemini call. A per-device "heard" table keeps the same phone from getting
// the same story (or the same landmark) twice.
function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anon ? createClient(url, anon) : null;
}

function buildWavHeader(
  pcmByteLength: number,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16
) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const buf = Buffer.alloc(44);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + pcmByteLength, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(pcmByteLength, 40);
  return buf;
}

async function synthesizeAudio(text: string): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
        },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const b64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!b64) return null;
    const pcm = Buffer.from(b64, "base64");
    return Buffer.concat([buildWavHeader(pcm.length), pcm]);
  } catch {
    return null;
  }
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
          sources: pick.sources || [],
          audioUrl: pick.audio_url || undefined,
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

  // 3) Auto-save to the shared pool: narrate it once, store the audio, and
  // mark it heard for this device — so the next person near this landmark
  // (and this device's next "Tell Me More") gets it free and instant.
  let audioUrl: string | undefined;
  if (sb) {
    try {
      const { data: inserted, error: insertErr } = await sb
        .from("roadlore_shared_stories")
        .insert({
          landmark_key: landmarkKey,
          place_label: ctx.placeLabel,
          mode: modeKey,
          spoken_script: spokenScript,
          confidence,
          sources,
        })
        .select()
        .single();

      if (!insertErr && inserted) {
        const wav = await synthesizeAudio(spokenScript);
        if (wav) {
          const path = `shared/${inserted.id}.wav`;
          const { error: upErr } = await sb.storage
            .from(AUDIO_BUCKET)
            .upload(path, wav, { contentType: "audio/wav", upsert: true });
          if (!upErr) {
            const { data: pub } = sb.storage.from(AUDIO_BUCKET).getPublicUrl(path);
            if (pub?.publicUrl) {
              audioUrl = pub.publicUrl;
              await sb.from("roadlore_shared_stories").update({ audio_url: audioUrl }).eq("id", inserted.id);
            }
          }
        }
        if (deviceId) {
          await sb.from("roadlore_story_heard").insert({ device_id: deviceId, story_id: inserted.id });
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
    audioUrl,
  });
}
