# talk/ — fleet messages (TALK protocol v2)

Messages between agents live here, one file per topic, named
`for-<recipient>-<topic>.md`. Rounds **append** under `## Round N`; nothing is
overwritten and nothing is deleted — closed loops move to `done/`.

The protocol itself is [TALK.md](../TALK.md), which is a **mirror**. Edit it in
`terchris/home` → `ai-developer/TALK.md` only; a change made here is lost at the next
sync.

## ⚠️ Excluded from the published site, deliberately

This directory sits inside the Docusaurus docs root, so without an explicit exclude
every fleet message would be published at `atlas.sovereignsky.no`. `docusaurus.config.ts`
excludes `**/ai-developer/talk/**` for that reason. **If you move or rename this folder,
move the exclude with it.**

## The v1 messages

`plans/talk/` holds `talk.md`, `talk1.md`, `talk2.md` — the superseded
append-to-a-shared-file model. Kept for history, not for use. v2 exists because three
repos described that model differently and disagreed with each other.
