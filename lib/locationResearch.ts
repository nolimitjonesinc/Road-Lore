// locationResearch.ts
// Turns raw GPS coordinates into REAL nearby context using only free,
// keyless public services:
//   - OpenStreetMap (Nominatim) for reverse geocoding the place name
//   - Wikipedia for nearby landmark articles and their FULL intro sections
//   - OpenStreetMap Overpass for physical POIs
//
// No API keys. No paid web search. No mock data.

const UA =
  "RoadLore/1.0 (https://github.com/nolimitjonesinc/Road-Lore; contact@nolimitjones.com)";

export interface NearbySource {
  title: string;
  distanceMeters: number;
  summary: string;
  url: string;
}

export interface OsmPoi {
  name: string;
  type: string;
  distanceMeters: number;
}

export interface LocationContext {
  placeLabel: string;
  region: string;
  sources: NearbySource[];
  osmPois: OsmPoi[];
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstream service returned ${res.status}`);
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
    a.neighbourhood || a.suburb || a.city || a.town || a.village || a.hamlet || a.county;
  const region = [a.county || a.city, a.state, a.country].filter(Boolean).join(", ");
  const placeLabel = [locality, a.state].filter(Boolean).join(", ") || data.display_name || region;

  return { placeLabel, region };
}

// Step 2: find real Wikipedia articles physically near the coordinates
async function nearbyArticles(
  lat: number,
  lon: number
): Promise<{ title: string; dist: number }[]> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&list=geosearch` +
    `&gscoord=${lat}%7C${lon}&gsradius=10000&gslimit=25&format=json`;
  const data = await fetchJson(url);
  return (data?.query?.geosearch || []).map((h: any) => ({ title: h.title, dist: h.dist }));
}

