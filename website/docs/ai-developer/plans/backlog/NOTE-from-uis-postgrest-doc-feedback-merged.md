# NOTE — UIS PostgREST documentation merged; Atlas verification welcome (2026-04-28)

A note from the UIS contributor to the Atlas team.

**Trigger**: This is a follow-up to your [`NOTE-from-atlas-postgrest-verification.md`](../../../../../urbalurba-infrastructure/website/docs/ai-developer/plans/backlog/NOTE-from-atlas-postgrest-verification.md) (2026-04-29). All four findings are addressed; the work landed on `main` of `helpers-no/urbalurba-infrastructure` via [PR #129](https://github.com/helpers-no/urbalurba-infrastructure/pull/129).

**TL;DR**: PostgREST documentation is shipped; PostgREST is **not yet deployable** (PLAN-002 ships that). Three things would be useful to hear back on before PLAN-002 starts.

---

## What shipped in PR #129

- `provision-host/uis/services/integration/service-postgrest.sh` — metadata-only entry. PostgREST appears in `./uis list` as `INTEGRATION ❌ Not deployed`. Deploy errors by design.
- `website/docs/services/integration/postgrest.md` — the full service page, including two **new** subsections added in response to your verification:
  - **"Embedded resources require real FK constraints"** — your Finding 2.
  - **"Column descriptions don't propagate to wrapper views"** — your Finding 4.
- `website/docs/ai-developer/plans/backlog/INVESTIGATE-postgrest.md` — now carries an **Addendum: 2026-04-29** at the top, recording the `ALTER DEFAULT PRIVILEGES` requirement (your Finding 1). Existing 23 decisions unchanged per the addendum protocol.
- `website/docs/ai-developer/plans/backlog/PLAN-002-postgrest-deployment.md` — the implementation plan; Phase 2.4 SQL block now includes the `ALTER DEFAULT PRIVILEGES` line, tagged load-bearing with a back-reference to your reproduction.
- `website/docs/ai-developer/plans/backlog/NOTE-to-atlas-postgrest-feedback-incorporated.md` — the per-finding response file. Read this for the longer-form answer to each of your findings.

## What we'd like you to verify before PLAN-002 starts

Three specific reads, each cheap:

1. **Addendum text at the top of `INVESTIGATE-postgrest.md`** — does the "failure mode" paragraph capture your reproduction faithfully? (Especially the silent-401 / empty-result symptom.)
2. **The two new subsections in `postgrest.md`** — does the FK-embeds wording match your three-row test table? Wording differs slightly from the suggested text in your NOTE; we tightened it and named your skip-embeds choice as the working example.
3. **The SQL in `PLAN-002-postgrest-deployment.md` Phase 2.4** — is `ALTER DEFAULT PRIVILEGES IN SCHEMA <schema> GRANT SELECT ON TABLES TO <app>_web_anon;` positioned correctly (after `GRANT SELECT ON ALL TABLES`)?

If something is off in any of those, drop another `NOTE-from-atlas-*.md` file in the UIS repo's `website/docs/ai-developer/plans/backlog/` and the UIS contributor will fold it in before PLAN-002 implementation begins. Existing decisions stay frozen; only the addendum and PLAN-002 change.

## Coordination state

| Step | UIS state | Atlas state |
|---|---|---|
| **PLAN-001 (UIS)** — documentation gate | ✅ Merged today (2026-04-28, PR #129) | — |
| **PLAN-004 (Atlas)** — `api_v1` wrapper layer | — | In progress per your last NOTE |
| **PLAN-002 (UIS)** — PostgREST deployment | Backlog; ready to start once your re-review lands | Blocks Atlas's `./uis configure postgrest --app atlas` |
| **PLAN-D.2 / PLAN-005 (Atlas)** — post-deploy smoke test | — | Pending PLAN-002 (UIS) |

When PLAN-002 ships, `./uis configure postgrest --app atlas --schema api_v1 --url-prefix api-atlas` followed by `./uis deploy postgrest --app atlas` will wire your `api_v1` views to `http://api-atlas.localhost`. The four smoke checks from your NOTE's "Coordination next steps" section are the natural validation; the UIS contributor will signal in the NOTE chain when that's ready.

— signed, the UIS contributor (via Claude Code agent), 2026-04-28
