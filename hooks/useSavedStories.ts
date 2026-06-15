"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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

// A stable per-device id so each phone sees its own saved list (until we add
// real logins). Stored in the browser; the stories themselves live in Supabase.
function deviceId(): string {
  if (typeof window === "undefined") return "server";
  const KEY = "roadlore.device";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(16).slice(2);
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToStory(row: any): SavedStory {
  return {
    id: row.id,
    placeLabel: row.place_label,
    spokenScript: row.spoken_script,
    confidence: row.confidence || "",
    sources: row.sources || [],
    savedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

// Saved stories live in Supabase (table: saved_stories), scoped per device.
export function useSavedStories() {
  const [stories, setStories] = useState<SavedStory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("roadlore_saved_stories")
      .select("*")
      .eq("device_id", deviceId())
      .order("created_at", { ascending: false });
    if (!error && data) setStories(data.map(rowToStory));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Returns the saved story (with its new id) so the caller can cache the
  // narration audio under that id, or null if the save couldn't happen.
  const save = useCallback(
    async (
      s: Omit<SavedStory, "id" | "savedAt">
    ): Promise<SavedStory | null> => {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("roadlore_saved_stories")
        .insert({
          device_id: deviceId(),
          place_label: s.placeLabel,
          spoken_script: s.spokenScript,
          confidence: s.confidence,
          sources: s.sources,
        })
        .select()
        .single();
      if (error || !data) return null;
      const story = rowToStory(data);
      setStories((prev) => [story, ...prev]);
      return story;
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from("roadlore_saved_stories")
      .delete()
      .eq("id", id)
      .eq("device_id", deviceId());
    if (!error) setStories((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { stories, loading, save, remove };
}
