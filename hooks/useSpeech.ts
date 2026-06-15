"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Plays the story aloud using Gemini TTS audio from /api/voice.
// Audio isn't stored anywhere — the text is the keeper; the voice is cheap to
// regenerate on demand. "Repeat" replays the just-generated audio held in
// memory for this session, so a quick re-listen costs nothing extra.
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

  const speak = useCallback(
    async (text: string) => {
      stop();
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = "";
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

  // Repeat replays the in-memory audio instantly (no second API call).
  const repeat = useCallback(() => {
    if (lastUrlRef.current) {
      playUrl(lastUrlRef.current);
    }
  }, [playUrl]);

  return { supported, speaking, audioLoading, speak, stop, repeat };
}
