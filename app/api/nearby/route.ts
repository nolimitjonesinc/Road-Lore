import { NextResponse } from "next/server";
import { nearbyPlaces } from "@/lib/locationResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns named neighborhoods / towns / cities within a radius of a point,
// nearest first. Powers the "Explore nearby" picker after the first story.
export async function POST(req: Request) {
  let lat: number, lon: number, radiusMeters: number;
  try {
    const body = await req.json();
    lat = Number(body.latitude);
    lon = Number(body.longitude);
    radiusMeters = Number(body.radiusMeters) || 8000;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (
    !Number.isFinite(lat) || !Number.isFinite(lon) ||
    lat < -90 || lat > 90 || lon < -180 || lon > 180
  ) {
    return NextResponse.json({ places: [] });
  }

  try {
    const places = await nearbyPlaces(lat, lon, radiusMeters);
    // Cap the list so the UI stays scannable.
    return NextResponse.json({ places: places.slice(0, 12) });
  } catch {
    return NextResponse.json({ places: [] });
  }
}
