"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapPoi {
  name: string;
  type: string;
  distanceMeters: number;
  lat: number;
  lon: number;
}

// Free, keyless, no-card map tiles — OpenFreeMap serves OSM data over a CDN
// built for production traffic (unlike hitting tile.openstreetmap.org
// directly, which is meant for casual/dev use and can get blocked).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// Builds a GeoJSON polygon approximating a circle of `radiusMeters` around
// (lat, lon) — MapLibre has no native circle-in-meters primitive.
function makeCircle(lat: number, lon: number, radiusMeters: number, points = 64) {
  const coords: [number, number][] = [];
  const distanceX = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  const distanceY = radiusMeters / 110540;
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    coords.push([lon + distanceX * Math.cos(angle), lat + distanceY * Math.sin(angle)]);
  }
  coords.push(coords[0]);
  return {
    type: "Feature" as const,
    geometry: { type: "Polygon" as const, coordinates: [coords] },
    properties: {},
  };
}

// Tappable map centered on where the user was when they opened it. Pins are
// real OpenStreetMap points (lakes, statues, historic markers…) — tapping
// one asks for a story about that exact spot.
export default function MapExplorer({
  center,
  radiusMeters,
  pois,
  onPick,
}: {
  center: { lat: number; lon: number };
  radiusMeters: number;
  pois: MapPoi[];
  onPick: (poi: MapPoi) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const youMarkerRef = useRef<maplibregl.Marker | null>(null);
  const poiMarkersRef = useRef<maplibregl.Marker[]>([]);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [center.lon, center.lat],
      zoom: 16,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "You are here" marker + the gold search-radius circle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    youMarkerRef.current?.remove();
    youMarkerRef.current = new maplibregl.Marker({ color: "#e8b769" })
      .setLngLat([center.lon, center.lat])
      .addTo(map);

    const drawCircle = () => {
      const circleGeoJson = makeCircle(center.lat, center.lon, radiusMeters);
      const source = map.getSource("search-radius") as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(circleGeoJson);
      } else {
        map.addSource("search-radius", { type: "geojson", data: circleGeoJson });
        map.addLayer({
          id: "search-radius-fill",
          type: "fill",
          source: "search-radius",
          paint: { "fill-color": "#e8b769", "fill-opacity": 0.08 },
        });
        map.addLayer({
          id: "search-radius-line",
          type: "line",
          source: "search-radius",
          paint: { "line-color": "#e8b769", "line-width": 2 },
        });
      }
    };

    if (map.isStyleLoaded()) drawCircle();
    else map.once("load", drawCircle);

    map.jumpTo({ center: [center.lon, center.lat] });
  }, [center.lat, center.lon, radiusMeters]);

  // Tappable pins for real nearby landmarks.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawPins = () => {
      poiMarkersRef.current.forEach((m) => m.remove());
      poiMarkersRef.current = pois.map((p) => {
        const el = document.createElement("div");
        el.textContent = "📌";
        el.style.fontSize = "26px";
        el.style.cursor = "pointer";
        el.style.filter = "drop-shadow(0 2px 3px rgba(0,0,0,.6))";
        el.addEventListener("click", () => onPick(p));
        return new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([p.lon, p.lat])
          .addTo(map);
      });
    };

    if (map.isStyleLoaded()) drawPins();
    else map.once("load", drawPins);

    return () => {
      poiMarkersRef.current.forEach((m) => m.remove());
      poiMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pois]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
