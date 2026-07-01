import { NextResponse } from "next/server";
import { nearbyMapPois } from "@/lib/locationResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Real, named, physical things (lakes, statues, historic markers, parks…)
// within a tight radius of a point — powers the tappable "what did I just
// pass?" map.
export async function POST(req: Request) {
  let lat: number, lon: number, radiusMeters: number;
  try {
    const body = await req.json();
    lat = Number(body.latitude);
    lon = Number(body.longitude);
    radiusMeters = Number(body.radiusMeters) || 305; // ~1000ft
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (
    !Number.isFinite(lat) || !Number.isFinite(lon) ||
    lat < -90 || lat > 90 || lon < -180 || lon > 180
  ) {
    return NextResponse.json({ pois: [] });
  }

  try {
    const pois = await nearbyMapPois(lat, lon, radiusMeters);
    return NextResponse.json({ pois: pois.slice(0, 30) });
  } catch {
    return NextResponse.json({ pois: [] });
  }
}
