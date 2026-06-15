"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Plays the story aloud using Gemini TTS audio from /api/voice.
// speak() returns the generated audio blob so the caller can store it in
// Supabase. If a story already has stored audio, pass its URL to play it
// straight from storage — no regeneration, no extra Gemini call.
export function useSpeech() {
  const [supported, setSupported] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastUrlRef = useRef<string>(""); // in-memory audio for instant Repeat

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "Audio" in window);
    return () => {
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setSpeaking(false);
  }, []);

  const playUrl = useCallback((url: string) => {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audioRef.current = audio;
    }
    audio.src = url;
    audio.onplay = () => setSpeaking(true);
    audio.onended = () => setSpeaking(false);
    audio.onerror = () => setSpeaking(false);
    audio.play().catch(() => setSpeaking(false));
  }, []);

  // storedUrl: if the story already has audio in Supabase Storage, play that
  // directly. Otherwise generate it with Gemini and return the blob to store.
  const speak = useCallback(
    async (text: string, storedUrl?: string): Promise<Blob | null> => {
      stop();
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = "";
      }

      // Already stored — stream it back, no generation needed.
      if (storedUrl) {
        playUrl(storedUrl);
        return null;
      }

      setAudioLoading(true);
      try {
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const ct = res.headers.get("content-type") || "";
        if (res.ok && ct.includes("audio")) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          lastUrlRef.current = url;
          setAudioLoading(false);
          playUrl(url);
          return blob;
        }
        setAudioLoading(false);
        return null;
      } catch {
        setAudioLoading(false);
        /* Gemini unavailable — stay silent */
        return null;
      }
    },
    [stop, playUrl]
  );

  // Repeat replays the in-memory audio instantly (no second API call).
  const repeat = useCallback(() => {
    if (lastUrlRef.current) {
      playUrl(lastUrlRef.current);
    }
  }, [playUrl]);

  return { supported, speaking, audioLoading, speak, stop, repeat };
}
