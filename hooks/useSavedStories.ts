"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { deviceId } from "@/lib/deviceId";

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
  audioUrl?: string; // public Supabase Storage link, once narration is stored
}

const AUDIO_BUCKET = "road-lore-audio";

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToStory(row: any): SavedStory {
  return {
    id: row.id,
    placeLabel: row.place_label,
    spokenScript: row.spoken_script,
    confidence: row.confidence || "",
    sources: row.sources || [],
    savedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    audioUrl: row.audio_url || undefined,
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

  // Uploads the narration audio to Supabase Storage once and links it to the
  // story row, so future plays stream the stored file instead of regenerating.
  const attachAudio = useCallback(async (id: string, blob: Blob) => {
    if (!supabase || !blob) return;
    const path = `${id}.wav`;
    const { error: upErr } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(path, blob, { contentType: "audio/wav", upsert: true });
    if (upErr) return;
    const { data: pub } = supabase.storage
      .from(AUDIO_BUCKET)
      .getPublicUrl(path);
    const url = pub?.publicUrl;
    if (!url) return;
    await supabase
      .from("roadlore_saved_stories")
      .update({ audio_url: url })
      .eq("id", id);
    setStories((prev) =>
      prev.map((s) => (s.id === id ? { ...s, audioUrl: url } : s))
    );
  }, []);

  // Points a saved story at audio that's already uploaded (e.g. the shared
  // story-pool narration) instead of uploading a fresh copy.
  const linkAudio = useCallback(async (id: string, url: string) => {
    if (!supabase || !url) return;
    const { error } = await supabase
      .from("roadlore_saved_stories")
      .update({ audio_url: url })
      .eq("id", id);
    if (error) return;
    setStories((prev) =>
      prev.map((s) => (s.id === id ? { ...s, audioUrl: url } : s))
    );
  }, []);

  const remove = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from("roadlore_saved_stories")
      .delete()
      .eq("id", id)
      .eq("device_id", deviceId());
    if (!error) {
      setStories((prev) => prev.filter((p) => p.id !== id));
      // Best-effort cleanup of the stored audio file.
      supabase.storage.from(AUDIO_BUCKET).remove([`${id}.wav`]);
    }
  }, []);

  return { stories, loading, save, attachAudio, linkAudio, remove };
}