// Step 3: pull the FULL intro section of an article (up to 2500 chars, plain text).
// This is far richer than the summary API — actual history, context, and stories.
async function articleFullIntro(
  title: string
): Promise<{ summary: string; url: string } | null> {
  try {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts` +
      `&exintro=true&explaintext=true&exchars=2500` +
      `&titles=${encodeURIComponent(title)}&format=json&redirects=1`;
    const data = await fetchJson(url);
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0] as any;
    if (!page || page.missing !== undefined || !page.extract?.trim()) return null;
    return {
      summary: page.extract.trim(),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    };
  } catch {
    return null;
  }
}

// Step 4: fetch nearby POIs from OpenStreetMap via Overpass API
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

async function fetchOverpass(query: string): Promise<any> {
  for (const server of OVERPASS_SERVERS) {
    try {
      const res = await fetch(server, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        cache: "no-store",
      });
      if (res.ok) return await res.json();
    } catch {
      // Try next server
    }
  }
  return null;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface NearbyPlace {
  name: string;
  type: string; // city | town | suburb | neighbourhood | quarter | village
  distanceMeters: number;
  lat: number;
  lon: number;
}

// Find real named neighborhoods, suburbs, towns and cities around a point.
// Used by the "Explore nearby" picker so the user can hear a story about a
// specific nearby place instead of only their exact spot.
export async function nearbyPlaces(
  lat: number,
  lon: number,
  radiusMeters: number
): Promise<NearbyPlace[]> {
  const r = Math.min(Math.max(Math.round(radiusMeters), 500), 50000);
  const query = `
[out:json][timeout:15];
(
  node["place"~"^(city|town|suburb|neighbourhood|quarter|village)$"]["name"](around:${r},${lat},${lon});
);
out body 60;
  `.trim();

  const data = await fetchOverpass(query);
  if (!data?.elements) return [];

  // Rank place types so cities/towns sort above tiny quarters at equal distance.
  const rank: Record<string, number> = {
    city: 0, town: 1, suburb: 2, neighbourhood: 3, quarter: 4, village: 5,
  };

  const seen = new Set<string>();
  const places: NearbyPlace[] = [];
  for (const el of data.elements) {
    const name = el.tags?.name;
    if (!name || el.lat == null || el.lon == null) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({
      name,
      type: el.tags.place,
      distanceMeters: Math.round(calculateDistance(lat, lon, el.lat, el.lon)),
      lat: el.lat,
      lon: el.lon,
    });
  }

  // Skip anything basically on top of the user (their own spot), then sort by
  // distance, breaking ties by place importance.
  return places
    .filter((p) => p.distanceMeters > 150)
    .sort((a, b) =>
      a.distanceMeters - b.distanceMeters ||
      (rank[a.type] ?? 9) - (rank[b.type] ?? 9)
    );
}

async function nearbyOsmPois(lat: number, lon: number): Promise<OsmPoi[]> {
  const query = `
[out:json][timeout:10];
(
  node["historic"](around:1000,${lat},${lon});
  way["historic"](around:1000,${lat},${lon});
  node["tourism"~"museum|attraction|artwork|viewpoint"](around:1000,${lat},${lon});
  way["tourism"~"museum|attraction|artwork|viewpoint"](around:1000,${lat},${lon});
  node["leisure"~"park|nature_reserve"](around:1000,${lat},${lon});
  way["leisure"~"park|nature_reserve"](around:1000,${lat},${lon});
  node["amenity"="place_of_worship"]["name"](around:1000,${lat},${lon});
  node["man_made"~"lighthouse|windmill"](around:1000,${lat},${lon});
);
out center body 20;
  `.trim();

  const data = await fetchOverpass(query);
  if (!data?.elements) return [];

  const pois: OsmPoi[] = [];
  for (const elem of data.elements) {
    const tags = elem.tags || {};
    const name = tags.name;
    if (!name) continue;

    let type = "place";
    if (tags.historic) type = tags.historic === "yes" ? "historic site" : tags.historic;
    else if (tags.tourism) type = tags.tourism;
    else if (tags.leisure) type = tags.leisure === "park" ? "park" : "nature reserve";
    else if (tags.amenity === "place_of_worship") type = "place of worship";
    else if (tags.man_made) type = tags.man_made;

    const poiLat = elem.center?.lat || elem.lat;
    const poiLon = elem.center?.lon || elem.lon;
    if (!poiLat || !poiLon) continue;

    pois.push({ name, type, distanceMeters: Math.round(calculateDistance(lat, lon, poiLat, poiLon)) });
  }

  return pois.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

// Orchestrates all steps into one real context object.
// usedArticles: titles already used in previous taps — skip them so repeat taps
//   dig progressively deeper instead of repeating.
// placeNameOverride: when the user picked a specific nearby neighborhood/city,
//   use that exact name as the label so the story is about THAT place.
export async function researchLocation(
  lat: number,
  lon: number,
  usedArticles: string[] = [],
  placeNameOverride?: string
): Promise<LocationContext> {
  const [{ placeLabel, region }, allArticles, osmPois] = await Promise.all([
    reverseGeocode(lat, lon),
    nearbyArticles(lat, lon),
    nearbyOsmPois(lat, lon).catch(() => []),
  ]);

  // Sort NEAREST first — this is the fix that makes each pin specific. Dropping
  // the pin on Venice vs. Mar Vista now pulls Venice's vs. Mar Vista's closest
  // landmarks, instead of a shuffled grab-bag from a 10km blob.
  const byDistance = [...allArticles].sort((a, b) => a.dist - b.dist);
  const usedSet = new Set(usedArticles.map((t) => t.toLowerCase()));
  const fresh = byDistance.filter((a) => !usedSet.has(a.title.toLowerCase()));

  // Prefer fresh (unused) articles; fall back to the full nearest-first list if
  // skipping leaves too few. Repeat taps thus walk outward from the pin.
  const candidates = fresh.length >= 3 ? fresh : byDistance;

  // Pull full intro sections for the 4 closest candidates (richer than summary API)
  const top = candidates.slice(0, 4);
  const summaries = await Promise.all(
    top.map(async (a) => {
      const s = await articleFullIntro(a.title);
      if (!s) return null;
      return {
        title: a.title,
        distanceMeters: Math.round(a.dist),
        summary: s.summary,
        url: s.url,
      } as NearbySource;
    })
  );

  const sources = summaries.filter((s): s is NearbySource => s !== null);

  // Keep only POIs genuinely close to the pin (within 1.2km) so a neighborhood
  // story doesn't get peppered with spots from the next town over.
  const closePois = osmPois.filter((p) => p.distanceMeters <= 1200);

  const label = placeNameOverride?.trim() || placeLabel;

  return { placeLabel: label, region, sources, osmPois: closePois };
}
