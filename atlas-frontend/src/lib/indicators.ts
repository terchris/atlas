import { sql } from "./db";

/** Summary row for the indicator index — one per (source_id, contents_code). */
export type IndicatorSummary = {
  source_id: string;
  contents_code: string;
  contents_label: string | null;
  latest_year: number;
  kommuner_with_value: number;
  kommuner_with_null: number;
  min_value: number | null;
  max_value: number | null;
  upstream_updated: Date;
};

/** One kommune's value for a specific indicator at the latest year. */
export type IndicatorKommuneValue = {
  kommune_nr: string;
  kommune_name: string;
  fylke_name: string | null;
  value: number | null;
  status: string | null;
};

/**
 * List every indicator in fact_kommune_indicators with its latest-year
 * coverage stats. Source of truth for the data-explorer index page.
 */
export async function listIndicators(): Promise<IndicatorSummary[]> {
  return sql<IndicatorSummary[]>`
    with latest as (
      select source_id, contents_code, max(year) as latest_year
      from marts.fact_kommune_indicators
      group by source_id, contents_code
    )
    select
      f.source_id,
      f.contents_code,
      max(f.contents_label) as contents_label,
      l.latest_year,
      count(*) filter (where f.value is not null and f.kommune_is_active)::int as kommuner_with_value,
      count(*) filter (where f.value is null and f.kommune_is_active)::int as kommuner_with_null,
      min(f.value)::float as min_value,
      max(f.value)::float as max_value,
      max(f.updated_at) as upstream_updated
    from marts.fact_kommune_indicators f
    join latest l on l.source_id = f.source_id
                  and l.contents_code = f.contents_code
                  and f.year = l.latest_year
    group by f.source_id, f.contents_code, l.latest_year
    order by f.source_id, f.contents_code
  `;
}

/** Values for a single indicator at its latest year, one row per kommune-level row. */
export async function loadIndicatorValues(
  source_id: string,
  contents_code: string,
): Promise<IndicatorKommuneValue[]> {
  return sql<IndicatorKommuneValue[]>`
    with latest as (
      select max(year) as year
      from marts.fact_kommune_indicators
      where source_id = ${source_id} and contents_code = ${contents_code}
    )
    select
      kommune_nr,
      kommune_name,
      fylke_name,
      value::float as value,
      status
    from marts.fact_kommune_indicators f
    join latest l on f.year = l.year
    where f.source_id = ${source_id}
      and f.contents_code = ${contents_code}
      and f.kommune_is_active
    order by kommune_nr
  `;
}

/**
 * Active kommuner that have no value for this indicator at the latest year.
 * The "coverage gap" list on the data-explorer sidebar.
 */
export async function listMissingKommuner(
  source_id: string,
  contents_code: string,
): Promise<{ kommune_nr: string; kommune_name: string }[]> {
  return sql<{ kommune_nr: string; kommune_name: string }[]>`
    with latest as (
      select max(year) as year
      from marts.fact_kommune_indicators
      where source_id = ${source_id} and contents_code = ${contents_code}
    ),
    have_value as (
      select distinct kommune_nr
      from marts.fact_kommune_indicators f, latest l
      where f.source_id = ${source_id}
        and f.contents_code = ${contents_code}
        and f.year = l.year
        and f.value is not null
    )
    select k.kommune_nr, k.kommune_name
    from marts.dim_kommune k
    where k.is_active
      and not exists (select 1 from have_value hv where hv.kommune_nr = k.kommune_nr)
    order by k.kommune_nr
  `;
}

/**
 * Human-readable labels. Purely presentational — keep here so pages stay clean.
 * Anything not in the map falls back to the raw `source_id` / `contents_code`.
 */
export function sourceDisplayName(source_id: string): string {
  switch (source_id) {
    case "ssb-08764":
      return "SSB 08764 — Barn i lavinntektshusholdning";
    case "ssb-06913":
      return "SSB 06913 — Befolkningsendringer";
    case "ssb-06944":
      return "SSB 06944 — Husholdningsinntekt";
    case "fhi-bor-alene":
      return "FHI 187 — Personer som bor alene";
    default:
      return source_id;
  }
}

export function sourceAttribution(source_id: string): {
  text: string;
  url?: string;
} {
  switch (source_id) {
    case "ssb-08764":
      return {
        text: "Kilde: Statistisk sentralbyrå, tabell 08764",
        url: "https://www.ssb.no/statbank/table/08764",
      };
    case "ssb-06913":
      return {
        text: "Kilde: Statistisk sentralbyrå, tabell 06913",
        url: "https://www.ssb.no/statbank/table/06913",
      };
    case "ssb-06944":
      return {
        text: "Kilde: Statistisk sentralbyrå, tabell 06944",
        url: "https://www.ssb.no/statbank/table/06944",
      };
    case "fhi-bor-alene":
      return {
        text: "Kilde: Folkehelseinstituttet, Folkehelsestatistikk tabell 187",
        url: "https://statistikk.fhi.no/",
      };
    default:
      return { text: `Kilde: ${source_id}` };
  }
}

/** Heuristic-ish unit detection from the content code. Good enough for v1. */
export function unitForContentCode(
  source_id: string,
  contents_code: string,
): string | null {
  if (contents_code === "SamletInntekt" || contents_code === "InntSkatt") return "NOK";
  if (contents_code === "AntallHushold") return "husholdninger";
  if (contents_code === "Personer" || contents_code === "Personer1" ||
      contents_code === "TELLER" || contents_code === "Folkemengde") return "personer";
  if (/EUskala|OECDskala|RATE/.test(contents_code)) return "%";
  if (contents_code === "SMR") return "SMR (100 = snitt)";
  return null;
}
