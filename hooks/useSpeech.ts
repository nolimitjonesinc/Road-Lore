"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Plays the story aloud. Tries the real narrated MP3 (OpenAI "fable") first;
// if that isn't available (no key, error, or autoplay blocked) it falls back
// to the browser's built-in voice so the app always talks.
export function useSpeech() {
  const [supported, setSupported] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTextRef = useRef<string>("");
  const lastUrlRef = useRef<string>(""); // cached MP3 for instant Repeat

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        ("speechSynthesis" in window || "Audio" in window)
    );
    return () => {
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, []);

  const browserSpeak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const playUrl = useCallback(
    (url: string, fallbackText: string) => {
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audioRef.current = audio;
      }
      audio.src = url;
      audio.onplay = () => setSpeaking(true);
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      const p = audio.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          // Autoplay blocked (common on iOS after async work) — use browser voice.
          browserSpeak(fallbackText);
        });
      }
    },
    [browserSpeak]
  );

  const speak = useCallback(
    async (text: string) => {
      stop();
      lastTextRef.current = text;
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = "";
      }

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
          playUrl(url, text);
          return;
        }
      } catch {
        /* fall through to browser voice */
      }
      // No MP3 available — use the built-in voice.
      browserSpeak(text);
    },
    [stop, playUrl, browserSpeak]
  );

  // Repeat replays the cached MP3 instantly (no second API call / no extra cost).
  const repeat = useCallback(() => {
    if (lastUrlRef.current) {
      playUrl(lastUrlRef.current, lastTextRef.current);
    } else if (lastTextRef.current) {
      browserSpeak(lastTextRef.current);
    }
  }, [playUrl, browserSpeak]);

  return { supported, speaking, speak, stop, repeat };
}
