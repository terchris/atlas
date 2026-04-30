"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MLMap,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { KommuneRow } from "./page";

type Props = {
  data: KommuneRow[];
  year: number | null;
};

/**
 * Choropleth breakpoints for EU-60 child-poverty share. Tuned from observed
 * distribution of Norwegian kommuner (national median ~9-10%, top tail ~20%).
 */
const COLOR_STOPS: [number, string][] = [
  [0, "#f7f7f7"],
  [5, "#fee5d9"],
  [8, "#fcbba1"],
  [11, "#fc9272"],
  [14, "#ef3b2c"],
  [20, "#99000d"],
];

export function BarnefattigdomMap({ data, year }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [selected, setSelected] = useState<KommuneRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      // Empty style — we add our own sources/layers below. Avoids needing
      // tile credentials for a simple choropleth view.
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "bg",
            type: "background",
            paint: { "background-color": "#ffffff" },
          },
        ],
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      },
      center: [15, 65],
      zoom: 3.5,
      maxZoom: 11,
      minZoom: 3,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    const dataByCode = new Map(data.map((r) => [r.kommune_nr, r]));

    const wireUp = async () => {
      try {
        const resp = await fetch("/boundaries/kommuner-2024.geojson");
        if (!resp.ok) {
          throw new Error(`boundaries fetch failed: ${resp.status}`);
        }
        const raw = (await resp.json()) as GeoJSON.FeatureCollection<
          GeoJSON.Geometry,
          Record<string, unknown>
        >;

        // Enrich each feature with the indicator value.
        for (const f of raw.features) {
          const code = String(f.properties["kommunenummer"] ?? "");
          const row = dataByCode.get(code);
          f.properties["kommune_nr"] = code;
          f.properties["kommune_name"] =
            row?.kommune_name ?? f.properties["kommunenavn"] ?? code;
          f.properties["value_pct"] = row?.value_pct ?? null;
          f.properties["personer"] = row?.personer ?? null;
        }

        map.addSource("kommuner", { type: "geojson", data: raw });

        map.addLayer({
          id: "kommune-fill",
          type: "fill",
          source: "kommuner",
          paint: {
            "fill-color": [
              "case",
              ["==", ["get", "value_pct"], null],
              "#e8e8e8",
              [
                "interpolate",
                ["linear"],
                ["to-number", ["get", "value_pct"]],
                ...COLOR_STOPS.flat(),
              ],
            ] as unknown as maplibregl.ExpressionSpecification,
            "fill-opacity": 0.9,
          },
        });
        map.addLayer({
          id: "kommune-stroke",
          type: "line",
          source: "kommuner",
          paint: { "line-color": "#444", "line-width": 0.3 },
        });
        map.addLayer({
          id: "kommune-stroke-hover",
          type: "line",
          source: "kommuner",
          filter: ["==", "kommune_nr", ""],
          paint: { "line-color": "#000", "line-width": 2 },
        });

        map.on("click", "kommune-fill", (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f) return;
          const code = String(f.properties?.["kommune_nr"] ?? "");
          const row = dataByCode.get(code) ?? null;
          setSelected(row);
          map.setFilter("kommune-stroke-hover", ["==", "kommune_nr", code]);
        });

        map.on("mouseenter", "kommune-fill", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "kommune-fill", () => {
          map.getCanvas().style.cursor = "";
        });

        // Fit to data bounds on first load.
        const src = map.getSource("kommuner") as GeoJSONSource | undefined;
        if (src) {
          // Compute a static Norway bbox; skipping dynamic bbox keeps it fast.
          map.fitBounds(
            [
              [4.0, 57.5], // SW
              [31.5, 71.5], // NE
            ],
            { padding: 20, animate: false },
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };

    map.on("load", () => {
      void wireUp();
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 20rem",
        gap: "1rem",
        height: "640px",
      }}
    >
      <div style={{ position: "relative", minWidth: 0 }}>
        <div
          ref={containerRef}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "6px",
            overflow: "hidden",
            border: "1px solid #e5e5e5",
          }}
          aria-label="Kart over Norge som viser barnefattigdom per kommune"
        />
        {error && (
          <div
            role="alert"
            style={{
              position: "absolute",
              top: "1rem",
              left: "1rem",
              padding: "0.5rem 0.75rem",
              background: "#fff",
              border: "1px solid #c00",
              borderRadius: "4px",
              color: "#c00",
            }}
          >
            Feil: {error}
          </div>
        )}
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: "0.75rem",
            left: "0.75rem",
            padding: "0.5rem 0.75rem",
            background: "rgba(255,255,255,0.95)",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "0.8rem",
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
            Andel barn i lavinntekt (EU-60)
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            {COLOR_STOPS.map(([stop, color]) => (
              <div
                key={stop}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  fontSize: "0.7rem",
                  color: "#555",
                }}
              >
                <div
                  style={{
                    width: "2rem",
                    height: "0.75rem",
                    background: color,
                    border: "1px solid #ccc",
                  }}
                />
                <span>{stop}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside
        style={{
          padding: "1rem",
          border: "1px solid #e5e5e5",
          borderRadius: "6px",
          background: "#fafafa",
          overflowY: "auto",
        }}
      >
        {selected ? (
          <>
            <h2 style={{ margin: 0 }}>{selected.kommune_name}</h2>
            <p style={{ margin: "0.25rem 0 1rem", color: "#555" }}>
              {selected.fylke_name ?? ""} fylke · Kommune {selected.kommune_nr}
            </p>
            <dl style={{ margin: 0 }}>
              <dt style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                Andel under EU-60 ({selected.year})
              </dt>
              <dd style={{ margin: "0 0 0.75rem", fontSize: "1.5rem" }}>
                {selected.value_pct != null
                  ? `${selected.value_pct.toLocaleString("nb-NO", {
                      maximumFractionDigits: 1,
                    })} %`
                  : "—"}
              </dd>
              <dt style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                Antall barn under 18 år i lavinntekt
              </dt>
              <dd style={{ margin: "0 0 0.75rem", fontSize: "1.1rem" }}>
                {selected.personer != null
                  ? selected.personer.toLocaleString("nb-NO")
                  : "—"}
              </dd>
            </dl>
            <a
              href={`/kommuner/${selected.kommune_nr}`}
              style={{ fontSize: "0.9rem" }}
            >
              Se alle indikatorer for {selected.kommune_name} →
            </a>
          </>
        ) : (
          <p style={{ color: "#666", margin: 0 }}>
            Klikk en kommune på kartet for å se detaljer.
          </p>
        )}
      </aside>
    </div>
  );
}
