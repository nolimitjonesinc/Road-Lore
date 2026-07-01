"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Scene from "./scene";
import { useSpeech } from "@/hooks/useSpeech";
import { useSavedStories } from "@/hooks/useSavedStories";
import { STORY_MODES } from "@/lib/storyPrompt";
import { deviceId } from "@/lib/deviceId";
import type { MapPoi } from "./mapExplorer";

// Leaflet touches window at import time, so it can only load in the browser.
const MapExplorer = dynamic(() => import("./mapExplorer"), { ssr: false });

const MAP_RADIUS_METERS = 305; // ~1000ft

interface NearbyPlace {
  name: string;
  type: string;
  distanceMeters: number;
  lat: number;
  lon: number;
}

const DISTANCE_OPTIONS = [0.5, 1, 5, 10, 25]; // miles
const MILES_TO_METERS = 1609.34;
const RADIUS_KEY = "rl_radius_mi";

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
  audioUrl?: string;
}

type Phase = "intro" | "idle" | "loading" | "done" | "denied";

const LOADING_LINES = [
  "Finding your spot on the planet…",
  "Checking what's nearby…",
  "Turning the map into story time…",
];

const VOICE_LOADING_LINES = [
  "Dusting off the history books...",
  "Bribing the local squirrels for gossip...",
  "Convincing the narrator to leave their trailer...",
  "Checking if anything interesting ever happened here...",
  "Interviewing a guy who \"swears he was there...\"",
  "Polishing our best fun facts...",
  "Digging through decades of local drama...",
  "Looking for the weirdest story first...",
  "Translating boring history into something worth hearing...",
  "Waking up the town historian...",
  "Asking the ghosts for comment...",
  "Teaching the narrator how to pronounce this place...",
  "Making sure we don't accidentally insult the locals...",
  "Finding the juicy version of the story...",
  "Our tour guide took the scenic route...",
  "Feeding the storyteller coffee...",
  "Looking for the scandal they left off the plaque...",
  "Dusting off the roadside legend...",
  "Checking whether this place is haunted...",
  "Looking for the \"you won't believe this\" part...",
  "The narrator is putting on their adventure pants...",
  "Rehearsing our dramatic gasp...",
  "Stretching our storytelling muscles...",
  "Searching for historical tea...",
  "Negotiating with the local pigeons for insider information...",
  "Making this sound way cooler than your history teacher did...",
  "Loading fun facts and questionable legends...",
  "Waiting for the banjo solo to finish...",
  "Summoning your extremely enthusiastic tour guide...",
  "Buckle up—your roadside storyteller is grabbing the mic.",
];

const NEARBY_LOADING_LINES = [
  "Checking which direction is actually north…",
  "Bribing the local pigeons for intel…",
  "Unfolding the map — yes, the actual paper one…",
  "Asking a suspicious-looking squirrel for directions…",
  "Pinging every lamppost within shouting distance…",
  "Scanning the horizon for anything remotely interesting…",
  "Convincing the GPS to stop rerouting every 10 seconds…",
  "Sniffing out the good stuff nearby…",
  "Checking if that building over there has a story…",
  "Interrogating the neighborhood watch…",
  "Consulting the world's most detailed roadside atlas…",
  "Zooming in on your little blue dot…",
  "Sending a scout ahead — they just texted back \"whoa\"…",
  "Locating every named thing within range…",
  "Finding the places your GPS forgot to mention…",
  "Triangulating via three very confident strangers…",
  "Checking if \"interesting\" is within driving distance…",
  "Searching for nearby legends, lore, and at least one ghost…",
  "Cross-referencing with approximately 47 maps…",
  "Rounding up the neighborhood's best-kept secrets…",
  "Dusting off the local signage…",
  "Looking for the stuff not on the tourist pamphlet…",
  "Counting landmarks on one hand — ran out of fingers…",
  "Waking up the locals to ask what's around here…",
  "Measuring \"nearby\" very generously…",
  "Triangulating your exact vibe radius…",
  "Following the sound of a distant tour bus…",
  "Checking if that weird building has a Wikipedia page…",
  "Calculating distance in both miles and \"is it worth it\"…",
  "Almost there — just asking one more stranger…",
];

const LOC_KEY = "rl_loc_granted";
const USED_KEY = "rl_used_articles";

