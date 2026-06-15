"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Scene from "./scene";
import { useSpeech } from "@/hooks/useSpeech";
import { useSavedStories } from "@/hooks/useSavedStories";

interface Source {
  title: string;
  url: string;
  distanceMeters: number;
}
interface Story {
  title: string;
  placeLabel: string;
  spokenScript: string;
  confidence: string;
  sources: Source[];
}

type Phase = "intro" | "idle" | "loading" | "done" | "denied";

const LOADING_LINES = [
  "Finding your spot on the planet…",
  "Checking what's nearby…",
  "Turning the map into story time…",
];

const VOICE_LOADING_LINES = [
  "Warming up the mic…",
  "Our narrator is clearing their throat…",
  "Briefing the voice actor on your street…",
  "Teaching someone to say your neighborhood…",
  "Finding the perfect dramatic pause…",
  "The narrator just spilled coffee, one sec…",
  "Tuning the storyteller…",
  "Getting the local accent just right…",
  "Your road trip guide is almost ready…",
  "Cuing the opening line…",
];

const LOC_KEY = "rl_loc_granted";
const USED_KEY = "rl_used_articles";

function getUsedArticles(): string[] {
  try { return JSON.parse(localStorage.getItem(USED_KEY) || "[]"); } catch { return []; }
}
function saveUsedArticles(titles: string[]) {
  try {
    const existing = getUsedArticles();
    const merged = Array.from(new Set(existing.concat(titles)));
    // Cap at 100 so it never grows unbounded
    localStorage.setItem(USED_KEY, JSON.stringify(merged.slice(-100)));
  } catch { /* ignore */ }
}

