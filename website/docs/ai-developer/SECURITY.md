---
mdx:
  format: md
---

# Security

Read this before writing anything sensitive into the repository or the published site.

---

## Secrets

Secrets never enter git. Tokens, kubeconfig, passwords and private keys stay on the host.
Connection details live in `atlas-data/ingest/.env`, which is gitignored and must stay that way.
This includes fleet records: never put a credential in `terchris/urb-agents`.

Put the *location* of a credential in a message, never the credential.

## 🔴 This repository is PUBLIC

`terchris/atlas` is world-readable on github.com, and so is the published site. This is the single
most important constraint in this document, because it is the one that is easy to violate while
writing something otherwise reasonable.

**Do not commit** internal topology, host or cluster addresses, capacity figures, or runtime
identifiers such as pod names. A planning document that mentions "the run logs are on pod
`<name>`" leaks a runtime identifier; write "ask ops for the run logs" instead.

A Docusaurus `exclude` does **not** help. It stops a file being *rendered*; it does not stop the
file being *readable* on github.com. An exclude protects the site build, never the contents.

⚠️ There is an open, unanswered question about material already published here that names
infrastructure. Do not treat existing precedent in this repo as permission — when in doubt, leave
the detail out and ask.

## The published data contract

`api_v1` is a public API. Adding to it is public exposure, which is a human's decision, not an
agent's. The same applies to opening a schema that was previously private.

`private_marts.*` holds Red Cross personal data and stays gated. Nothing in it is exposed through
PostgREST, and no sample of it belongs in documentation, a test fixture, or a commit message.

## Published docs

The site at `atlas.sovereignsky.no` is public and unauthenticated. There is no access gate, no
oauth2-proxy, and no filename-prefix convention that hides a page. If a page is in `website/docs/`
it is public the moment it ships.
