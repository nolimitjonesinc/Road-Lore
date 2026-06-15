"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCachedAudio, putCachedAudio, hashKey } from "@/lib/audioCache";

// Plays the story aloud using Gemini TTS audio from /api/voice.
// Audio is cached on the device (IndexedDB) so replays are instant and work
// offline — the same approach Loomiverse uses. No browser-voice fallback.
export function useSpeech() {
  const [supported, setSupported] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTextRef = useRef<string>("");
  const lastUrlRef = useRef<string>(""); // cached WAV for instant Repeat

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

  // cacheKey: the saved story's id (so /saved replays the exact same audio).
  // If omitted, we key off the text so it still caches within a session.
  const speak = useCallback(
    async (text: string, cacheKey?: string) => {
      stop();
      lastTextRef.current = text;
      const key = cacheKey || hashKey(text);
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = "";
      }

      setAudioLoading(true);

      // 1. On-device cache first — instant, free, works offline.
      try {
        const cached = await getCachedAudio(key);
        if (cached) {
          const url = URL.createObjectURL(cached);
          lastUrlRef.current = url;
          setAudioLoading(false);
          playUrl(url);
          return;
        }
      } catch {
        /* fall through to generating it */
      }

      // 2. Not cached yet — generate with Gemini, then keep it for next time.
      try {
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const ct = res.headers.get("content-type") || "";
        if (res.ok && ct.includes("audio")) {
          const blob = await res.blob();
          putCachedAudio(key, blob).catch(() => {});
          const url = URL.createObjectURL(blob);
          lastUrlRef.current = url;
          setAudioLoading(false);
          playUrl(url);
        } else {
          setAudioLoading(false);
        }
      } catch {
        setAudioLoading(false);
        /* Gemini unavailable — stay silent */
      }
    },
    [stop, playUrl]
  );

  // Repeat replays the cached WAV instantly (no second API call).
  const repeat = useCallback(() => {
    if (lastUrlRef.current) {
      playUrl(lastUrlRef.current);
    }
  }, [playUrl]);

  return { supported, speaking, audioLoading, speak, stop, repeat };
}
