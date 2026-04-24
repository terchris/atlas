# sample-ngo/orgunits/ — synthetic org-unit data

Placeholder for the orgunits ingest (not yet wired). Real NGO equivalents
under `atlas-private-data-repo/<ngo>/orgunits/` carry the NGO's own
hierarchical org-unit registry — the source-of-truth for which lokallag
exist, where they sit in the distrikt/region hierarchy, etc.

For FRR-using NGOs, org units also appear in `frr/` with
`ressurstype='organisatorisk enhet'`. The orgunits feed adds NGO-internal
structure that FRR doesn't carry (e.g. coverage area, contact patterns).

`sample-orgunits.json` is a tiny synthetic example matching the shape Atlas
expects; refine when the orgunits ingest gets implemented.
