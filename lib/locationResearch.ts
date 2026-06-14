// locationResearch.ts
// Turns raw GPS coordinates into REAL nearby context using only free,
// keyless public services:
//   - OpenStreetMap (Nominatim) for reverse geocoding the place name
//   - Wikipedia for nearby landmark articles and their summaries
//
// No API keys. No paid web search. No mock data.
// If the real services can't give us enough to work with, we say so honestly.

const UA =
  "RoadLore/1.0 (https://github.com/nolimitjonesinc/Road-Lore; contact@nolimitjones.com)";

export interface NearbySource {
  title: string;
  distanceMeters: number;
  summary: string;
  url: string;
}

export interface LocationContext {
  placeLabel: string; // e.g. "Mar Vista, Los Angeles, California"
  region: string; // broader area for fallback color
  sources: NearbySource[];
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    // Never cache — location is always "right now"
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Upstream service returned ${res.status}`);
  }
  return res.json();
}

// Step 1: reverse geocode coordinates -> a real human place label
async function reverseGeocode(
  lat: number,
  lon: number
): Promise<{ placeLabel: string; region: string }> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`;
  const data = await fetchJson(url);

  const a = data.address || {};
  const locality =
    a.neighbourhood ||
    a.suburb ||
    a.city ||
    a.town ||
    a.village ||
    a.hamlet ||
    a.county;
  const region = [a.county || a.city, a.state, a.country]
    .filter(Boolean)
    .join(", ");

  const placeLabel =
    [locality, a.state].filter(Boolean).join(", ") ||
    data.display_name ||
    region;

  return { placeLabel, region };
}

// Step 2: find real Wikipedia articles physically near the coordinates
async function nearbyArticles(
  lat: number,
  lon: number
): Promise<{ title: string; dist: number }[]> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&list=geosearch` +
    `&gscoord=${lat}%7C${lon}&gsradius=5000&gslimit=12&format=json`;
  const data = await fetchJson(url);
  const hits = data?.query?.geosearch || [];
  return hits.map((h: any) => ({ title: h.title, dist: h.dist }));
}

// Step 3: pull a short real summary for an article
async function articleSummary(
  title: string
): Promise<{ summary: string; url: string } | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title
    )}`;
    const data = await fetchJson(url);
    const extract: string = data?.extract || "";
    if (!extract) return null;
    // Skip disambiguation / list pages — they make for bad stories
    if (data?.type && data.type !== "standard") return null;
    return {
      summary: extract,
      url: data?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    };
  } catch {
    return null;
  }
}

// Orchestrates the three steps into one real context object.
export async function researchLocation(
  lat: number,
  lon: number
): Promise<LocationContext> {
  const [{ placeLabel, region }, articles] = await Promise.all([
    reverseGeocode(lat, lon),
    nearbyArticles(lat, lon),
  ]);

  // Pull summaries for the closest handful of articles (cap at 6 for speed/cost)
  const top = articles.slice(0, 6);
  const summaries = await Promise.all(
    top.map(async (a) => {
      const s = await articleSummary(a.title);
      if (!s) return null;
      const source: NearbySource = {
        title: a.title,
        distanceMeters: Math.round(a.dist),
        summary: s.summary,
        url: s.url,
      };
      return source;
    })
  );

  const sources = summaries.filter((s): s is NearbySource => s !== null);

  return { placeLabel, region, sources };
}
