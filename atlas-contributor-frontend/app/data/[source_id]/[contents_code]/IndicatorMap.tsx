"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type Map as MLMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { IndicatorKommuneValue } from "@/lib/indicators";

type Props = {
  values: IndicatorKommuneValue[];
  missing: { kommune_nr: string; kommune_name: string }[];
  contentsCode: string;
  unit: string | null;
  nullCount: number;
};

/** Yellow-orange-red sequential ramp, safe for choropleths. */
const PALETTE = [
  "#ffffcc",
  "#ffeda0",
  "#fed976",
  "#feb24c",
  "#fd8d3c",
  "#f03b20",
  "#bd0026",
];

export function IndicatorMap({
  values,
  missing,
  contentsCode: _contentsCode,
  unit,
  nullCount,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [selected, setSelected] = useState<IndicatorKommuneValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const numericValues = useMemo(
    () =>
      values
        .map((v) => v.value)
        .filter((v): v is number => v !== null && Number.isFinite(v)),
    [values],
  );

  const stops = useMemo(() => computeQuantileStops(numericValues, PALETTE), [
    numericValues,
  ]);

  const minVal = numericValues.length ? Math.min(...numericValues) : null;
  const maxVal = numericValues.length ? Math.max(...numericValues) : null;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
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

    const valueByCode = new Map(values.map((r) => [r.kommune_nr, r]));

    const wireUp = async () => {
      try {
        const resp = await fetch("/boundaries/kommuner-2024.geojson");
        if (!resp.ok) throw new Error(`boundaries ${resp.status}`);
        const raw = (await resp.json()) as GeoJSON.FeatureCollection<
          GeoJSON.Geometry,
          Record<string, unknown>
        >;
        for (const f of raw.features) {
          const code = String(f.properties["kommunenummer"] ?? "");
          const row = valueByCode.get(code);
          f.properties["kommune_nr"] = code;
          f.properties["kommune_name"] =
            row?.kommune_name ?? f.properties["kommunenavn"] ?? code;
          f.properties["value"] = row?.value ?? null;
          f.properties["status"] = row?.status ?? null;
        }

        map.addSource("kommuner", { type: "geojson", data: raw });

        map.addLayer({
          id: "kommune-fill",
          type: "fill",
          source: "kommuner",
          paint: {
            "fill-color": buildColorExpression(stops),
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
          const row = valueByCode.get(code);
          // Even kommuner without data can be clicked — synthesize a row
          // so the sidebar explains the gap.
          setSelected(
            row ?? {
              kommune_nr: code,
              kommune_name: String(f.properties?.["kommune_name"] ?? code),
              fylke_name: null,
              value: null,
              status: null,
            },
          );
          map.setFilter("kommune-stroke-hover", ["==", "kommune_nr", code]);
        });
        map.on("mouseenter", "kommune-fill", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "kommune-fill", () => {
          map.getCanvas().style.cursor = "";
        });

        map.fitBounds(
          [
            [4.0, 57.5],
            [31.5, 71.5],
          ],
          { padding: 20, animate: false },
        );
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
        gridTemplateColumns: "minmax(0, 1fr) 22rem",
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
          aria-label="Norges-kart som viser indikatoren per kommune"
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
        {stops.length > 1 && (
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
              fontSize: "0.75rem",
              lineHeight: 1.4,
              maxWidth: "20rem",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
              {unit ? `Fargelagt etter verdi (${unit})` : "Fargelagt etter verdi"}
              {" — kvantiler"}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
              }}
            >
              {stops.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    fontSize: "0.65rem",
                    color: "#555",
                  }}
                >
                  <div
                    style={{
                      width: "1.75rem",
                      height: "0.7rem",
                      background: s.color,
                      border: "1px solid #ccc",
                    }}
                  />
                  <span>{formatStopLabel(s.value)}</span>
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  marginLeft: "0.25rem",
                  fontSize: "0.65rem",
                  color: "#555",
                }}
              >
                <div
                  style={{
                    width: "1.75rem",
                    height: "0.7rem",
                    background: "#e8e8e8",
                    border: "1px solid #ccc",
                  }}
                />
                <span>ingen</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <aside
        style={{
          padding: "0.75rem 1rem",
          border: "1px solid #e5e5e5",
          borderRadius: "6px",
          background: "#fafafa",
          overflowY: "auto",
          fontSize: "0.9rem",
        }}
      >
        <section style={{ marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.35rem" }}>
            Datakvalitet
          </h2>
          <dl style={{ margin: 0 }}>
            <DetailRow label="Kommuner med verdi">
              {values.length - nullCount} / {values.length}
            </DetailRow>
            <DetailRow label="Kommuner uten verdi">{nullCount}</DetailRow>
            <DetailRow label="Aktive kommuner helt uten data">
              {missing.length}
            </DetailRow>
            <DetailRow label="Min / maks">
              {minVal != null && maxVal != null
                ? `${formatNum(minVal)} / ${formatNum(maxVal)}${unit ? ` ${unit}` : ""}`
                : "—"}
            </DetailRow>
          </dl>
        </section>

        {missing.length > 0 && (
          <section style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.9rem", margin: "0 0 0.25rem" }}>
              Mangler helt ({missing.length})
            </h3>
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.1rem",
                color: "#666",
                fontSize: "0.85rem",
                maxHeight: "9rem",
                overflowY: "auto",
              }}
            >
              {missing.map((m) => (
                <li key={m.kommune_nr}>
                  {m.kommune_name}{" "}
                  <code style={{ color: "#888", fontSize: "0.8rem" }}>
                    {m.kommune_nr}
                  </code>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 style={{ fontSize: "0.9rem", margin: "0 0 0.25rem" }}>
            Valgt kommune
          </h3>
          {selected ? (
            <>
              <div style={{ fontWeight: 600 }}>
                {selected.kommune_name}{" "}
                <code style={{ color: "#888", fontSize: "0.8rem" }}>
                  {selected.kommune_nr}
                </code>
              </div>
              <div style={{ color: "#555", fontSize: "0.85rem" }}>
                {selected.fylke_name ?? "—"}
              </div>
              <div style={{ marginTop: "0.4rem", fontSize: "1.2rem" }}>
                {selected.value != null
                  ? `${formatNum(selected.value)}${unit ? ` ${unit}` : ""}`
                  : selected.status ?? "Ingen verdi"}
              </div>
              <a
                href={`/kommuner/${selected.kommune_nr}`}
                style={{ fontSize: "0.85rem" }}
              >
                Alle indikatorer for denne kommunen →
              </a>
            </>
          ) : (
            <p style={{ color: "#666", margin: 0 }}>Klikk en kommune.</p>
          )}
        </section>
      </aside>
    </div>
  );
}

// ---- helpers ----

type ColorStop = { value: number; color: string };

function computeQuantileStops(
  values: number[],
  palette: readonly string[],
): ColorStop[] {
  if (values.length === 0 || palette.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const stops: ColorStop[] = [];
  // Evenly spaced quantile positions, one per palette colour, starting at 0
  // (so the lowest bucket starts at min) and stepping through.
  for (let i = 0; i < palette.length; i++) {
    const q = i / palette.length; // 0, 1/N, 2/N, ..., (N-1)/N
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    const a = sorted[lo] ?? sorted[0] ?? 0;
    const b = sorted[hi] ?? sorted[sorted.length - 1] ?? 0;
    const frac = pos - lo;
    const value = a * (1 - frac) + b * frac;
    stops.push({ value, color: palette[i]! });
  }
  return stops;
}

function buildColorExpression(
  stops: ColorStop[],
): maplibregl.ExpressionSpecification {
  if (stops.length === 0) {
    return "#e8e8e8" as unknown as maplibregl.ExpressionSpecification;
  }
  // [case [== value null] greyed-out [interpolate linear value stop1 color1 stop2 color2 ...] ]
  const interp: unknown[] = [
    "interpolate",
    ["linear"],
    ["to-number", ["get", "value"]],
  ];
  for (const s of stops) interp.push(s.value, s.color);
  return [
    "case",
    ["==", ["get", "value"], null],
    "#e8e8e8",
    interp,
  ] as unknown as maplibregl.ExpressionSpecification;
}

function formatStopLabel(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString("nb-NO", { maximumFractionDigits: 0 });
  }
  return n.toLocaleString("nb-NO", { maximumFractionDigits: 1 });
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString("nb-NO", { maximumFractionDigits: 0 });
  }
  return n.toLocaleString("nb-NO", { maximumFractionDigits: 2 });
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0.2rem 0",
        borderBottom: "1px dotted #eee",
      }}
    >
      <dt style={{ color: "#555" }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 500,
        }}
      >
        {children}
      </dd>
    </div>
  );
}