export default function Home() {
  const { supported, speaking, audioLoading, speak, stop, repeat } = useSpeech();
  const { save } = useSavedStories();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState<Phase>("intro");
  const [loadingLine, setLoadingLine] = useState(LOADING_LINES[0]);
  const [story, setStory] = useState<Story | null>(null);
  const [error, setError] = useState<string>("");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [voiceLineIndex, setVoiceLineIndex] = useState(0);

  useEffect(() => {
    if (!audioLoading) return;
    setVoiceLineIndex(0);
    const id = setInterval(() => {
      setVoiceLineIndex((i) => (i + 1) % VOICE_LOADING_LINES.length);
    }, 2000);
    return () => clearInterval(id);
  }, [audioLoading]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      // If the user has successfully loaded a story before, skip the intro.
      try {
        if (localStorage.getItem(LOC_KEY) === "1") {
          if (!cancelled) setPhase("idle");
          return;
        }
      } catch { /* localStorage unavailable */ }

      try {
        // @ts-ignore - permissions may be undefined on some browsers
        const status = await navigator.permissions?.query({
          name: "geolocation" as PermissionName,
        });
        if (cancelled || !status) return;
        if (status.state === "granted") setPhase("idle");
        else if (status.state === "denied") setPhase("denied");
        else setPhase("intro");
      } catch {
        /* keep intro */
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  function go() {
    setError("");
    setStory(null);
    stop();

    if (!("geolocation" in navigator)) {
      setError("This device can't share its location. Try another browser.");
      return;
    }

    setPhase("loading");
    setLoadingLine(LOADING_LINES[0]);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          setLoadingLine(LOADING_LINES[1]);
          const res = await fetch("/api/story", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              usedArticles: getUsedArticles(),
            }),
          });
          setLoadingLine(LOADING_LINES[2]);
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || "Something went sideways. Try again.");
            setPhase("idle");
            return;
          }
          // Remember that location was granted so we skip the intro next time.
          try { localStorage.setItem(LOC_KEY, "1"); } catch { /* ignore */ }
          // Track which articles were used so next tap gets different topics.
          if (data.sources?.length) saveUsedArticles(data.sources.map((s: {title: string}) => s.title));
          setStory(data);
          setSaved(false);
          setSaving(true);
          setSourcesOpen(false);
          setPhase("done");
          // Narrate immediately — speak() must fire before any await so it
          // stays within the browser's user-gesture window and autoplay works.
          speak(data.spokenScript);
          // Save in the background; don't block narration on it.
          save({
            placeLabel: data.placeLabel,
            spokenScript: data.spokenScript,
            confidence: data.confidence,
            sources: data.sources,
          }).then((savedStory) => {
            setSaving(false);
            setSaved(!!savedStory);
          }).catch(() => setSaving(false));
        } catch {
          setError("Something went sideways. Try again.");
          setPhase("idle");
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPhase("denied");
        } else {
          setError("Couldn't find your location. Try again.");
          setPhase("idle");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  return (
    <>
      <Scene />
      <main className="relative z-10 min-h-[100dvh] flex flex-col items-center justify-center px-6 py-12 text-center">
        {/* Brand */}
        <p
          className="kicker text-[11px] text-[var(--gold)]/80 mb-4 rise"
          style={{ animationDelay: "0.05s" }}
        >
          Audio Road Trips
        </p>
        <h1
          className="wordmark text-6xl sm:text-7xl font-extrabold mb-3 rise"
          style={{ animationDelay: "0.15s" }}
        >
          RoadLore
        </h1>
        <p
          className="text-lg text-[var(--muted)] mb-12 max-w-sm rise"
          style={{ animationDelay: "0.28s" }}
        >
          Story time for wherever the road takes you.
        </p>

        {/* Intro / permission ask */}
        {phase === "intro" && (
          <div
            className="glass w-full max-w-sm rounded-[28px] p-8 rise"
            style={{ animationDelay: "0.4s" }}
          >
            <div className="text-5xl mb-4">📍</div>
            <h2 className="text-2xl font-bold mb-2 font-[family-name:var(--font-display)]">
              Where are you?
            </h2>
            <p className="text-[var(--muted)] mb-8 leading-relaxed">
              RoadLore reads you a quick story about where you are right now.
              Tap below and your phone will ask to share your location — just
              tap{" "}
              <span className="font-semibold text-[var(--cream)]">Allow</span>.
            </p>
            <div className="ping-wrap">
              <span className="ping" />
              <span className="ping b" />
              <button
                onClick={go}
                className="cta relative z-10 w-full text-xl font-extrabold py-5"
              >
                Turn On Location
              </button>
            </div>
            <button
              onClick={() => setPhase("idle")}
              className="mt-4 text-[var(--muted)] text-sm hover:text-[var(--cream)] transition"
            >
              Maybe later
            </button>
          </div>
        )}

        {/* Main button */}
        {phase === "idle" && (
          <div
            className="ping-wrap w-full max-w-sm rise"
            style={{ animationDelay: "0.4s" }}
          >
            <span className="ping" />
            <span className="ping b" />
            <button
              onClick={go}
              className="cta relative z-10 w-full text-2xl sm:text-3xl font-extrabold py-8 px-6"
            >
              Give Me the Lore
            </button>
            {error && (
              <p className="mt-6 text-base text-rose-300">{error}</p>
            )}
          </div>
        )}

        {/* Loading */}
        {phase === "loading" && (
          <div className="w-full max-w-sm">
            <div className="cta w-full text-xl font-extrabold py-8 px-6 opacity-95">
              {loadingLine}
            </div>
            <div className="mt-6 flex justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-[var(--gold)]"
                  style={{
                    animation: "twinkle 1s ease-in-out infinite",
                    animationDelay: `${i * 0.18}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Location off — help */}
        {phase === "denied" && (
          <div className="glass w-full max-w-sm rounded-[28px] p-8 text-left rise">
            <div className="text-5xl mb-3 text-center">🔒</div>
            <h2 className="text-2xl font-bold mb-3 text-center font-[family-name:var(--font-display)]">
              Location&apos;s switched off
            </h2>
            <p className="text-[var(--muted)] mb-4 leading-relaxed">
              Your phone is blocking RoadLore from seeing where you are. Quick
              fix on iPhone:
            </p>
            <ol className="text-[var(--muted)] text-sm space-y-2 mb-7 list-decimal list-inside leading-relaxed">
              <li>
                Tap the{" "}
                <span className="font-semibold text-[var(--cream)]">aA</span> on
                the left of Safari&apos;s address bar.
              </li>
              <li>
                Tap{" "}
                <span className="font-semibold text-[var(--cream)]">
                  Website Settings
                </span>
                .
              </li>
              <li>
                Set{" "}
                <span className="font-semibold text-[var(--cream)]">
                  Location
                </span>{" "}
                to{" "}
                <span className="font-semibold text-[var(--cream)]">Allow</span>
                , then come back.
              </li>
            </ol>
            <button
              onClick={go}
              className="cta w-full text-xl font-extrabold py-5"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Result */}
        {phase === "done" && story && (
          <div className="w-full max-w-md rise">
            {/* Play button first — visible without scrolling */}
            <div className="flex flex-col gap-3 mb-6">
              <button
                onClick={speaking ? stop : repeat}
                disabled={audioLoading}
                className="cta w-full text-xl font-extrabold py-5 disabled:cursor-default"
              >
                {audioLoading ? (
                  <span className="flex items-center justify-center gap-3">
                    <span className="inline-flex gap-[3px] items-end h-5">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className="w-1 bg-current rounded-full"
                          style={{
                            height: "100%",
                            animation: "twinkle 0.6s ease-in-out infinite",
                            animationDelay: `${i * 0.1}s`,
                          }}
                        />
                      ))}
                    </span>
                    {VOICE_LOADING_LINES[voiceLineIndex]}
                    <span className="inline-flex gap-[3px] items-end h-5">
                      {[4, 3, 2, 1, 0].map((i) => (
                        <span
                          key={i}
                          className="w-1 bg-current rounded-full"
                          style={{
                            height: "100%",
                            animation: "twinkle 0.6s ease-in-out infinite",
                            animationDelay: `${i * 0.1}s`,
                          }}
                        />
                      ))}
                    </span>
                  </span>
                ) : speaking ? "⏸  Stop" : "▶  Play Story"}
              </button>
            </div>

            <div className="glass rounded-[28px] p-7 text-left mb-6">
              <p className="kicker text-[10px] text-[var(--gold)]/80 mb-2">
                You are here
              </p>
              <h2 className="text-2xl font-bold mb-3 font-[family-name:var(--font-display)] leading-tight">
                {story.placeLabel}
              </h2>
              {story.confidence === "low" && (
                <p className="text-sm text-[var(--muted)] mb-3">
                  Quiet corner of the map — here&apos;s the broader story.
                </p>
              )}
              <p className="text-[17px] leading-relaxed text-[var(--cream)]">
                {story.spokenScript}
              </p>
              {speaking && (
                <p className="mt-4 text-sm text-[var(--gold)] flex items-center gap-2">
                  <span className="inline-flex gap-0.5 items-end h-4">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="w-1 bg-[var(--gold)] rounded-full"
                        style={{
                          height: "100%",
                          animation: "twinkle 0.7s ease-in-out infinite",
                          animationDelay: `${i * 0.12}s`,
                        }}
                      />
                    ))}
                  </span>
                  Reading aloud…
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="glass w-full rounded-2xl py-4 text-base font-bold flex items-center justify-center text-center select-none"
                  aria-live="polite"
                >
                  {saving ? (
                    "Saving…"
                  ) : saved ? (
                    <span className="text-[var(--gold)]">♥  Saved</span>
                  ) : (
                    <span className="text-[var(--muted)]">♡  Not saved</span>
                  )}
                </div>
                <button
                  onClick={go}
                  className="glass w-full rounded-2xl py-4 text-base font-bold hover:border-[var(--gold)]/40 transition"
                >
                  ↺  New Story
                </button>
              </div>
            </div>

            {/* Sources — collapsed by default */}
            {story.sources.length > 0 && (
              <div className="text-left px-1 mb-4">
                <button
                  onClick={() => setSourcesOpen((o) => !o)}
                  className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--cream)] transition text-sm"
                >
                  <span
                    className="text-[10px] transition-transform duration-200"
                    style={{ display: "inline-block", transform: sourcesOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                  >
                    ▶
                  </span>
                  <span className="kicker text-[10px]">
                    Real sources ({story.sources.length})
                  </span>
                </button>
                {sourcesOpen && (
                  <ul className="flex flex-wrap gap-2 mt-3">
                    {story.sources.map((s) => (
                      <li key={s.url}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-sm text-[var(--cream)] bg-white/5 border border-white/10 rounded-full px-3 py-1 hover:border-[var(--gold)]/40 transition"
                        >
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!supported && (
              <p className="mt-6 text-sm text-[var(--muted)]">
                (Your browser can&apos;t read aloud, but the story&apos;s
                above.)
              </p>
            )}
          </div>
        )}

        <div
          className="mt-12 flex flex-col items-center gap-3 rise"
          style={{ animationDelay: "0.6s" }}
        >
          <Link
            href="/saved"
            className="text-sm font-semibold text-[var(--gold)]/90 hover:text-[var(--gold)] transition"
          >
            ♥ Saved stories
          </Link>
          <p className="text-xs text-[var(--muted)]/60">
            Real places · real history · no made-up facts
          </p>
        </div>
      </main>
    </>
  );
}
