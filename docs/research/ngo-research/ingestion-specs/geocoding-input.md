# Spec: geocoding input — every place we know, one file, one general geocoder

Cross-cutting. **Prepared 2026-10-04; nothing is geocoded yet** (owner: prepare the dataset, build
the general method later). `npm run geocode-input` → `data/_geocoding/locations.csv`
(`reference-code/src/sources/geocode-input.ts`).

## Why one file

Every NGO publishes places differently: a visiting address in a `dl` (Røde Kors), a meeting venue
(Sanitetskvinnene), a `STED:` line on each activity page (LHL), only a kommune (4H, Mental Helse …).
The geocoder should not know any of that. It reads one table of places, writes a point and a
precision per row, and the result is joined back by `entity_id`.

## Columns

| Column | What |
|---|---|
| `location_id` | stable id of this (entity, place) |
| `ngo`, `entity_type`, `entity_id`, `entity_name` | what the place belongs to: a `chapter`, or an `activity` (`<chapter id>#<activity name>`) |
| `location_kind` | where the place comes from — see below |
| `address_kind` | `VISITING`, `MEETING_VENUE`, `POSTAL`, `REGISTERED` as the source states it |
| `line1`, `line2`, `postal_code`, `postal_place` | the address as published |
| `municipality_number` | the kommune, when known |
| `organization_number` | the join key for registry addresses |
| `existing_latitude`, `existing_longitude` | a point the source already publishes |
| `max_precision` | the most precise point this row may ever get: `exact`, `postal_code`, `kommune` |
| `contains_personal_data` | `true` for a `c/o` line (it names a person) |
| `source_url` | the page the place was read from |

## Kinds, strongest first

| Kind | Source | `max_precision` |
|---|---|---|
| `SITE_ADDRESS` | the address on the NGO's chapter page | `exact` for a visiting address or meeting venue; `postal_code` for a postal address or a `c/o` line |
| `ACTIVITY_VENUE` | where an activity happens (LHL's `STED:`) | `exact` |
| `EXISTING_POINT` | coordinates the source publishes (Sanitetskvinnene) | `exact` — kept, not redone |
| `REGISTRY_JOIN` | the organisation number; the consumer joins **its own** Brreg address (Atlas: `dim_brreg_enhet`) | `postal_code` — a registered address is often a volunteer's home |
| `KOMMUNE` | the chapter's kommune — always, as the last fallback | `kommune` (centroid) |

A chapter may have several rows; the geocoder takes the strongest that resolves, and never places a
row more precisely than its `max_precision`.

## Measured (2026-10-04, after the Speiderforbundet crawl and the leftover pass)

8 782 rows: `REGISTRY_JOIN` 3 078 · `KOMMUNE` 2 705 · `SITE_ADDRESS` 1 775 ·
`EXISTING_POINT` 880 · `ACTIVITY_VENUE` 344. Of 4 021 chapters, **1 654 can reach an exact
point**, 1 758 a postal-code area, and 609 have no place at all (page-only units with
neither address nor kommune: kirkens-bymisjon 282, nasjonalforeningen 115, fire-h 98, lhl 54, diabetesforbundet 42, others 18).
32 rows carry a `c/o` line. 266 of the 344 activity venues are a building name without an address
("LHL huset Dverberg") — they need a place search, not an address lookup. Speiderforbundet's 332
groups come with coordinates from blispeider.no (`EXISTING_POINT`).

## The general geocoder, later (R9)

1. `EXISTING_POINT` → keep.
2. `SITE_ADDRESS` / `ACTIVITY_VENUE` with a postal code → Kartverket's address API
   (`ws.geonorge.no/adresser/v1/sok`), capped at `max_precision`.
3. A venue name without an address → Kartverket's place-name search, within the chapter's kommune;
   accept only a single hit.
4. `REGISTRY_JOIN` → the registry's postal code → the postal-code area's centroid.
5. `KOMMUNE` → the kommune's centroid.

Store per row: point, achieved precision, method, and the geocoder's own match score, so a
consumer can show "within this postal area" honestly and `search_nearby` can sort by real distance.
