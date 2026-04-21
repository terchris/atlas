/** Shared types for the Atlas frontend. These mirror the `marts.*` schema
 *  that dbt produces — see `atlas-data-repo/dbt/models/` for authoritative
 *  definitions. Keep these aligned by hand until we auto-generate types.
 */

export type DimKommune = {
  kommune_nr: string;
  kommune_name: string;
  kommune_name_alt: string | null;
  fylke_nr: string;
  notes: string | null;
  valid_from: Date | null;
  valid_to: Date | null;
  is_active: boolean;
  updated_at: Date;
};

export type DimFylke = {
  fylke_nr: string;
  fylke_name: string;
  fylke_name_alt: string | null;
  notes: string | null;
  valid_from: Date | null;
  valid_to: Date | null;
  is_active: boolean;
  updated_at: Date;
};

export type FactKommuneIndicator = {
  source_id: string;
  kommune_nr: string;
  kommune_name: string;
  fylke_nr: string;
  fylke_name: string | null;
  year: number;
  contents_code: string;
  contents_label: string | null;
  value: string | null; // numeric is returned as string by postgres.js
  status: string | null;
  kommune_is_active: boolean;
  updated_at: Date;
};
