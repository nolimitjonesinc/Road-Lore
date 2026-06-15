"use client";

import { useCallback, useEffect, useState } from "react";

export interface SavedSource {
  title: string;
  url: string;
  distanceMeters: number;
}
export interface SavedStory {
  id: string;
  placeLabel: string;
  spokenScript: string;
  confidence: string;
  sources: SavedSource[];
  savedAt: number;
}

const KEY = "roadlore.saved.v1";

function read(): SavedStory[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedStory[]) : [];
  } catch {
    return [];
  }
}

function write(list: SavedStory[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked — ignore */
  }
}

// Saved stories live in the phone's local storage: private, instant, offline.
export function useSavedStories() {
  const [stories, setStories] = useState<SavedStory[]>([]);

  useEffect(() => {
    setStories(read());
  }, []);

  const save = useCallback(
    (s: Omit<SavedStory, "id" | "savedAt">): SavedStory => {
      const item: SavedStory = {
        ...s,
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : String(Date.now()) + Math.random().toString(16).slice(2),
        savedAt: Date.now(),
      };
      setStories((prev) => {
        // Skip an exact duplicate (same place + same text).
        const dup = prev.find(
          (p) =>
            p.placeLabel === item.placeLabel &&
            p.spokenScript === item.spokenScript
        );
        if (dup) return prev;
        const next = [item, ...prev];
        write(next);
        return next;
      });
      return item;
    },
    []
  );

  const remove = useCallback((id: string) => {
    setStories((prev) => {
      const next = prev.filter((p) => p.id !== id);
      write(next);
      return next;
    });
  }, []);

  return { stories, save, remove };
}
