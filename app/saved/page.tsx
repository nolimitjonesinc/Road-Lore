"use client";

import Link from "next/link";
import { useState } from "react";
import Scene from "../scene";
import { useSpeech } from "@/hooks/useSpeech";
import { useSavedStories } from "@/hooks/useSavedStories";

function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function SavedPage() {
  const { stories, loading, remove } = useSavedStories();
  const { speaking, speak, stop } = useSpeech();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function playOne(id: string, text: string) {
    if (playingId === id && speaking) {
      stop();
      setPlayingId(null);
    } else {
      setPlayingId(id);
      speak(text);
    }
  }

  return (
    <>
      <Scene />
      <main className="relative z-10 min-h-screen px-6 py-10 max-w-md mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="text-[var(--muted)] hover:text-[var(--cream)] transition text-sm font-semibold"
          >
            ← Back
          </Link>
          <h1 className="wordmark text-2xl font-extrabold">Saved</h1>
          <span className="w-12" />
        </div>

        {loading ? (
          <p className="text-center text-[var(--muted)] mt-12">
            Loading your saved stories…
          </p>
        ) : stories.length === 0 ? (
          <div className="glass rounded-[28px] p-8 text-center mt-10">
            <div className="text-4xl mb-3">🗺️</div>
            <p className="text-[var(--cream)] font-bold mb-1">
              No saved stories yet
            </p>
            <p className="text-[var(--muted)] text-sm mb-6">
              Every story you hear is kept here automatically.
            </p>
            <Link
              href="/"
              className="cta inline-block px-6 py-3 rounded-2xl font-extrabold"
            >
              Find a story
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {stories.map((s) => (
              <li key={s.id} className="glass rounded-[24px] p-6 text-left">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h2 className="text-lg font-bold font-[family-name:var(--font-display)] leading-tight">
                    {s.placeLabel}
                  </h2>
                  <span className="text-[10px] text-[var(--muted)] whitespace-nowrap mt-1">
                    {formatDate(s.savedAt)}
                  </span>
                </div>
                <p className="text-[15px] leading-relaxed text-[var(--cream)]/90 mb-4">
                  {s.spokenScript}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => playOne(s.id, s.spokenScript)}
                    className="cta flex-1 rounded-xl py-3 text-sm font-extrabold"
                  >
                    {playingId === s.id && speaking ? "⏸  Stop" : "▶  Play"}
                  </button>
                  {confirmId === s.id ? (
                    <button
                      onClick={() => {
                        remove(s.id);
                        setConfirmId(null);
                      }}
                      className="rounded-xl py-3 px-4 text-sm font-bold bg-rose-500/80 text-white"
                    >
                      Delete?
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmId(s.id)}
                      className="glass rounded-xl py-3 px-4 text-sm font-bold hover:border-rose-400/40 transition"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
