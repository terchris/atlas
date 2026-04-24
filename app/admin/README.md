# `/admin/*` — internal validation pages

Pages under `/admin/*` are **engineering-validation surfaces**, not user-facing. Each ingest PLAN ships a small `/admin/supply/<source-slug>` page that exercises the staging→marts joins and shows expected-vs-actual row counts so we never ingest data we can't see.

Conventions:

- `<meta name="robots" content="noindex" />` on every page (set via Next.js `metadata` export).
- Not linked from public navigation. Operators reach these pages by typing the URL.
- Plain styling — Tailwind utilities are fine, but no need for `Card`/`Tabs` polish. Tables and stat blocks beat a designed page.
- Server Components only — these pages render fresh on every request, no caching.
- All queries go through `src/lib/db.ts`; the SELECT-only `marts.*` role applies. Pages that need `raw.*` access either degrade gracefully when the role can't see the schema, or document the elevated role they require.
