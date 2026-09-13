# Brreg typed client

Shared client for the Brønnøysundregistrene Enhetsregister open API. Built on `openapi-fetch` + types generated from Brreg's official OpenAPI spec.

Used by:

- `src/seed-sources/brreg-enheter/` — generic cross-NGO Brreg ingest driven by `landscape.json`. See [PLAN-001-brreg-enheter](../../../../../website/docs/ai-developer/plans/completed/PLAN-001-brreg-enheter.md).
- Future Brreg-sourced ingests (potential retrofit of `brreg-icnpo`; any new endpoint-specific fetches).

## Files

- **`schema.ts`** — generated from **`https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/openapi.json`** via `openapi-typescript`. Committed to the repo (not gitignored) so a fresh clone type-checks without a codegen step.

  🔴 **The source changed on 2026-09-13, and the old one was abandoned upstream.** It used to be generated from `raw.githubusercontent.com/brreg/openAPI/master/specs/enhetsregisteret.json` — a 35 KB spec with **11 paths and zero query parameters** that Brreg stopped updating. The live spec is 204 KB, **38 paths**, and its changelog runs to June 2026. Everything below under "what changed" is a consequence of that swap, and none of it is cosmetic.

### What the swap changed, and why it is not a drop-in

| | stale spec | live spec |
|---|---|---|
| `servers` | `https://data.brreg.no/enhetsregisteret/api` | `https://data.brreg.no` |
| path keys | `/enheter` | `/enhetsregisteret/api/enheter` |
| entity path param | `{organisasjonsnummer}` | `{enhetorgnr}` |
| search query params | **0 declared** | **47 declared, on the operation** |
| `organisasjonsform` | `string` | `string[]` |

⚠️ **The base URL and the path keys moved together and must stay in step.** Change one without the other and every request goes to a URL either missing the prefix or carrying it twice. TypeScript catches the path-key half; it cannot catch a base URL that is merely wrong.

⚠️ **The query-param types now resolve through `["get"]["parameters"]`, not `["parameters"]`.** The live spec declares its 47 search parameters on the *operation*; the path item declares `query?: never`. The stale spec did the opposite — which is why this README used to claim the query side was "fully type-checked". **It was checked against a spec that described no parameters at all.**

🔵 **`organisasjonsform` taking an array is a capability, not a rename**: Brreg accepts several organisation forms in one search and the old spec could not express it. Verified against the live service on 2026-09-13 — `navn=Røde Kors, organisasjonsform=["FLI"]` returned 754 matches, all `FLI`, so the filter is applied rather than ignored.
- **`client.ts`** — configured `brregClient` (base URL `https://data.brreg.no/enhetsregisteret/api`), a `HalResponse<T>` helper type, a `paginate()` async-generator helper, and a convenience `fetchEnheter(query)` wrapper.

## Regenerating the schema

Run when Brreg updates the upstream spec:

```bash
npm run refresh:brreg-schema
```

Commit the updated `schema.ts` as part of the same PR that consumes any new fields. Review the diff — Brreg occasionally deprecates fields or changes query-param shapes.

## Why cast the response

Brreg's OpenAPI spec describes query params in detail but types all response bodies as `string`. The actual responses are structured HAL JSON with `_embedded`, `_links`, and `page` envelopes. Rather than fight the typed client, we apply a small local `HalResponse<T>` interface and cast at the boundary (inside `fetchEnheter`). The caller gets a typed `HalResponse<Enhet>`; the query-params side is genuinely type-checked against the live spec's 47 parameters (since 2026-09-13 — see above for what that claim used to be worth).

If Brreg updates their spec to describe the HAL shape properly, we remove the cast.

## Pagination pattern

`paginate()` walks any paginated HAL endpoint that follows the `{_embedded, page}` contract:

```ts
import { fetchEnheter, paginate, type Enhet } from "../../lib/brreg/client.js";

for await (const batch of paginate<Enhet>(
  (page) => fetchEnheter({
    navn: "norsk folkehjelp",
    organisasjonsform: "FLI",
    size: 100,
    page,
  }),
  "enheter", // the _embedded key for /enheter responses
)) {
  for (const enhet of batch) {
    // enhet.organisasjonsnummer, enhet.navn, enhet.organisasjonsform?.kode, …
  }
}
```

The `_embedded` key varies per endpoint (`"enheter"` for `/enheter`, `"underenheter"` for `/underenheter`, etc.). Pass the right one when calling.
