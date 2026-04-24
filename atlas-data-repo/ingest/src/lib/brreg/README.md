# Brreg typed client

Shared client for the Brønnøysundregistrene Enhetsregister open API. Built on `openapi-fetch` + types generated from Brreg's official OpenAPI spec.

Used by:

- `src/seed-sources/brreg-enheter/` — generic cross-NGO Brreg ingest driven by `landscape.json`. See [PLAN-001-brreg-enheter](../../../../../docs/ai-developer/plans/completed/PLAN-001-brreg-enheter.md).
- Future Brreg-sourced ingests (potential retrofit of `brreg-icnpo`; any new endpoint-specific fetches).

## Files

- **`schema.ts`** — generated from `https://raw.githubusercontent.com/brreg/openAPI/master/specs/enhetsregisteret.json` via `openapi-typescript`. Committed to the repo (not gitignored) so a fresh clone type-checks without a codegen step.
- **`client.ts`** — configured `brregClient` (base URL `https://data.brreg.no/enhetsregisteret/api`), a `HalResponse<T>` helper type, a `paginate()` async-generator helper, and a convenience `fetchEnheter(query)` wrapper.

## Regenerating the schema

Run when Brreg updates the upstream spec:

```bash
npm run refresh:brreg-schema
```

Commit the updated `schema.ts` as part of the same PR that consumes any new fields. Review the diff — Brreg occasionally deprecates fields or changes query-param shapes.

## Why cast the response

Brreg's OpenAPI spec describes query params in detail but types all response bodies as `string`. The actual responses are structured HAL JSON with `_embedded`, `_links`, and `page` envelopes. Rather than fight the typed client, we apply a small local `HalResponse<T>` interface and cast at the boundary (inside `fetchEnheter`). The caller gets a typed `HalResponse<Enhet>`; the query-params side stays fully type-checked (that's where the real value is).

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
