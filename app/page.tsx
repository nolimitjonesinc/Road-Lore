"use client";

import { useState } from "react";
import { useSpeech } from "@/hooks/useSpeech";

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

const LOADING_LINES = [
  "Finding your spot on the planet…",
  "Checking what's nearby…",
  "Turning the map into story time…",
];

export default function Home() {
  const { supported, speaking, speak, stop, repeat } = useSpeech();
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [loadingLine, setLoadingLine] = useState(LOADING_LINES[0]);
  const [story, setStory] = useState<Story | null>(null);
  const [error, setError] = useState<string>("");

  async function go() {
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
            }),
          });
          setLoadingLine(LOADING_LINES[2]);
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || "Something went sideways. Try again.");
            setPhase("idle");
            return;
          }
          setStory(data);
          setPhase("done");
          speak(data.spokenScript);
        } catch {
          setError("Something went sideways. Try again.");
          setPhase("idle");
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError(
            "Location was blocked. Turn on location access and try again."
          );
        } else {
          setError("Couldn't find your location. Try again.");
        }
        setPhase("idle");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10 text-center">
      <h1 className="text-5xl font-black tracking-tight mb-2">RoadLore</h1>
      <p className="text-lg text-slate-300 mb-10">
        Story time for wherever the road takes you.
      </p>

      {phase !== "done" && (
        <button
          onClick={go}
          disabled={phase === "loading"}
          className="w-full max-w-md rounded-3xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] transition text-slate-900 text-3xl font-extrabold py-10 px-6 shadow-xl disabled:opacity-70"
        >
          {phase === "loading" ? loadingLine : "Tell Me Where I Am"}
        </button>
      )}

      {error && (
        <p className="mt-8 max-w-md text-xl text-rose-300">{error}</p>
      )}

      {phase === "done" && story && (
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-bold mb-1">{story.placeLabel}</h2>
          {story.confidence === "low" && (
            <p className="text-sm text-slate-400 mb-4">
              Quiet corner of the map — here&apos;s the broader story.
            </p>
          )}
          <p className="text-lg leading-relaxed text-slate-100 mb-8">
            {story.spokenScript}
          </p>

          <div className="grid grid-cols-3 gap-3 mb-8">
            <button
              onClick={repeat}
              className="rounded-2xl bg-slate-700 hover:bg-slate-600 py-5 text-lg font-bold"
            >
              Repeat
            </button>
            <button
              onClick={stop}
              className="rounded-2xl bg-slate-700 hover:bg-slate-600 py-5 text-lg font-bold"
            >
              Stop
            </button>
            <button
              onClick={go}
              className="rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-900 py-5 text-lg font-bold"
            >
              Again
            </button>
          </div>

          {speaking && (
            <p className="text-sm text-amber-300 mb-6">Reading aloud…</p>
          )}

          {story.sources.length > 0 && (
            <div className="text-left">
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">
                Sources
              </p>
              <ul className="space-y-1">
                {story.sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-sky-300 hover:underline"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!supported && (
            <p className="mt-6 text-sm text-slate-400">
              (Your browser can&apos;t read aloud, but the story&apos;s above.)
            </p>
          )}
        </div>
      )}
    </main>
  );
}
