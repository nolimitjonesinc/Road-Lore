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

export interface OsmPoi {
  name: string;
  type: string;
  distanceMeters: number;
}

export interface LocationContext {
  placeLabel: string; // e.g. "Mar Vista, Los Angeles, California"
  region: string; // broader area for fallback color
  sources: NearbySource[];
  osmPois: OsmPoi[];
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
    `&gscoord=${lat}%7C${lon}&gsradius=10000&gslimit=25&format=json`;
  const data = await fetchJson(url);
  const hits = data?.query?.geosearch || [];
  // Shuffle the results to get variety each tap
  const shuffled = hits
    .map((h: any) => ({ title: h.title, dist: h.dist }))
    .sort(() => Math.random() - 0.5);
  return shuffled;
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

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
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

    // Determine POI type from tags
    let type = "place";
    if (tags.historic) type = tags.historic === "yes" ? "historic site" : tags.historic;
    else if (tags.tourism) type = tags.tourism;
    else if (tags.leisure) type = tags.leisure === "park" ? "park" : "nature reserve";
    else if (tags.amenity === "place_of_worship") type = "place of worship";
    else if (tags.man_made) type = tags.man_made;

    // Get coordinates (use center for ways)
    const poiLat = elem.center?.lat || elem.lat;
    const poiLon = elem.center?.lon || elem.lon;
    if (!poiLat || !poiLon) continue;

    const distance = Math.round(calculateDistance(lat, lon, poiLat, poiLon));

    pois.push({ name, type, distanceMeters: distance });
  }

  // Sort by distance
  return pois.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

// Orchestrates all steps into one real context object.
export async function researchLocation(
  lat: number,
  lon: number
): Promise<LocationContext> {
  const [{ placeLabel, region }, articles, osmPois] = await Promise.all([
    reverseGeocode(lat, lon),
    nearbyArticles(lat, lon),
    nearbyOsmPois(lat, lon).catch(() => []), // Silently skip on failure
  ]);

  // Pull summaries for 6 randomly selected articles
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

  return { placeLabel, region, sources, osmPois };
}
