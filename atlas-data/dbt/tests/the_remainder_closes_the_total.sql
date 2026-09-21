{#
  🔴 PLACED + REMAINDER MUST EQUAL THE TOTAL. Assert the decomposition, not the
  parts.

  `unattributed_totals` shipped on 2026-09-21 naming 7 489 of 7 532
  unattributable organisations. The missing 43 carry kommune_nr = 2100 —
  Svalbard — which is a real kommune_nr and not one of the 357 current ones, so
  neither relation counted them. ⚠️ Nothing errored, no count looked odd, and
  `total_value` was correct. The only way to see it was to do the arithmetic the
  relation exists to support and notice it did not close. A consumer did that on
  first read (urb-agents #1318).

  🔵 ops-dev's framing, which is the general fix and the reason this test is
  here rather than a third `reason` value: anywhere Atlas partitions a
  population into PLACED and REMAINDER, the two should be asserted to sum to the
  measured total. Adding a bucket fixes today; asserting the sum fixes the class.

  ⚠️ This is the test that would have caught it on day one, and I did not write
  it — I wrote tests for the grain and the columns of each part, and none for
  the relationship between them. A partition has an invariant and it is not the
  parts.
#}
with placed as (
  select coalesce(sum(active_count), 0)::numeric as v
  from {{ ref('mart_kommune_ngo_totals') }}
),

remainder as (
  select
    coalesce(sum(unattributed_value), 0)::numeric as v,
    count(distinct total_value)                   as distinct_totals,
    max(total_value)::numeric                     as claimed
  from {{ ref('mart_unattributed_totals') }}
  where relation = 'kommune_ngo_totals'
    and measure  = 'active_count'
)

select
  p.v                as placed,
  r.v                as remainder,
  p.v + r.v          as summed,
  r.claimed          as claimed_total,
  p.v + r.v - r.claimed as shortfall,
  case when r.distinct_totals > 1
       then 'rows for one (relation, measure) disagree about total_value'
       else 'placed + remainder does not equal total_value'
  end                as why
from placed p, remainder r
-- 🔵 Both failure modes in one test: the sum not closing, and the rows
-- disagreeing about what the total even is. The second would make the first
-- unmeaningful, so checking it here rather than trusting max().
where p.v + r.v <> r.claimed
   or r.distinct_totals > 1
