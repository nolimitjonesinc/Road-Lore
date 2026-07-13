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
        el.style.cursor = "pointer";
        el.style.display = "flex";
        el.style.flexDirection = "column";
        el.style.alignItems = "center";

        // The RoadLore logo — a gold speech bubble with a pin tail — as an
        // inline SVG so it stays crisp at any zoom and needs no image file.
        const pin = document.createElement("div");
        pin.style.lineHeight = "0";
        pin.style.filter = "drop-shadow(0 2px 3px rgba(0,0,0,.6))";
        pin.innerHTML =
          '<svg width="34" height="36" viewBox="0 0 34 36" aria-hidden="true">' +
          '<path d="M17 2 C9 2 3.5 7 3.5 13.5 c0 5.5 4.5 9.5 9.5 10.5 L17 32 l4-8 c5-1 9.5-5 9.5-10.5 C30.5 7 25 2 17 2 Z" ' +
          'fill="#e8b769" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>' +
          '<ellipse cx="12.5" cy="10" rx="4" ry="2.5" fill="#f6d9a0" opacity="0.55" transform="rotate(-25 12.5 10)"/>' +
          "</svg>";

        // A small readable name chip under the pin so you know what you're
        // about to tap instead of guessing.
        const label = document.createElement("div");
        label.textContent = p.name;
        label.style.marginBottom = "2px";
        label.style.maxWidth = "120px";
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        label.style.whiteSpace = "nowrap";
        label.style.fontSize = "11px";
        label.style.fontWeight = "600";
        label.style.lineHeight = "1.3";
        label.style.color = "#fff";
        label.style.background = "rgba(20,20,24,.82)";
        label.style.padding = "1px 6px";
        label.style.borderRadius = "6px";
        label.style.textShadow = "0 1px 2px rgba(0,0,0,.8)";

        el.appendChild(label);
        el.appendChild(pin);
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
