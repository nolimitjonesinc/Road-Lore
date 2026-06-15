import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Turns the story text into a real narrated voice using Gemini TTS — the same
// free-tier voice engine Loomiverse uses. Gemini returns raw PCM audio, so we
// wrap it in a WAV header before sending it to the browser. The key stays
// server-side.
//
// If no key is configured, we return 503 so the browser quietly falls back to
// its built-in voice — the app keeps working, just less cinematic.

const MODEL = "gemini-2.5-flash-preview-tts";
const VOICE = "Puck"; // upbeat, playful — fits the sassy tour-guide tone

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

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "voice-not-configured" }, { status: 503 });
  }

  let text = "";
  try {
    const body = await req.json();
    text = String(body.text || "").trim();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "Nothing to read." }, { status: 400 });
  }
  if (text.length > 5000) text = text.slice(0, 5000);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: VOICE },
            },
          },
        },
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "voice-failed" }, { status: 502 });
    }

    const data = await res.json();
    const b64 =
      data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!b64) {
      return NextResponse.json({ error: "voice-failed" }, { status: 502 });
    }

    const pcm = Buffer.from(b64, "base64");
    const wav = Buffer.concat([buildWavHeader(pcm.length), pcm]);

    return new NextResponse(wav, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "voice-failed" }, { status: 502 });
  }
}
