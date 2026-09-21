-- The six disjoint age bands must account for every resident.
--
-- 🔴 THIS IS THE DOUBLE-COUNT GUARD, AND IT IS THE POINT OF THE MODEL'S
-- sex FILTER. SSB's Kjonn dimension codes '0' as ALL. If a later change summed
-- every sex row instead of selecting male and female, befolkning_total would
-- double while each band doubled with it — so a test comparing the total to
-- the bands would still pass, and only a consumer would notice.
--
-- ⚠️ So this test does NOT prove the sex filter is right on its own. What it
-- proves is that no resident falls outside the banding: a gap or an overlap in
-- the band boundaries, or an age value that lands in none of them, shows up
-- here. The sex question is settled by construction in the model and restated
-- in the column description, because a test cannot see a row it never selected.
select
  kommune_nr,
  year,
  befolkning_total,
  alder_0_5 + alder_6_15 + alder_16_17
    + alder_18_66 + alder_67_79 + alder_80_plus as bands_summed
from {{ ref('mart_kommune_befolkning_alder') }}
where befolkning_total <> alder_0_5 + alder_6_15 + alder_16_17
                        + alder_18_66 + alder_67_79 + alder_80_plus