// Project a point ~distanceMiles ahead along a compass heading.
function projectAhead(lat: number, lon: number, headingDeg: number, distanceMiles: number) {
  const R = 6371;
  const d = (distanceMiles * 1.60934) / R;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const brng = (headingDeg * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

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
  const { save, attachAudio, linkAudio } = useSavedStories();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState<Phase>("intro");
  const [loadingLine, setLoadingLine] = useState(LOADING_LINES[0]);
  const [story, setStory] = useState<Story | null>(null);
  const [error, setError] = useState<string>("");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [voiceLineIndex, setVoiceLineIndex] = useState(0);
  // Coordinates the current story is about — lets "Tell Me More" stay on this
  // spot even after the user has driven past it.
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  // Name of the place the current story is about — set when the user picks a
  // nearby neighborhood, so "Tell Me More" stays locked to that exact place.
  const [anchorName, setAnchorName] = useState<string | null>(null);
  // Chosen story vibe (genre). "surprise" = random angle. Sticky across stories.
  const [selectedMode, setSelectedMode] = useState("surprise");
  // "Explore nearby" picker state.
  const [exploreOpen, setExploreOpen] = useState(false);
  const [radiusMi, setRadiusMi] = useState(5);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [nearbyLineIndex, setNearbyLineIndex] = useState(0);
  const [showRadiusPopup, setShowRadiusPopup] = useState(false);
  // Tappable map of what's within ~1000ft of where the user was standing.
  const [mapOpen, setMapOpen] = useState(false);
  const [mapPois, setMapPois] = useState<MapPoi[]>([]);
  const [mapLoading, setMapLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RADIUS_KEY);
      if (saved) {
        setRadiusMi(Number(saved));
      } else {
        setShowRadiusPopup(true);
      }
    } catch { /* ignore */ }
  }, []);

  function selectRadius(miles: number) {
    setRadiusMi(miles);
    try { localStorage.setItem(RADIUS_KEY, String(miles)); } catch { /* ignore */ }
    setShowRadiusPopup(false);
  }

  useEffect(() => {
    if (!placesLoading) return;
    setNearbyLineIndex(0);
    const id = setInterval(() => {
      setNearbyLineIndex((i) => (i + 1) % NEARBY_LOADING_LINES.length);
    }, 2000);
    return () => clearInterval(id);
  }, [placesLoading]);

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

  // Fetch + narrate a story for a given spot. Shared by "Give Me the Lore"
  // (fresh GPS) and "Tell Me More" (locked to the previous story's spot).
  async function fetchStory(
    latitude: number,
    longitude: number,
    mode?: string,
    placeName?: string,
    lookAhead?: boolean
  ) {
    try {
      setLoadingLine(LOADING_LINES[1]);
      const res = await fetch("/api/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude,
          longitude,
          usedArticles: getUsedArticles(),
          mode: mode ?? selectedMode,
          placeName: placeName ?? undefined,
          lookAhead: lookAhead ?? false,
          deviceId: deviceId(),
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
      // Track which articles were used so the next story gets different topics.
      if (data.sources?.length) saveUsedArticles(data.sources.map((s: {title: string}) => s.title));
      setStory(data);
      setSaved(false);
      setSaving(true);
      setSourcesOpen(false);
      setPhase("done");
      // Narrate immediately — speak() must fire before any await so it
      // stays within the browser's user-gesture window and autoplay works.
      // If the server already has this narrated (shared-pool cache hit or a
      // fresh Gemini render it just stored), play that directly — no extra
      // Gemini call. Otherwise it generates audio client-side as before.
      const audioPromise = speak(data.spokenScript, data.audioUrl);
      // Save in the background; don't block narration on it.
      save({
        placeLabel: data.placeLabel,
        spokenScript: data.spokenScript,
        confidence: data.confidence,
        sources: data.sources,
      }).then(async (savedStory) => {
        setSaving(false);
        setSaved(!!savedStory);
        if (!savedStory) return;
        // Reuse the shared-pool audio link instead of re-uploading.
        if (data.audioUrl) {
          linkAudio(savedStory.id, data.audioUrl);
        } else {
          const blob = await audioPromise;
          if (blob) attachAudio(savedStory.id, blob);
        }
      }).catch(() => setSaving(false));
    } catch {
      setError("Something went sideways. Try again.");
      setPhase("idle");
    }
  }

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
      (pos) => {
        const { latitude, longitude, heading } = pos.coords;
        const hasHeading = heading !== null && Number.isFinite(heading);
        const target = hasHeading
          ? projectAhead(latitude, longitude, heading!, 1)
          : { lat: latitude, lon: longitude };
        // Lock the TARGET spot (ahead or current) so "Tell Me More" stays on it.
        setCoords(target);
        setAnchorName(null);
        fetchStory(target.lat, target.lon, undefined, undefined, hasHeading);
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

  // Another story about the SAME spot — uses the chosen vibe, skips already-used
  // topics. No new GPS read, so it stays on the place even after driving on.
  function tellMeMore() {
    if (!coords) { go(); return; }
    setError("");
    setStory(null);
    stop();
    setPhase("loading");
    setLoadingLine(LOADING_LINES[0]);
    fetchStory(coords.lat, coords.lon, undefined, anchorName ?? undefined);
  }

  // Tell a story about a chosen nearby place. Re-locks coords AND the name to it
  // so further "Tell Me More" picks stay on that exact place.
  function goToPlace(p: NearbyPlace) {
    setError("");
    setStory(null);
    stop();
    setCoords({ lat: p.lat, lon: p.lon });
    setAnchorName(p.name);
    setExploreOpen(false);
    setPhase("loading");
    setLoadingLine(LOADING_LINES[0]);
    fetchStory(p.lat, p.lon, undefined, p.name);
  }

  // Load nearby named places whenever the explorer is open and the spot or
  // radius changes. Overpass is free and keyless, so this is cheap.
  useEffect(() => {
    if (!exploreOpen || !coords) return;
    let cancelled = false;
    setPlacesLoading(true);
    setPlaces([]);
    fetch("/api/nearby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: coords.lat,
        longitude: coords.lon,
        radiusMeters: Math.round(radiusMi * MILES_TO_METERS),
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPlaces(data.places || []);
      })
      .catch(() => {
        if (!cancelled) setPlaces([]);
      })
      .finally(() => {
        if (!cancelled) setPlacesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [exploreOpen, radiusMi, coords]);

  // Load real nearby map pins whenever the map is open — pulls whatever's
  // within ~1000ft of where the user was standing when they tapped it.
  useEffect(() => {
    if (!mapOpen || !coords) return;
    let cancelled = false;
    setMapLoading(true);
    setMapPois([]);
    fetch("/api/map-pois", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: coords.lat,
        longitude: coords.lon,
        radiusMeters: MAP_RADIUS_METERS,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setMapPois(data.pois || []);
      })
      .catch(() => {
        if (!cancelled) setMapPois([]);
      })
      .finally(() => {
        if (!cancelled) setMapLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mapOpen, coords]);

  // Tell a story about a pin tapped on the map. Re-locks coords AND name so
  // "Tell Me More" keeps riffing on that exact spot.
  function goToMapPoi(p: MapPoi) {
    setError("");
    setStory(null);
    stop();
    setCoords({ lat: p.lat, lon: p.lon });
    setAnchorName(p.name);
    setMapOpen(false);
    setPhase("loading");
    setLoadingLine(LOADING_LINES[0]);
    fetchStory(p.lat, p.lon, undefined, p.name);
  }

  return (
    <>
      {showRadiusPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="glass rounded-[28px] p-8 w-full max-w-sm rise">
            <div className="text-4xl mb-4 text-center">🗺️</div>
            <h2 className="text-2xl font-bold mb-2 text-center font-[family-name:var(--font-display)]">
              How far should we look?
            </h2>
            <p className="text-[var(--muted)] text-sm text-center mb-6 leading-relaxed">
              Pick your search radius. You can always change it later.
            </p>
            <div className="flex flex-col gap-3">
              {DISTANCE_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => selectRadius(d)}
                  className="glass rounded-2xl py-4 text-base font-bold text-[var(--cream)] border border-white/10 hover:border-[var(--gold)]/40 transition"
                >
                  {d} {d === 1 ? "mile" : "miles"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {mapOpen && coords && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
          <div className="flex items-center justify-between px-5 py-4 glass border-b border-white/10">
            <div>
              <h2 className="text-lg font-bold text-[var(--cream)] font-[family-name:var(--font-display)]">
                What Did I Just Pass?
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Tap a pin — real spots within ~1000ft of where you tapped.
              </p>
            </div>
            <button
              onClick={() => setMapOpen(false)}
              className="text-[var(--muted)] hover:text-[var(--cream)] text-2xl leading-none px-2"
              aria-label="Close map"
            >
              ✕
            </button>
          </div>
          <div className="relative flex-1">
            <MapExplorer
              center={coords}
              radiusMeters={MAP_RADIUS_METERS}
              pois={mapPois}
              onPick={goToMapPoi}
            />
            {mapLoading && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 glass rounded-full px-4 py-2 text-sm text-[var(--cream)] z-[1000]">
                Scanning what's nearby…
              </div>
            )}
            {!mapLoading && mapPois.length === 0 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 glass rounded-full px-4 py-2 text-sm text-[var(--muted)] z-[1000]">
                Nothing named found this close — try a spot with more nearby landmarks.
              </div>
            )}
          </div>
        </div>
      )}
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

            {/* Pick a vibe for the next story */}
            <div className="mb-5 text-left">
              <p className="kicker text-[10px] text-[var(--gold)]/80 mb-3">
                Pick a vibe
              </p>
              <div className="flex flex-wrap gap-2">
                {STORY_MODES.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setSelectedMode(m.key)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold border transition ${
                      selectedMode === m.key
                        ? "bg-[var(--gold)] text-[#2a1206] border-[var(--gold)]"
                        : "glass text-[var(--cream)] border-white/10 hover:border-[var(--gold)]/40"
                    }`}
                  >
                    {m.emoji} {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 mb-6">
              <button
                onClick={tellMeMore}
                className="glass w-full rounded-2xl py-4 text-base font-bold text-[var(--gold)] hover:border-[var(--gold)]/40 transition flex items-center justify-center gap-2"
              >
                ✨  Tell Me More About Here
              </button>

              {/* Explore nearby — distance picker + named neighborhoods/cities */}
              <div className="glass rounded-2xl px-4 py-3">
                <button
                  onClick={() => setExploreOpen((o) => !o)}
                  className="flex items-center justify-between w-full text-[var(--cream)]"
                >
                  <span className="flex items-center gap-2 font-bold text-base">
                    🧭 Explore nearby
                  </span>
                  <span
                    className="text-[10px] transition-transform duration-200"
                    style={{ display: "inline-block", transform: exploreOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                  >
                    ▶
                  </span>
                </button>

                {exploreOpen && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[var(--muted)]">
                        Within <span className="text-[var(--cream)] font-semibold">{radiusMi} {radiusMi === 1 ? "mile" : "miles"}</span>
                      </span>
                      <button
                        onClick={() => setShowRadiusPopup(true)}
                        className="text-xs text-[var(--gold)] hover:text-[var(--gold)]/70 transition font-semibold"
                      >
                        Change
                      </button>
                    </div>

                    {placesLoading ? (
                      <p className="text-sm text-[var(--muted)] py-2">{NEARBY_LOADING_LINES[nearbyLineIndex]}</p>
                    ) : places.length === 0 ? (
                      <p className="text-sm text-[var(--muted)] py-2">
                        No named neighborhoods found out here — try a wider distance.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {places.map((p) => (
                          <li key={`${p.name}-${p.lat}`}>
                            <button
                              onClick={() => goToPlace(p)}
                              className="w-full rounded-xl px-4 py-3 flex items-center justify-between bg-white/5 border border-white/10 hover:border-[var(--gold)]/40 transition text-left"
                            >
                              <span className="font-semibold text-[var(--cream)]">{p.name}</span>
                              <span className="text-xs text-[var(--muted)] whitespace-nowrap ml-3">
                                {(p.distanceMeters / MILES_TO_METERS).toFixed(1)} mi · {p.type}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => setMapOpen(true)}
                className="glass w-full rounded-2xl py-4 text-base font-bold text-[var(--gold)] hover:border-[var(--gold)]/40 transition flex items-center justify-center gap-2"
              >
                🗺️  What Did I Just Pass?
              </button>

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
                  ↺  New Spot
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
